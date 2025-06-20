import { gmail_v1 } from 'googleapis';
import { getGmailClient } from '../OAuth/gmailClient';

function isJobRelated(message: gmail_v1.Schema$Message): boolean | undefined {
  const payload = message.payload;
  const subjectHeader = payload?.headers?.find((h) => h.name === 'Subject')?.value || '';
  const bodyText = Buffer.from(payload?.body?.data || '', 'base64').toString('utf-8');
  const hasAttachment = message.payload?.parts?.some((part) => part.filename);

  const lowerSubject = subjectHeader.toLowerCase();
  const lowerBody = bodyText.toLowerCase();

  const keywords = ['resume', 'cv', 'job application', 'cover letter'];
  const badKeywords = ['bank', 'statement', 'noreply', 'donotreply'];

  const containsKeyword = keywords.some((k) => lowerSubject.includes(k) || lowerBody.includes(k));
  const containsBadKeyword = badKeywords.some((k) => lowerSubject.includes(k) || lowerBody.includes(k));

  return containsKeyword && !containsBadKeyword && hasAttachment;
}

export async function filterJobRelatedMessages<Type extends Iterable<gmail_v1.Schema$Message>>(messages: Type) {
  const gmail = await getGmailClient();

  if (!gmail) {
    throw new Error('Gmail client not initialized');
  }

  let fullMessages = [];
  try {
    fullMessages = await Promise.all(
      Array.from(messages).map((m) =>
        gmail.users.messages.get({ userId: 'me', id: m.id! }).catch((err) => {
          if (err.message === 'No history found') {
            return null;
          } else {
            throw err;
          }
        }),
      ),
    ).then((arr) => arr.filter((el) => el !== null));
  } catch (err) {
    console.warn(`Message not found for ID`);
    throw err;
  }

  const seenIds = new Set<string>();

  const relevantMessages = fullMessages.filter((fm) => {
    const messageId = fm.data.id as string;
    if (!seenIds.has(messageId) && isJobRelated(fm.data)) {
      seenIds.add(messageId);
      return true;
    }
    return false;
  });

  return relevantMessages.map((fm) => ({
    id: fm.data.id ?? '',
    snippet: fm.data.snippet ?? '',
    payload: fm.data.payload ?? {},
  }));
}
