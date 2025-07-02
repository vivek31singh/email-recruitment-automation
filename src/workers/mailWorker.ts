import { Worker } from 'bullmq';
import { redisConnection } from '../queue/connection';
import { runRecruitmentWorkflow } from '../runners/runRecruitmentWorkflow';
import { gmail_v1 } from 'googleapis';
import { getHistoryId } from '../utils/helper/getHistoryid';
import { fetchMessagesFromHistory } from '../utils/helper/fetchMessagesFromHistory';
import { setHistoryId } from '../utils/helper/setHistoryId';
import { filterJobRelatedMessages } from '../utils/helper/filterJobRelatedMessages';
import { filterRepliedMessages } from '../utils/helper/filterRepliedMessages';
import { runResumeScreeningWorkflow } from '../runners/runResumeScreeningWorkflow';

const worker = new Worker(
  'mail-queue',
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
        console.log(`${messages.length} new emails found`);

        const jobRelatedEmails = await filterJobRelatedMessages(
          messages.filter((m): m is gmail_v1.Schema$Message => m !== undefined && m?.id !== undefined),
        );

        // TODO: now we have to filter out the replied emails based on the threadId of the message,

        const repliedMessages = await filterRepliedMessages(
          messages.filter((m): m is gmail_v1.Schema$Message => m !== undefined && m?.id !== undefined),
        );

        if (repliedMessages.length > 0) {
          runResumeScreeningWorkflow(repliedMessages)
            .then((res) => {
              console.log('res of the resume screening workflow', res);
            })
            .catch(console.error);
        }

        if (jobRelatedEmails.length === 0) {
          console.log('No job related emails found');
          return;
        }
        runRecruitmentWorkflow(jobRelatedEmails)
          .then((res) => {
            console.log('res of the workflow', res);
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
  console.log(`✅ Completed email screening job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Failed email screening job ${job?.id}:`, err);
});
