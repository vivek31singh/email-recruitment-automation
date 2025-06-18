import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as activities from './activities';
import { EvaluationResponse } from './activities';

const {
  fetchEmails,
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

/** A workflow that simply calls an activity */
export async function RecruitmentWorkflow(jobRelatedEmails?: { id: string; snippet: string; payload: any }[]) {
  // const emails = await fetchEmails();

  // console.log('STEP 1: Fetched emails', emails.length);

  if (!jobRelatedEmails || jobRelatedEmails.length === 0) {
    return;
  }

  for (const email of jobRelatedEmails) {
    if (!email.id) {
      console.log('No email id', email);
      return;
    }

    const attachments: Attachments = await extractAttachments(email);
    let evaluationResponse: EvaluationResponse = {
      score: 0,
      strength: '',
      weakness: '',
      good_match: false,
      follow_up_email: {
        to: '',
        subject: '',
        body: '',
      },
    };

    console.log('STEP 1: Extracted attachments', attachments.length, attachments);

    for (let file of attachments) {
      if (!file.filename.endsWith('.pdf') && !file.filename.endsWith('.docx')) {
        console.log('Skipping unsupported file', file);
        const unsupportedEmailResponse = await sendUnsupportedFileResponse(email); // still sends immediately per unsupported file
        console.log('Unsupported file response email sent', unsupportedEmailResponse);
        return;
      }

      const attachmentData = await getAttachmentData({ id: email.id, attachment: file.attachment });

      if (!attachmentData) {
        console.log('Skipping empty attachment', attachmentData);
        return;
      }

      let parsedResumeText: string;
      if (file.filename.endsWith('.docx')) {
        console.log('Extracting text from DOCX file');
        parsedResumeText = await extractTextFromDOCX(attachmentData);
        console.log('Extracted text:', parsedResumeText);
      } else {
        console.log('Extracting text from PDF file');
        parsedResumeText = await extractTextFromPDF(attachmentData);
        console.log('Extracted text:', parsedResumeText);
      }
   
        console.log('AI EVALUATION STARTED...');
        const evaluation = await evaluateResume({ parsedResumeText, email });
        console.log('AI EVALUATION COMPLETED', evaluation);
        evaluationResponse = evaluation;
      }
    

    if (evaluationResponse) {
      console.log('SENDING EMAIL RESPONSE...');
      const emailResponse = await sendEmailResponse({ evaluationResponse: evaluationResponse, email });
      console.log('EMAIL RESPONSE SENT', emailResponse);
    }
  }

return "Workflow Completed";
}
