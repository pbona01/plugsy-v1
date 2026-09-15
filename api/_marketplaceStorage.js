import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const allowedFileTypes = new Set(['application/pdf','application/zip','image/png','image/jpeg','image/webp']);
export function validateMarketplaceFile({ name, contentType, size }) {
  if (!allowedFileTypes.has(contentType) || !Number.isInteger(size) || size < 1 || size > 250 * 1024 * 1024) throw new Error('Use a PDF, ZIP or image up to 250 MB.');
  const extension = String(name || '').split('.').pop()?.toLowerCase();
  const extensions = { 'application/pdf': ['pdf'], 'application/zip': ['zip'], 'image/png': ['png'], 'image/jpeg': ['jpg','jpeg'], 'image/webp': ['webp'] };
  if (!extensions[contentType].includes(extension) || String(name).length > 160 || /[\x00-\x1f]/.test(String(name))) throw new Error('File name and type do not match.');
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}
function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_MARKETPLACE_BUCKET } = process.env;
  if (!/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID || '') || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_MARKETPLACE_BUCKET) throw new Error('PRIVATE_STORAGE_CONFIG_REQUIRED');
  return { bucket: R2_MARKETPLACE_BUCKET, client: new S3Client({ region: 'auto', endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }) };
}
export async function createUploadUrl(asset) {
  const { bucket, client } = storage();
  return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: asset.object_key, ContentType: asset.content_type, ContentLength: asset.expected_size }), { expiresIn: 60 });
}
export async function verifyUploadedFile(asset) {
  const { bucket, client } = storage();
  const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.object_key }));
  if (result.ContentLength !== Number(asset.expected_size) || result.ContentType !== asset.content_type) throw new Error('UPLOADED_FILE_MISMATCH');
  return result.ContentLength;
}
export async function readMarketplaceFile(asset, maxBytes) {
  const { bucket, client } = storage();
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: asset.object_key }));
  const length = Number(result.ContentLength || 0);
  if (!result.Body || !Number.isFinite(length) || length < 1 || length > maxBytes) throw new Error('FILE_SCAN_SIZE_LIMIT');
  const chunks = [];
  let received = 0;
  for await (const chunk of result.Body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maxBytes) throw new Error('FILE_SCAN_SIZE_LIMIT');
    chunks.push(buffer);
  }
  if (received !== length) throw new Error('FILE_SCAN_READ_MISMATCH');
  return Buffer.concat(chunks);
}
export async function createDownloadUrl(asset) {
  if (asset.status !== 'clean') throw new Error('FILE_SCAN_NOT_CLEAN');
  const { bucket, client } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: asset.object_key, ResponseContentDisposition: `attachment; filename="${asset.original_name.replace(/[^a-zA-Z0-9._-]/g,'_')}"` }), { expiresIn: 300 });
}
