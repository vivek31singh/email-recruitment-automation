import { Worker } from 'bullmq';
import { redisConnection } from '../queue/connection';
import { runWorkflow } from '../client';
import { gmail_v1 } from 'googleapis';

const worker = new Worker(
  'mail-jobs',
  async (job) => {
    const { name, data } = job;

    switch (name) {
      case 'process-job-emails':
        console.log('emailData from BullMQ worker:- ', data);

        const jobRelatedEmails =
          (data.jobRelatedEmails as { id: string; snippet: string; payload: gmail_v1.Schema$MessagePart }[]) || [];

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
