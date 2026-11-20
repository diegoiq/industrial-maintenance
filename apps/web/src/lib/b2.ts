import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const endpoint = process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';
const region = process.env.B2_REGION || 'us-east-005';
const accessKeyId = process.env.B2_KEY_ID || '';
const secretAccessKey = process.env.B2_APPLICATION_KEY || '';
export const BUCKET_NAME = process.env.B2_BUCKET_NAME || 'industrial-maintenance-assets';

export const b2Client = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export async function uploadToB2(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await b2Client.send(command);

  // Endpoint format for public/friendly URL or S3 URL
  return `${endpoint}/${BUCKET_NAME}/${key}`;
}
