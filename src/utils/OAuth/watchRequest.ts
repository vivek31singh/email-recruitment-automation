import { getAccessToken } from './getAcessToken';
import { getGmailClient } from './gmailClient';

export const makeWatchRequest = async () => {
  try {
    const gmail = await getGmailClient();
    const access_token = await getAccessToken();

    if (!access_token) {
      throw new Error('Access token not found');
    }

    const existingLabels = await gmail.users.labels.list({ userId: 'me' });
    const labelsToWatch = ['INBOX','ADDITIONAL_INFORMATION_SENT'];
    const labelMap = new Map(existingLabels.data.labels?.map((l) => [l.name, l.id]));

    const resolvedLabelIds = labelsToWatch
      .map((name) => {
        if (['INBOX', 'UNREAD', 'STARRED', 'IMPORTANT'].includes(name)) return name;

        if (labelMap.has(name)) return labelMap.get(name);

        console.warn(`Label not found: ${name}`);
        return null;
      })
      .filter((id): id is string => !!id);


    const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        topicName: 'projects/recruit-ai-463310/topics/recruit-ai',
        labelIds: resolvedLabelIds,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to watch email: ${res.status} ${res.statusText}`);
    }

    return console.log('Watch request sent', await res.json());
  } catch (err) {
    console.error('Error running initial Gmail watch request:', err);
  }
};

