import { Worker } from 'bullmq';
import { redisConnection } from '../queue/connection';
import { sendEmail } from '../activities/RecruitmentActivities';

const reminderWorker = new Worker(
  'reminder-emails',
  async (job) => {
    const { name, data } = job;


    switch (name) {
      case 'reminder-job':
        
      const { email, emailId } = data;
        // Check again if the user has responded just to be safe
        // await sendEmail(email, emailId);
        break;

      default:
        console.log('Unknown job name:', name);
        break;
    }

  },
  { connection: redisConnection },
);

reminderWorker.on('completed', (job) => {
  console.log(`✅ Completed reminder job ${job.id}`);
});

reminderWorker.on('failed', (job, err) => {
  console.error(`❌ Failed reminder job ${job?.id}:`, err);
});
