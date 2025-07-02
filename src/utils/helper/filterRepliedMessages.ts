import { gmail_v1 } from 'googleapis';
import { redis } from '../../queue/connection';
import { getGmailClient } from '../OAuth/gmailClient';

const systemEmails = ['doddlehq@gmail.com'];

const getHeader = (headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string) => {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
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

export const filterRepliedMessages = async (
  messages: gmail_v1.Schema$Message[]
): Promise<gmail_v1.Schema$Message[]> => {
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

    console.log('res', reminderJob, replied, fromCandidate, threadId); 

    if (reminderJob && replied && fromCandidate) {
      await cancelReminderForApp(getReminderRedisKey(threadId));

      validReplies.push(fullMessage);
    }
  }
  return validReplies;
};
