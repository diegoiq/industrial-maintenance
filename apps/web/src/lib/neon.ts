import { neon } from '@neondatabase/serverless';

let cachedSqlClient: ReturnType<typeof neon> | null = null;

function getSqlClient() {
  if (cachedSqlClient) return cachedSqlClient;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está configurada en las variables de entorno del servidor.');
  }

  cachedSqlClient = neon(connectionString);
  return cachedSqlClient;
}

export const sql = (
  strings: TemplateStringsArray,
  ...values: any[]
): Promise<Record<string, any>[]> => {
  const client = getSqlClient();
  return client(strings, ...values) as Promise<Record<string, any>[]>;
};
