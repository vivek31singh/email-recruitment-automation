import { getGmailClient } from "./gmailClient";

export async function fetchMessagesFromHistory(historyId: string) {
  const gmail = await getGmailClient();

  if (!gmail) {
    throw new Error('Gmail client not initialized');
  }

  const res = await gmail.users.history.list({
    userId: 'me',
    startHistoryId: historyId,
    historyTypes: ['messageAdded'],
  });

  if (!res.data) {
    throw new Error('Failed to fetch messages from history');
  }



  const messages = res.data.history ?? [];



  if (messages.length === 0) {
    return [];
  }

  const fullEmails = messages
    .map((history) => {
      const { messagesAdded } = history;
      return (
        messagesAdded?.map((messageAdded) => {
          const id = messageAdded.message?.id;
          if (!id) {
            console.warn('Missing message ID in history:', messageAdded);
          }
          return messageAdded.message;
        }) ?? []
      );
    })
    .flat();




  return fullEmails;
}
