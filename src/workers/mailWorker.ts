import { Worker } from 'bullmq';
import { redisConnection } from '../queue/connection';
import { runWorkflow } from '../client';
import { gmail_v1 } from 'googleapis';
import { getHistoryId } from '../utils/helper/getHistoryid';
import { fetchMessagesFromHistory } from '../utils/helper/fetchMessagesFromHistory';
import { setHistoryId } from '../utils/helper/setHistoryId';
import { filterJobRelatedMessages } from '../utils/helper/filterJobRelatedMessages';

const worker = new Worker(
  'mail-jobs',
  async (job) => {
    const { name, data } = job;

    switch (name) {
      case 'process-job-emails':
        const { emailAddress, historyId } = data;

        if (!historyId || !emailAddress) {
          console.log('Missing historyId or emailAddress');
          return;
        }

        const previousHistoryId = await getHistoryId(emailAddress);

        const messages = await fetchMessagesFromHistory(previousHistoryId ?? String(historyId));

        await setHistoryId(emailAddress, String(historyId));

        if (messages.length === 0) {
          console.log('No new emails found', messages);
          return;
        }

        console.log('New emails found', messages);

        const jobRelatedEmails = await filterJobRelatedMessages(
          messages.filter((m): m is gmail_v1.Schema$Message => m !== undefined && m?.id !== undefined),
        );
        console.log('jobRelatedEmails:- ', jobRelatedEmails);
        if (jobRelatedEmails.length === 0) {
          console.log('No job related emails found');
          return;
        }
        runWorkflow(jobRelatedEmails)
          .then((res) => {
            console.log(res);
          })
          .catch(console.error);
        break;

      default:
        break;
    }
  },
  {
    connection: redisConnection,
  },
);

worker.on('completed', (job) => {
  console.log(`✅ Completed job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Failed job ${job?.id}:`, err);
});
