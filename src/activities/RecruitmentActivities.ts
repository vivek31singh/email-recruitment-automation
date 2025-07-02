import { getGmailClient } from '../utils/OAuth/gmailClient';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { config } from 'dotenv';
import path from 'path';
import { redisConnection } from '../queue/connection';
import { Queue } from 'bullmq';
import { application } from 'express';
import { threadId } from 'worker_threads';

config({ path: path.resolve(__dirname, '../../.env') });

interface FollowUpEmail {
  to: string;
  subject: string;
  body: string;
}

export interface EvaluationResponse {
  score: number;
  strength: string;
  weakness: string;
  good_match: boolean;
  follow_up_email: FollowUpEmail;
}

interface SendEmailResponseArgs {
  evaluationResponse: EvaluationResponse;
  email: any;
}

interface ASKAI {
  prompt: string;
  systemMessage: string;
}

interface EmailData {
  to: string;
  subject: string;
  body: string;
}

interface REPLYEMAILDATA extends EmailData {
  messageId: string;
  threadId: string;
}

export async function fetchEmails() {
  const gmail = await getGmailClient();

  if (!gmail) {
    throw new Error('Gmail client not initialized');
  }

  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 10,
    q: '(subject:(resume OR "job application" OR "CV" OR "cover letter") OR body:(resume OR "job application" OR "cover letter" OR CV)) filename:(resume OR cv OR "cover letter") has:attachment -from:(bank OR statement OR noreply OR donotreply) -label:RESPONDED',
  });

  const messages = res.data.messages ?? [];

  const fullEmails = await Promise.all(messages.map((msg) => gmail.users.messages.get({ userId: 'me', id: msg.id! })));

  return fullEmails.map((m) => ({
    id: m.data.id,
    snippet: m.data.snippet,
    payload: m.data.payload,
  }));
}

export const askAI = async ({ prompt, systemMessage }: ASKAI) => {
  const openrouterApiKey = process.env.OPENROUTER_AI_KEY;

  if (!openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
        {
          role: 'system',
          content: systemMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to evaluate');
  }

  const evaluationResponse: any = await response.json();

  if (!evaluationResponse.choices) {
    throw new Error('Failed to evaluate');
  }

  const message = evaluationResponse.choices[0].message.content;

  const output = message || '';

  const cleanedOutput = output.replace(/```(?:json)?|```/g, '').trim();

  try {
    const parsedOutput = JSON.parse(cleanedOutput);
    return parsedOutput;
  } catch (e: any) {
    return {
      error: 'Invalid JSON format in output',
      raw: cleanedOutput,
      message: e.message,
    };
  }
};

export async function sendEmail(emailData: EmailData) {
  const gmail = await getGmailClient();

  if (!emailData) {
    throw new Error('Email data is empty');
  }

  const rawMessage = Buffer.from(`To: ${emailData.to}\r\nSubject: ${emailData.subject}\r\n\r\n${emailData.body}`)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage },
  });

  return response.data;
}

export async function sendEmailAsReply(emailData: REPLYEMAILDATA) {
  const gmail = await getGmailClient();

  if (!emailData) {
    throw new Error('Email data is empty');
  }

  const { to, subject, body, messageId, threadId } = emailData;

  const rawMessage = Buffer.from(
    `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `In-Reply-To: ${messageId}\r\n` +
      `References: ${messageId}\r\n` +
      `Content-Type: text/plain; charset="UTF-8"\r\n` +
      `\r\n` +
      `${body}`,
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage, threadId: threadId },
  });

  return response.data;
}

export async function fetchRelevantJobs(jobTitle: string) {
  const crudBackendUrl =
    process.env.NODE_ENV === 'production' ? process.env.CRUD_BACKEND_URL : process.env.CRUD_BACKEND_DEV_URL;

  if (!crudBackendUrl) {
    throw new Error('CRUD_BACKEND_URL is not set');
  }

  if (!jobTitle) {
    throw new Error('Job title is empty');
  }

  try {
    const res = await fetch(`${crudBackendUrl}/api/career?key=title&value=${jobTitle}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.log('Error in fetching relevant jobs from crud backend', err);
    return [];
  }
}

export async function checkLabelExists({ label, emailId }: { label: string; emailId: string }): Promise<boolean> {
  if (!label || !emailId) {
    throw new Error('Label or emailId is empty');
  }

  try {
    const gmail = await getGmailClient();
    const freshEmail = await gmail.users.messages.get({ userId: 'me', id: emailId });
    const labels = freshEmail.data.labelIds || [];
    const hasLabel = labels.includes(label);

    return hasLabel;
  } catch (e) {
    console.log("Error in checking label",e);
    return false;
  }
}

export async function addLabelToEmail({
  label,
  emailId,
  removeLabels = ['INBOX', 'UNREAD'],
}: {
  label: string;
  emailId: string;
  removeLabels?: string[];
}) {
  if (!label || !emailId) {
    throw new Error('Label or emailId is empty');
  }

  console.log('Adding label to email', label, emailId);

  try {
    const gmail = await getGmailClient();

    const existingLabels = await gmail.users.labels.list({ userId: 'me' });
    const existingLabel = existingLabels.data.labels?.find((l) => l.name === label);

    let labelId = existingLabel?.id;

    const labelMap = new Map(existingLabels.data.labels?.map((l) => [l.name, l.id]));

    const resolvedRemoveLabelIds = removeLabels
      .map((name) => {
        if (['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT'].includes(name)) return name;

        if (labelMap.has(name)) return labelMap.get(name);

        console.warn(`Label not found: ${name}`);
        return null;
      })
      .filter((id): id is string => !!id);

    if (!labelId) {
      const createLabelRes = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: label,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      labelId = createLabelRes.data.id;
    }

    if (emailId && labelId) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: [labelId],
          removeLabelIds: resolvedRemoveLabelIds,
        },
      });
    }
  } catch (error) {
    console.error('Gmail label update failed:', error);
  }
}

export async function scheduleReminder({
  to,
  subject,
  body,
  emailId,
  threadId
}: {
  to: string;
  subject: string;
  body: string;
  emailId: string;
  threadId: string;
}) {
  const reminderQueue = new Queue('reminder-queue', {
    connection: redisConnection,
  });

  await reminderQueue.add(
    `reminder-job`,
    { email: { to, subject, body }, emailId, threadId },
    {
      jobId: `reminder-job-${threadId}`,
      delay: 24 * 60 * 60 * 1000, // 24 hours
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  );
}

export async function extractAttachments(email: any) {
  const attachments = [];
  for (const part of email.payload.parts) {
    if (part.body.size > 0) {
      const attachment = {
        filename: part.filename,
        mimeType: part.mimeType,
        attachment: part.body.attachmentId,
        size: part.body.size,
      };

      attachments.push(attachment);
    }
  }

  return attachments;
}

export async function getAttachmentData({ id, attachment }: { id: string; attachment: string }) {
  const gmail = await getGmailClient();

  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: id,
    id: attachment,
  });

  if (!res.data.data) {
    return null;
  }

  return Buffer.from(res.data.data, 'base64');
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text;
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export async function evaluateResume({ parsedResumeText, email }: { parsedResumeText: string; email: any }) {
  const openrouterApiKey = process.env.OPENROUTER_AI_KEY;

  if (!openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  const candidate =
    email?.payload?.headers?.find((header: { name: string; value: string }) => header.name === 'From').value || '';

  const userMessage = `You are screening a resume for a Full Stack Developer position at Ocode Technologies in Mohali. Use the job description below to evaluate the candidate. 

job description:

We are looking for a talented and motivated Full Stack Developer to join our growing team in Mohali. The ideal candidate will have 1–3 years once f experiein building scalable web applications using modern technologies across both frontend and backend. You should be proficient in JavaScript, HTML5, CSS3, and TypeScript, with hands-on experience in React.js, Redux, and optionally Next.js. On the backend, you should be skilled in Node.js, Express.js, and MongoDB, with a strong understanding of RESTful APIs. Experience with Git, cloud deployment (AWS, Vercel, or Heroku), and working in agile teams is preferred. Your role will include designing and maintaining responsive web interfaces, developing robust backend services, integrating third-party APIs, and ensuring application performance. A Bachelor's degree in Computer Science or a related field is preferred. We offer a competitive salary, flexible work environment, and an opportunity to grow in a fast-paced startup setting.

Your job is to evaluate whether the candidate is a good match based on the job description and return a JSON object in this format:

Based on the resume and extracted name/email, return a JSON object in the following format:


{
  "score": 8.5,
  "strength": "Short summary of key strengths.",
  "weakness": "Short summary of weaknesses.",
  "good_match": true,
  "follow_up_email": {
    "to": "[candidate email]",
    "subject": "Thank You for Applying - Full Stack Developer Role",
    "body": "Dear [Candidate Name],\n\nThank you for applying for the Full Stack Developer role at our Mohali office. ..."
  }
}

Important:

The follow_up_email must be from the HR department to the candidate, not from the candidate. The candidates are applying at Ocode Technologies, mohali.

Replace [Candidate Name] with the name extracted from the email input if available.

If the candidate is not a good match, set "good_match": false and use this rejection email format:

{
  "to": "[candidate email]",
  "subject": "Application Update - Full Stack Developer Role",
  "body": "Dear [Candidate Name],\n\nThank you for your interest in the Full Stack Developer position at Ocode Technologies. After reviewing your resume, we’ve decided to move forward with candidates whose experience more closely aligns with our current needs.\n\nWe encourage you to continue growing your professional experience and wish you the very best in your job search.\n\nBest regards,\nHR Department\nOcode Technologies"
}



Inputs:

Resume: ${parsedResumeText}

Candidate: ${candidate} OR extract candidate name and email from provided resume

Keep the output concise. Score is out of 10.

Return only valid JSON with double-quoted keys and values. No markdown, no backticks, no code fences.`;

  const systemMessage = `when the candidate is a good match follow this template for generating follow up email:

Subject: Great News About Your Application!

Body:

Hi [CandidateName],

Thank you for applying for the position at Ocode Technologies.
We’ve had a chance to review your resume, and we're impressed by your background and skills — especially your experience with [highlightedSkillOrArea].

Our HR team is currently reviewing applications, and we believe you could be a strong fit for the role. One of our team members will be in touch with you soon to discuss the next steps.

If you have any questions in the meantime, feel free to reach out.

Thanks again for your interest — we’re excited to learn more about you!

Warm regards,
Recruitment Team
Ocode Technologies

if the candidate is not a good match, in that case follow this template for generating follow up email:

Subject: Thank You for Your Application

Body:

Hi [CandidateName],

Thank you for taking the time to apply for the position at Ocode Technologies.

We truly appreciate the effort you put into your application and the interest you've shown in joining our team. After careful consideration, we've decided to move forward with other candidates whose experience more closely matches the needs of the role at this time.

Please don’t be discouraged — your profile is valued, and we encourage you to apply again in the future as new opportunities open up.

Wishing you all the best in your job search and future endeavors.

Warm regards,
Recruitment Team
Ocode Technologies`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-r1-0528-qwen3-8b:free',
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
        {
          role: 'system',
          content: systemMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to evaluate resume');
  }

  const evaluationResponse: any = await response.json();

  if (!evaluationResponse.choices) {
    throw new Error('Failed to evaluate resume');
  }

  const message = evaluationResponse.choices[0].message.content;

  const output = message || '';

  const cleanedOutput = output.replace(/```(?:json)?|```/g, '').trim();

  try {
    const parsedOutput = JSON.parse(cleanedOutput);
    return parsedOutput;
  } catch (e: any) {
    return {
      error: 'Invalid JSON format in output',
      raw: cleanedOutput,
      message: e.message,
    };
  }
}

export async function sendEmailResponse({ evaluationResponse, email }: SendEmailResponseArgs) {
  const gmail = await getGmailClient();

  if (!evaluationResponse) {
    throw new Error('Evaluation response is empty');
  }

  const labels = email.labelIds || [];
  const hasResponded = labels.includes('RESPONDED');
  if (hasResponded) {
    console.log(`Email ${email.id} has already been responded to.`);
    return { skipped: true };
  }

  const evaluation = evaluationResponse.follow_up_email;

  if (!evaluation?.to || !evaluation?.subject) {
    throw new Error('Missing required fields in follow-up email');
  }

  const rawMessage = Buffer.from(
    `To: ${evaluation.to}\r\nSubject: ${evaluation.subject}\r\n\r\n${evaluation.body}`,
  ).toString('base64');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: rawMessage },
  });

  try {
    const existingLabels = await gmail.users.labels.list({ userId: 'me' });
    const respondedLabel = existingLabels.data.labels?.find((label) => label.name === 'RESPONDED');

    let labelId = respondedLabel?.id;

    if (!labelId) {
      const createLabelRes = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: 'RESPONDED',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      labelId = createLabelRes.data.id;
    }

    if (response.status === 200 && email.id && labelId) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: email.id,
        requestBody: {
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX', 'UNREAD'],
        },
      });
    }
  } catch (error) {
    console.error('Gmail label update failed:', error);
  }

  return response.data;
}

export async function sendUnsupportedFileResponse(email: any) {
  const gmail = await getGmailClient();

  const labels = email.labelIds || [];
  const hasResponded = labels.includes('RESPONDED');
  if (hasResponded) {
    console.log(`Email ${email.id} has already been responded to.`);
    return { skipped: true };
  }

  const candidate =
    email?.payload?.headers?.find((header: { name: string; value: string }) => header.name === 'From').value || '';
  const candidateSubject =
    email?.payload?.headers?.find((header: { name: string; value: string }) => header.name === 'Subject').value || '';
  const unsupportedEmailResponse = `
Dear ${candidate},

Thank you for applying for the Full Stack Developer position at our Mohali office.

Unfortunately, we were unable to process your application because the resume you submitted is in an unsupported file format. Kindly resend your resume in a supported format such as PDF or Word (DOCX).

Once we receive the updated file, we’ll be happy to proceed with the evaluation of your profile.

Looking forward to your response.

Best regards,
Recruitment Team`;

  if (!candidate || !candidateSubject || !unsupportedEmailResponse) {
    throw new Error('Missing required fields in follow up email');
  }

  const message = {
    raw: Buffer.from(
      `To: ${candidate}\r\nSubject: ${`Issue with Your Resume Submission - ${candidateSubject}`}\r\n\r\n${unsupportedEmailResponse}`,
    ).toString('base64'),
    userId: 'me',
  };

  if (!message.raw) {
    throw new Error('Missing required fields in follow up email');
  }

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: message,
  });

  try {
    const existingLabels = await gmail.users.labels.list({ userId: 'me' });
    const respondedLabel = existingLabels.data.labels?.find((label) => label.name === 'RESPONDED');

    let labelId = respondedLabel?.id;

    if (!labelId) {
      const createLabelRes = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: 'RESPONDED',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
      labelId = createLabelRes.data.id;
    }

    if (res.status === 200 && email.id && labelId) {
      await gmail.users.messages.modify({
        userId: 'me',
        id: email.id,
        requestBody: {
          addLabelIds: [labelId],
          removeLabelIds: ['INBOX', 'UNREAD'],
        },
      });
    }
  } catch (error) {
    console.error('Gmail label update failed:', error);
  }
  return res.data;
}
