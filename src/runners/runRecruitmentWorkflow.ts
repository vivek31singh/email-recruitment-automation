import { RecruitmentWorkflow } from '../workflows/recruitmentWorkflow';
import { nanoid } from 'nanoid';
import { getTemporalClient } from '../utils/temporalClient';

export async function runRecruitmentWorkflow(
  jobRelatedEmails?: { id: string; subject: string; body: string; payload: any , labelIds: string[], threadId: string,
messageId: string}[],
) {

  const client = await getTemporalClient();

  const handle = await client.workflow.start(RecruitmentWorkflow, {
    taskQueue: 'recruitment-ai-automation',
    // type inference works! args: [name: string]
    args: [jobRelatedEmails],
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });

  // optional: wait for workflow completion
  await handle.result();

  console.log(`Started recruitment workflow ${handle.workflowId}`);

  // optional: wait for client result
  console.log(await handle.result());
}

runRecruitmentWorkflow().catch((err) => {
  console.error("Error in running recruitment workflow",err);
  process.exit(1);
});
