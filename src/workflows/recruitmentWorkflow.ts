import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as activities from '../activities/RecruitmentActivities';
import { EvaluationResponse } from '../activities/RecruitmentActivities';
import { getGmailClient } from '../utils/OAuth/gmailClient';
import { threadId } from 'worker_threads';

const {
  askAI,
  sendEmail,
  sendEmailAsReply,
  fetchRelevantJobs,
  checkLabelExists,
  addLabelToEmail,
  scheduleReminder,
  extractAttachments,
  getAttachmentData,
  extractTextFromDOCX,
  extractTextFromPDF,
  evaluateResume,
  sendEmailResponse,
  sendUnsupportedFileResponse,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

interface File {
  filename: string;
  mimeType: string;
  attachment: string;
  size: number;
}

type Attachments = File[];

export async function RecruitmentWorkflow(
  jobRelatedEmails?: {
    id: string;
    subject: string;
    snippet: string;
    payload: any;
    labelIds: string[];
    threadId: string;
    messageId: string;
  }[],
) {
  if (!jobRelatedEmails || jobRelatedEmails.length === 0) {
    console.log('No job related emails found', jobRelatedEmails);
    return;
  }

  for (const email of jobRelatedEmails) {
    if (!email.id) {
      console.log('No email id', email);
      return;
    }

    const alreadyHandledLabels = ['REJECTED', 'CONFIRMED', 'ADDITIONAL_INFORMATION_SENT'];
    const labelChecks = await Promise.all(
      alreadyHandledLabels.map((label) => checkLabelExists({ label, emailId: email.id })),
    );

    const hasBeenHandled = labelChecks.some(Boolean);
    if (hasBeenHandled) {
      console.log(`Email ${email.id} has already been handled.`);
      continue;
    }

    const candidateHeader = email.payload?.headers?.find((h: { name: string; value: string }) => h.name === 'From');
    if (!candidateHeader?.value) {
      console.warn('No sender email found in headers', email);
      continue;
    }
    const candidate = candidateHeader.value;

    if (!email.snippet) {
      const isRejected = await checkLabelExists({
        label: 'REJECTED',
        emailId: email.id,
      });
      if (isRejected) {
        console.log('Email already rejected', email);
        continue;
      }

      const emptySnippetEmail = {
        to: candidate,
        subject: 'Job Application Rejected - No Email Snippet',
        body: `Dear ${candidate},

      We appreciate your interest in joining our company. We take pride in thoroughly reviewing  theach application, but we require a cover letter to proceed. Unfortunately, it appears that your application is missing this critical information.

      Please consider reapplying with a cover letter that highlights your qualifications and interest in the position. We look forward to receiving your updated application.

      Best regards,
      Recruitment Team
      `,
      };

      await sendEmail(emptySnippetEmail);

      await addLabelToEmail({
        label: 'REJECTED',
        emailId: email.id,
      });

      continue;
    }
    const prompt = `As an AI assistant, your task is to deduce the job position a candidate is applying for at a company.

Utilize the details below:
- Subject of Email: "${email.subject}"
- Snippet from Email: "${email.snippet}"

Your response should be a JSON formatted as:

{
  "jobTitle": "Software Engineer"
}

If the job role is indeterminable, return:

{
  "jobTitle": ""
}`;

    const systemMessage =
      'You are an AI assistant in a recruitment automation platform. Your role is to determine the job position a candidate is applying for, using only the email subject and a brief snippet from their cover letter. Provide a JSON object with the inferred job title, ensuring that the job title is capitalized (e.g., "Python Developer" instead of "python developer"), or an empty string if the information is insufficient.';

    const { jobTitle } = await askAI({ prompt, systemMessage });

    if (!jobTitle) {
      console.log('No job title found', jobTitle);
      const isRejected = await checkLabelExists({
        label: 'REJECTED',
        emailId: email.id,
      });
      if (isRejected) {
        console.log(`Email ${email.id} has already been rejected.`);
        continue;
      }

      const rejectionEmail = {
        to: candidate,
        subject: 'Application Rejected - No Job Title Found',
        body: `Dear ${candidate},

        We regret to inform you that your application cannot be processed due to the absence of a specified job title in your application email. Please ensure that your application includes a clear job title in the subject line or cover letter.

        Thank you for your understanding.

        Best regards,
        Recruitment Team`,
      };
      await sendEmail(rejectionEmail);

      await addLabelToEmail({
        label: 'REJECTED',
        emailId: email.id,
      });

      continue;
    }

    // TODO: Now we need to query the db to get all the job openings.

    const jobs = await fetchRelevantJobs(jobTitle);

    if (jobs.length === 0) {
      const isRejected = await checkLabelExists({
        label: 'REJECTED',
        emailId: email.id,
      });
      if (isRejected) {
        console.log(`Email ${email.id} has already been rejected.`);
        continue;
      }

      const rejectionEmail = {
        to: candidate,
        subject: 'Application Rejected - No Matching Job Openings',
        body: `Dear ${candidate},

        We appreciate your interest in working with us and thank you for your application. Unfortunately, we do not have any current openings for the role of ${jobTitle}. Please feel free to reapply in the future if we have any openings that match your skills and interests.

        Best regards,
        Recruitment Team`,
      };

      await sendEmail(rejectionEmail);

      await addLabelToEmail({
        label: 'REJECTED',
        emailId: email.id,
      });
      continue;
    }

    // TODO: send a confirmation email to the user, that the email has been received.

    const confirmationEmail = {
      to: candidate,
      threadId: email.threadId,
      messageId: email.messageId,
      subject: `Application Received - Thank You for Applying for ${jobTitle}`,
      body: `Dear ${candidate},

      Thank you for applying for the role of ${jobTitle}. We have received your application and will review it as soon as possible.

      We appreciate the time you took to apply for this role, and we will be in touch soon to let you know the next steps in our process.

      Best regards,
      Recruitment Team`,
    };
    const isConfirmed = await checkLabelExists({
      label: 'CONFIRMED',
      emailId: email.id,
    });

    if (isConfirmed) {
      console.log(`Email ${email.id} has already been confirmed.`);
      continue;
    }

    await sendEmailAsReply(confirmationEmail);

    await addLabelToEmail({
      label: 'CONFIRMED',
      emailId: email.id,
      removeLabels: ['INBOX', 'UNREAD'],
    });

    // TODO: Now we need to send the candidate a follow up email,including the details we need to know like current ctc, expected ctc, experience,etc.

    const additionalInformationEmail = {
      to: candidate,
      threadId: email.threadId,
      messageId: email.messageId,
      subject: `Request for Additional Information for ${jobTitle}`,
      body: `Dear ${candidate},

      We would like to follow up with you regarding your application for the role of ${jobTitle}. Could you please provide the following details for further consideration:

      * Current CTC
      * Expected CTC
      * Years of experience
      * Current Location
      * Notice Period
      * Current Company
      * Current Role

      Thank you for your time and consideration.

      Best regards,
      Recruitment Team`,
    };

    const isAdditionalInformationSent = await checkLabelExists({
      label: 'ADDITIONAL_INFORMATION_SENT',
      emailId: email.id,
    });

    if (isAdditionalInformationSent) {
      console.log(`Email ${email.id} has already been sent for additional information.`);
      continue;
    }

    await sendEmailAsReply(additionalInformationEmail);

    await addLabelToEmail({
      label: 'ADDITIONAL_INFORMATION_SENT',
      emailId: email.id,
      removeLabels: ['CONFIRMED', 'INBOX', 'UNREAD'],
    });

    await scheduleReminder({
      to: candidate,
      subject: `Application Reminder for ${jobTitle}`,
      body: `Dear ${candidate},

      We sent you an email asking for additional information regarding your application for the role of ${jobTitle} but we haven't received a response yet. Could you please provide the necessary details so that we can move forward with your application?

      Thank you for your time and consideration.

      Best regards,
      Recruitment Team`,
      emailId: email.id,
      threadId: email.threadId,
    });

    // const attachments: Attachments = await extractAttachments(email);
    // let evaluationResponse: EvaluationResponse = {
    //   score: 0,
    //   strength: '',
    //   weakness: '',
    //   good_match: false,
    //   follow_up_email: {
    //     to: '',
    //     subject: '',
    //     body: '',
    //   },
    // };

    // console.log('STEP 1: Extracted attachments', attachments.length);

    // for (let file of attachments) {
    //   if (!file.filename.endsWith('.pdf') && !file.filename.endsWith('.docx')) {
    //     console.log('Skipping unsupported file', file);
    //     const unsupportedEmailResponse = await sendUnsupportedFileResponse(email); // still sends immediately per unsupported file
    //     console.log('Unsupported file response email sent', unsupportedEmailResponse);
    //     return;
    //   }

    //   const attachmentData = await getAttachmentData({ id: email.id, attachment: file.attachment });

    //   if (!attachmentData) {
    //     console.log('Skipping empty attachment', attachmentData);
    //     return;
    //   }

    //   let parsedResumeText: string;
    //   if (file.filename.endsWith('.docx')) {
    //     console.log('Extracting text from DOCX file');
    //     parsedResumeText = await extractTextFromDOCX(attachmentData);
    //     console.log('Extracted text:', parsedResumeText);
    //   } else {
    //     console.log('Extracting text from PDF file');
    //     parsedResumeText = await extractTextFromPDF(attachmentData);
    //     console.log('Extracted text:', parsedResumeText);
    //   }

    //   console.log('AI EVALUATION STARTED...');
    //   const evaluation = await evaluateResume({ parsedResumeText, email });
    //   console.log('AI EVALUATION COMPLETED', evaluation);
    //   evaluationResponse = evaluation;
    // }

    // if (evaluationResponse) {
    //   console.log('SENDING EMAIL RESPONSE...');
    //   const emailResponse = await sendEmailResponse({ evaluationResponse: evaluationResponse, email });
    //   console.log('EMAIL RESPONSE SENT', emailResponse);
    // }
  }

  return 'Workflow Completed';
}
