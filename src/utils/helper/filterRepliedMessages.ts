import { gmail_v1 } from 'googleapis';
import { redis } from '../../queue/connection';
import { getGmailClient } from '../OAuth/gmailClient';
import { Buffer } from 'buffer';

const systemEmails = ['doddlehq@gmail.com'];

const getHeader = (headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) => {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
};

const decodeBase64Url = (str: string | null | undefined): string | null => {
  if (!str) return null;
  try {
    return Buffer.from(str, 'base64').toString('utf-8');
  } catch (err) {
    console.error('Failed to decode base64url:', err);
    return null;
  }
};

export const extractMessageBody = (payload: gmail_v1.Schema$MessagePart | null | undefined): string | null => {
  if (!payload) return null;

  // If this part has data directly
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Otherwise check its parts
  if (payload.parts && payload.parts.length > 0) {
    for (const part of payload.parts) {
      // Prioritize text/html over text/plain if needed
      if (part.mimeType === 'text/html' || part.mimeType === 'text/plain') {
        const body = extractMessageBody(part);
        if (body !== null) return body;
      }
    }
  }

  return null;
};

export const extractLatestReplyOnly = (body: string | null | undefined): string | null => {
  if (!body) return null;
  const lines = body.split('\n');

  const replyLines: string[] = [];

  for (const line of lines) {
    // Gmail often uses "On <date>, <email> wrote:"
    if (line.trim().startsWith('On ') && line.includes('wrote:')) {
      break; // Start of quoted message — stop here
    }

    // Optionally skip Gmail signature "--"
    if (line.trim() === '--') {
      break;
    }

    replyLines.push(line);
  }

  return replyLines.join('\n').trim() || null;
};

const isReply = (headers: gmail_v1.Schema$MessagePartHeader[] = []): boolean => {
  if (!headers || headers.length === 0) return false;
  return headers.some((header) => {
    const name = header.name?.toLowerCase();
    return name === 'in-reply-to' || name === 'references';
  });
};

const isFromCandidate = (headers: gmail_v1.Schema$MessagePartHeader[] = []): boolean => {
  const fromHeader = getHeader(headers, 'From');
  return fromHeader ? !systemEmails.some((email) => fromHeader.value?.includes(email)) : false;
};

const getReminderRedisKey = (threadId: string) => `bull:reminder-queue:reminder-job-${threadId}`;

const cancelReminderForApp = async (reminderId: string) => {
  const result = await redis.hdel(reminderId, 'data');
  return result > 0;
};

export async function filterRepliedMessages<Type extends Iterable<gmail_v1.Schema$Message>>(messages: Type) {
  const gmail = await getGmailClient();
  const validReplies: gmail_v1.Schema$Message[] = [];

  for (const message of messages) {
    const threadId = message.threadId;
    if (!threadId || !message.id) continue;

    let fullMessage: gmail_v1.Schema$Message | null = null;

    try {
      const res = await gmail.users.messages.get({ userId: 'me', id: message.id });
      fullMessage = res.data;
    } catch (err) {
      if (err instanceof Error && err.message === 'No history found') {
        continue;
      }
      throw err;
    }

    const headers = fullMessage.payload?.headers || [];
    const replied = isReply(headers);
    const fromCandidate = isFromCandidate(headers);
    const reminderJob = await redis.hget(getReminderRedisKey(threadId), 'data');

    if (reminderJob && replied && fromCandidate) {
      // for testing and debugging purposes only later remove the comment
      // await cancelReminderForApp(getReminderRedisKey(threadId));

      validReplies.push(fullMessage);
    }
  }
  return validReplies.map((fm) => ({
    id: fm.id ?? '',
    subject: fm.payload?.headers?.find((h) => h.name === 'Subject')?.value ?? '',
    body: extractLatestReplyOnly(extractMessageBody(fm.payload ?? {})) ?? fm.snippet ?? '',
    payload: fm.payload ?? {},
    labelIds: fm.labelIds ?? [],
    threadId: fm.threadId ?? '',
    messageId: fm.payload?.headers?.find((h) => h.name === 'Message-Id')?.value ?? '',
  }));
}
