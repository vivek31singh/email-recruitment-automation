import express from 'express';
import cron from 'node-cron';

import { Queue } from 'bullmq';
import { redisConnection } from '../queue/connection';
import { makeWatchRequest } from '../utils/OAuth/watchRequest';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();

app.use(express.json());

const mailQueue = new Queue('mail-queue', {
  connection: redisConnection,
});

const jobQueue = new Queue('job-url-queue', {
  connection: redisConnection,
});

app.post('/webhook/gmail', async (req, res) => {
  const data = req.body;

  // Validate data.message.data exists
  if (!data?.message?.data) {
    // Acknowledge with 200 to prevent retries, even if payload invalid
    console.warn('Missing message.data');
    res.status(200).json({ message: 'Missing message data, acknowledged to stop retry' });
    return;
  }

  const buff = Buffer.from(data.message.data, 'base64');

  let decodedData: { emailAddress: string; historyId: number } | null = null;
  try {
    decodedData = JSON.parse(buff.toString('utf-8') || '{}');
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    // Still send 200 to avoid retry spam
    res.status(200).json({ message: 'Invalid JSON payload, acknowledged to stop retry' });
    return;
  }

  const { emailAddress, historyId } = decodedData || {};

  if (!historyId || !emailAddress) {
    console.warn('Missing historyId or emailAddress');
    // Acknowledge with 200 to stop retrying invalid messages
    res.status(200).json({ message: 'Missing fields, acknowledged to stop retry' });
    return;
  }

  try {
    await mailQueue.add(
      'process-job-emails',
      {
        emailAddress,
        historyId,
      },
      {
      jobId: `job-${historyId}`,
        removeOnComplete: true,
        removeOnFail: { count: 5 },
        attempts: 3,
      },
    );
  } catch (error) {
    console.error('Failed to enqueue job:', error);
    // Return 500 so Pub/Sub retries this (optional)
    res.status(500).json({ message: 'Failed to enqueue job' });
    return;
  }

  res.status(200).json({
    message: 'Gmail webhook received',
  });
});

app.post('/webhook/newjob', async (req, res) => {
  const { id, url } = req.body;

  console.log('Received job:', req.body);

  if (!url || typeof url !== 'string') {
    res.status(400).json({ message: 'Invalid job URL' });
    return;
  }

  try {
    await jobQueue.add(
      'crawl-job-url',
      { id, url },
      {
        jobId: id,
        removeOnComplete: true,
        removeOnFail: { count: 3 },
        attempts: 3,
      },
    );

    res.json({ message: 'Job URL received and queued for crawling' });
  } catch (err) {
    console.error('Error adding job to queue:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send('ok, webhook layer is working');
});

cron.schedule('0 2 * * *', () => {
  console.log('🔄 Refreshing Gmail watch...');
  makeWatchRequest().catch(console.error);
});

const port = process.env.NODE_PORT || 4000;
app.listen(port, async () => {
  console.log(`Server started on port ${port}`);
  console.log('   Running initial Gmail watch request...');
  try {
    await makeWatchRequest();
  } catch (err) {
    console.error('Error running initial Gmail watch request:', err);
  }
});
