import { getAccessToken } from './getAcessToken';

export const makeWatchRequest = async () => {
  const access_token = await getAccessToken();

  if (!access_token) {
    throw new Error('Access token not found');
  }

  const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      topicName: 'projects/recruit-ai-463310/topics/recruit-ai',
      labelIds: ['INBOX'],
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to watch email: ${res.status} ${res.statusText}`);
  }

  return console.log('Watch request sent', await res.json());
};
