import { Connection, Client } from '@temporalio/client';
import { RecruitmentWorkflow } from './workflows';
import { nanoid } from 'nanoid';



export async function runWorkflow(jobRelatedEmails?: { id: string; snippet: string; payload: any }[]) {
  // Connect to the default Server location
  const connection = await Connection.connect({ address: 'localhost:7233' });
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
