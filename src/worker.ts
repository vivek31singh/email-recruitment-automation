import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';

async function run() {
 
  const connection = await NativeConnection.connect({
    address: 'localhost:7233',
  });

  try {
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      taskQueue: 'recruitment-ai-automation',
      workflowsPath: require.resolve('./workflows'),
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
