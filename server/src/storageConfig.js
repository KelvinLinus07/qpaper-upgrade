/**
 * Object-storage configuration shared by the image upload route and tests.
 * STORAGE_PROVIDER=s3 preserves all existing AWS deployments; setting it to
 * r2 uses a separate, explicitly authenticated Cloudflare S3-compatible client.
 * Do not pass R2 credentials through AWS_* variables: those may be used by SES.
 */
export class StorageConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'StorageConfigurationError'
    this.status = 503
  }
}

function httpsBase(value, label) {
  if (!value) throw new StorageConfigurationError(`${label} is required for image uploads`)
  let url
  try { url = new URL(value) } catch { throw new StorageConfigurationError(`${label} must be a valid HTTPS URL`) }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new StorageConfigurationError(`${label} must be a valid HTTPS URL without credentials, query or fragment`)
  }
  return url.href.replace(/\/+$/, '')
}

export function getStorageConfig(env = process.env) {
  const provider = (env.STORAGE_PROVIDER || 's3').trim().toLowerCase()
  if (!['s3', 'r2'].includes(provider)) throw new StorageConfigurationError('STORAGE_PROVIDER must be s3 or r2')

  if (provider === 'r2') {
    const bucket = env.R2_BUCKET?.trim()
    const accessKeyId = env.R2_ACCESS_KEY_ID?.trim()
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new StorageConfigurationError('Set R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY to enable R2 uploads')
    }
    const endpoint = httpsBase(
      env.R2_ENDPOINT?.trim() || (env.R2_ACCOUNT_ID?.trim() ? `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com` : ''),
      'R2_ENDPOINT (or R2_ACCOUNT_ID)'
    )
    const publicBaseUrl = env.R2_PUBLIC_URL?.trim() ? httpsBase(env.R2_PUBLIC_URL.trim(), 'R2_PUBLIC_URL') : null
    return {
      provider,
      bucket,
      publicBaseUrl,
      clientOptions: {
        region: 'auto',
        endpoint,
        credentials: {accessKeyId, secretAccessKey},
        forcePathStyle: true
      }
    }
  }

  const bucket = env.S3_BUCKET?.trim()
  if (!bucket) throw new StorageConfigurationError('S3_BUCKET is required for AWS S3 uploads')
  return {
    provider,
    bucket,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL?.trim() ? httpsBase(env.S3_PUBLIC_BASE_URL.trim(), 'S3_PUBLIC_BASE_URL') : null,
    clientOptions: {region: env.AWS_REGION || 'ap-south-1'}
  }
}
