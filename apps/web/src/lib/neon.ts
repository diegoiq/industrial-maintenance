import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_wGW7bIAYOPa6@ep-hidden-flower-bc65z5nj-pooler.c-16.us-east-1.aws.neon.tech/neondb?sslmode=require';

export const sql = neon(connectionString);
