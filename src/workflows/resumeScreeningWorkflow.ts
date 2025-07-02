import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as activities from '../activities/RecruitmentActivities';
import { EvaluationResponse } from '../activities/RecruitmentActivities';
import { gmail_v1 } from 'googleapis';
import { redis } from '../queue/connection';

const {
  askAI,
  
  getAttachmentMail,
  fetchRelevantJobs,
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

// TODO: Later handle this logic in a separate activity.


interface File {
  filename: string;
  mimeType: string;
  attachment: string;
  size: number;
}

type Attachments = File[];

export const ResumeScreeningWorkflow = async (
  repliedMails: {
    id: string;
    subject: string;
    body: string;
    payload: any;
    labelIds: string[];
    threadId: string;
    messageId: string;
  }[],
) => {
  if (!repliedMails || repliedMails.length === 0) {
    console.log('No replied emails found for resume screening.');
    return 'No replied emails found for resume screening.';
  }

  //   sample repliedMails
  /*
[
  {
    id: '197cac2d2271e0c0',
    subject: 'Re: Request for Additional Information for Python Developer',
    body: 'test',
    payload: {
      partId: '',
      mimeType: 'multipart/alternative',
      filename: '',
      headers: [Array],
      body: [Object],
      parts: [Array]
    },
    labelIds: [ 'UNREAD', 'CATEGORY_PERSONAL', 'INBOX' ],
    threadId: '197cac1b603c5c4e',
    messageId: ''
  }
]

*/

  for (const email of repliedMails) {
    if (!email.id) {
      console.log('No email id', email);
      continue;
    }

    if (!email.body || email.body.trim() === '') {
      console.log('Email body is empty or undefined', email.id);
      continue;
    }

    // TODO: Later handle this logic in a separate activity. handle edge cases like the candidate doesnt match the job criteria, or the candidate has not provided all the required information. reject the candidate and send an email response with the reason for rejection.

    //     const jobCriteria = {
    //       role: 'Full Stack Developer',
    //       CTCRange: '3 LPA- 5 LPA',
    //       yearsOfExperience: '3-5 years',
    //       currentLocation: 'Mohali',
    //       noticePeriod: '2 months',
    //     };
    //     const systemMessage = `The AI is provided with the following context:
    //   - The user has responded with an email.
    //   - The job criteria is: ${JSON.stringify(jobCriteria)}.
    //   - Compare the user's email details against the job criteria provided by the company and return a JSON object indicating any discrepancies:
    // {
    //   "currentCTC": "string",
    //   "expectedCTC": "string",
    //   "yearsOfExperience": "string",
    //   "currentLocation": "string",
    //   "noticePeriod": "string"
    // }
    // The JSON response should be generated in all scenarios. Only provide the values when both the candidate and job criteria have values for comparison; otherwise, indicate "not provided" for the respective field.`;

    //     const prompt = `As an AI assistant, your role is to evaluate the user-provided data against the job criteria from the company. The user has responded with the following email with subject "${email.subject}" and body "${email.body}". Return a JSON object that identifies any mismatched fields and the expected values from the company.`;

    //     const aiResponse = await askAI({
    //       prompt,
    //       systemMessage,
    //     });

    //     console.log('AI Response:', aiResponse);

    /*
    AI Response: {
  error: 'Invalid JSON format in output',
  raw: '{\n' +
    '  "currentCTC": "3 lpa",\n' +
    '  "expectedCTC": "5 lpa",\n' +
    '  "yearsOfExperience": "1 year",\n' +
    '  "currentLocation": "mohali",\n' +
    '  "noticePeriod": "1 month"\n' +
    '}\n' +
    '\n' +
    '\n' +
    '### Mismatch Summary\n' +
    "- **Current vs. Job CTC Range:** Application's current CTC (₹3 LPA) is within the job's range (₹3–5 LPA), and expected CTC (₹5 LPA) is at the upper end of the range, so no discrepancy here.\n" +
    "- **Experience vs. Job Requirement:** Candidate's experience (1 year) is less than the required minimum (3–5 years), hence a mismatch.\n" +
    '- **Location:** Both the candidate and job criteria are in Mohali, no mismatch.\n' +
    "- **Notice Period:** Job requires a 2-month waiting period, candidate's response (1 month) is shorter, hence a mismatch.",
  message: 'Unexpected non-whitespace character after JSON at position 149 (line 10 column 1)'
}
*/

    // Func: extraction of email id can be done in a separate activity, using either the sqlite db or redis db.
    const emailWithResume = await getAttachmentMail(`resumeEmail-${email.threadId}`);

    if (!emailWithResume) {
      console.log('No email with resume found for thread', email.threadId);
      continue;
    }

    const jobTitle = emailWithResume.jobTitle;

    if (!jobTitle) {
      console.log('No job title found for email', email.id);
      continue;
    }

    console.log('STEP 1: Fetching relevant jobs for job title', jobTitle);

    const relevantJobs = await fetchRelevantJobs(jobTitle);

    if (!relevantJobs || relevantJobs.length === 0) {
      console.log('No relevant jobs found for job title', jobTitle);
      // TODO: Send no relevant job response email correctly
      continue;
    }

    //  const attachments: Attachments = await extractAttachments(emailWithResume);
    //     let evaluationResponse: EvaluationResponse = {
    //       score: 0,
    //       strength: '',
    //       weakness: '',
    //       good_match: false,
    //       follow_up_email: {
    //         to: '',
    //         subject: '',
    //         body: '',
    //       },
    //     };
    //     console.log('STEP 1: Extracted attachments', attachments.length);

    //     for (let file of attachments) {
    //       if (!file.filename.endsWith('.pdf') && !file.filename.endsWith('.docx')) {
    //         console.log('Skipping unsupported file', file);
    //         // TODO: Send unsupported file response email correctly
    //         // const unsupportedEmailResponse = await sendUnsupportedFileResponse(email); // still sends immediately per unsupported file
    //         // console.log('Unsupported file response email sent', unsupportedEmailResponse);
    //         continue;
    //       }

    //       const attachmentData = await getAttachmentData({ id: email.id, attachment: file.attachment });

    //       if (!attachmentData) {
    //         console.log('Skipping empty attachment', attachmentData);
    //         continue;
    //       }

    //       let parsedResumeText: string;
    //       if (file.filename.endsWith('.docx')) {
    //         console.log('Extracting text from DOCX file');
    //         parsedResumeText = await extractTextFromDOCX(attachmentData);
    //         console.log('Extracted text:', parsedResumeText);
    //       } else {
    //         console.log('Extracting text from PDF file');
    //         parsedResumeText = await extractTextFromPDF(attachmentData);
    //         console.log('Extracted text:', parsedResumeText);
    //       }

    //       console.log('AI EVALUATION STARTED...');
    //       const evaluation = await evaluateResume({ parsedResumeText, email });
    //       console.log('AI EVALUATION COMPLETED', evaluation);
    //       evaluationResponse = evaluation;
    //     }

    //     console.log('FINAL EVALUATION RESPONSE:', evaluationResponse);
        // if (evaluationResponse) {
        //   console.log('SENDING EMAIL RESPONSE...');
        //   const emailResponse = await sendEmailResponse({ evaluationResponse: evaluationResponse, email });
        //   console.log('EMAIL RESPONSE SENT', emailResponse);
        // }
  }
  return 'Resume Screening Workflow Started';
};
