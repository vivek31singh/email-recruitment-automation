import { Connection, Client } from '@temporalio/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export async function getTemporalClient(): Promise<Client> {
  const environment = process.env.NODE_ENV;

  const connection = await Connection.connect({
    address: environment === 'development' ? 'localhost:7233' : 'temporal:7233',
    tls: environment === 'development' ? false : {},
  });

  return new Client({ connection });
}