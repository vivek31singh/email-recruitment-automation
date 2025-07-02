import { Worker } from 'bullmq';
import { redisConnection } from '../queue/connection';
import { crawlOcodeWebsite } from '../utils/helper/crawlJobs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const crudBackendUrl =
  process.env.NODE_ENV === 'production' ? process.env.CRUD_BACKEND_URL : process.env.CRUD_BACKEND_DEV_URL;

const worker = new Worker(
  'job-url-queue',
  async (job) => {
    const { name, data } = job;

    switch (name) {
      case 'crawl-job-url':
        const { id, url } = data;

        if (!id || !url || typeof url !== 'string') {
          console.log('Invalid job URL');
          return;
        }

        console.log('Received job:', url);

        try {
          const jobData = await crawlOcodeWebsite(url);

          if (jobData) {
            console.log('Job data:', jobData);
            await fetch(`${crudBackendUrl}/api/job`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                id,
                data: jobData,
              }),
            });
          }
        } catch (err) {
          console.error('Error crawling:', err);
        }
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
  console.log(`✅ Completed url crawling job ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Failed url crawling job ${job?.id}:`, err);
});
