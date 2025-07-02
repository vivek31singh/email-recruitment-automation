import { nanoid } from 'nanoid';
import { getTemporalClient } from '../utils/temporalClient';
import { ResumeScreeningWorkflow } from '../workflows/resumeScreeningWorkflow';
import { gmail_v1 } from 'googleapis';

export const runResumeScreeningWorkflow = async (
  repliedMails: {
    id: string;
    subject: string;
    body: string;
    payload: any;
    labelIds: string[];
    threadId: string;
    messageId: string;
  }[],
) => {
  const client = await getTemporalClient();
  const handle = await client.workflow.start(ResumeScreeningWorkflow, {
    taskQueue: 'recruitment-ai-automation',
    // type inference works! args: [name: string]
    args: [repliedMails],
    // in practice, use a meaningful business ID, like customerId or transactionId
    workflowId: 'workflow-' + nanoid(),
  });

  // optional: wait for workflow completion
  await handle.result();

  console.log(`Started recruitment workflow ${handle.workflowId}`);

  // optional: wait for client result
  console.log(await handle.result());
};
