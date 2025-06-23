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

const mailQueue = new Queue('mail-jobs', {
  connection: redisConnection,
});

app.post('/webhook/gmail', async (req, res) => {
  const data = req.body;

  const buff = Buffer.from(data.message.data, 'base64');

  let decodedData: { emailAddress: string; historyId: number } | null = null;
  try {
    decodedData = JSON.parse(buff.toString('utf-8'));
  } catch (e) {
    console.error('Failed to parse JSON:', e);
  }

  if (!decodedData) {
    res.status(400).json({ message: 'Invalid payload' });
    return;
  }

  const { emailAddress, historyId } = decodedData;

  if (!historyId || !emailAddress) {
    res.status(400).json({ message: 'Missing historyId or emailAddress' });
    return;
  }

  await mailQueue.add(
    'process-job-emails',
    {
      emailAddress,
      historyId,
    },
    {
      removeOnComplete: true,
      removeOnFail: { count: 5 },
      attempts: 3,
    },
  );

  res.json({
    message: 'Gmail webhook received',
  });
});

app.get('/', (req, res) => {
  res.send('ok, webhook layer is working');
});

cron.schedule('0 2 * * *', () => {
  console.log('🔄 Refreshing Gmail watch...');
  makeWatchRequest().catch(console.error);
});

const port = process.env.NODE_PORT || 3000;
app.listen(port, async () => {
  console.log('Server started on port 3000');
  console.log('   Running initial Gmail watch request...');
  try {
    await makeWatchRequest();
  } catch (err) {
    console.error('Error running initial Gmail watch request:', err);
  }
});
