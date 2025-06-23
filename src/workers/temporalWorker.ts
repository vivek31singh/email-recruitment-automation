import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from '../activities/RecruitmentActivities';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
 
  const enviroment = process.env.NODE_ENV;

  const connection = await NativeConnection.connect({
    address: enviroment === 'development' ? 'localhost:7233' : 'temporal:7233',
  });

  try {
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'recruitment-ai-automation',
      workflowsPath: require.resolve('../workflows/recruitmentWorkflow'),
      activities,
    });

    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
