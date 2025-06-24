import { Connection, Client } from '@temporalio/client';
import { RecruitmentWorkflow } from './workflows/recruitmentWorkflow';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export async function runWorkflow(jobRelatedEmails?: { id: string; snippet: string; payload: any }[]) {
  // Connect to the default Server location

  const enviroment = process.env.NODE_ENV;
  
  const connection = await Connection.connect({
    address: enviroment === 'development' ? 'localhost:7233' : 'temporal:7233',
  });
  // In production, pass options to configure TLS and other settings:
  // {
  //   address: 'foo.bar.tmprl.cloud',
  //   tls: {}
  // }

  const client = new Client({
    connection,
    // namespace: 'foo.bar', // connects to 'default' namespace if not specified
  });

  const handle = await client.workflow.start(RecruitmentWorkflow, {
    taskQueue: 'recruitment-ai-automation',
    // type inference works! args: [name: string]
    args: [jobRelatedEmails],
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });

  // optional: wait for workflow completion
  await handle.result();

  console.log(`Started workflow ${handle.workflowId}`);

  // optional: wait for client result
  // console.log(await handle.result()); // Hello, Temporal!
}

runWorkflow().catch((err) => {
  console.error(err);
  process.exit(1);
});
