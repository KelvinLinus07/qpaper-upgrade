import test from 'node:test'
import assert from 'node:assert/strict'
import { getStorageConfig, StorageConfigurationError } from '../src/storageConfig.js'

test('R2 uses separate credentials and its S3-compatible endpoint', () => {
  const c = getStorageConfig({
    STORAGE_PROVIDER: 'r2',
    R2_ENDPOINT: 'https://example123.r2.cloudflarestorage.com',
    R2_BUCKET: 'qpaper-images',
    R2_PUBLIC_URL: 'https://images.example.com/',
    R2_ACCESS_KEY_ID: 'r2-key',
    R2_SECRET_ACCESS_KEY: 'r2-secret',
    AWS_REGION: 'eu-north-1',
    AWS_ACCESS_KEY_ID: 'unrelated-ses-key'
  })
  assert.equal(c.provider, 'r2')
  assert.equal(c.bucket, 'qpaper-images')
  assert.equal(c.publicBaseUrl, 'https://images.example.com')
  assert.equal(c.clientOptions.region, 'auto')
  assert.equal(c.clientOptions.endpoint, 'https://example123.r2.cloudflarestorage.com')
  assert.equal(c.clientOptions.credentials.accessKeyId, 'r2-key')
  assert.equal(c.clientOptions.credentials.secretAccessKey, 'r2-secret')
  assert.equal(c.clientOptions.forcePathStyle, true)
})

test('R2 endpoint can be derived from account ID', () => {
  const c = getStorageConfig({STORAGE_PROVIDER:'r2',R2_ACCOUNT_ID:'abc123',R2_BUCKET:'images',R2_PUBLIC_URL:'https://example.r2.dev',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret'})
  assert.equal(c.clientOptions.endpoint, 'https://abc123.r2.cloudflarestorage.com')
})

test('AWS S3 remains the backwards-compatible default and uses AWS SDK credential chain', () => {
  const c = getStorageConfig({S3_BUCKET:'original-bucket',S3_PUBLIC_BASE_URL:'https://cdn.example.com/',AWS_REGION:'eu-north-1'})
  assert.equal(c.provider, 's3')
  assert.equal(c.clientOptions.region, 'eu-north-1')
  assert.equal(c.clientOptions.credentials, undefined)
  assert.equal(c.publicBaseUrl, 'https://cdn.example.com')
})

test('missing R2 credentials produce actionable errors', () => {
  assert.throws(() => getStorageConfig({STORAGE_PROVIDER:'r2',R2_BUCKET:'test'}), e => e instanceof StorageConfigurationError && e.status===503 && /R2_ACCESS_KEY_ID/.test(e.message))
})

test('plain HTTP public URL is rejected', () => {
  assert.throws(() => getStorageConfig({STORAGE_PROVIDER:'r2',R2_ACCOUNT_ID:'example',R2_BUCKET:'test',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret',R2_PUBLIC_URL:'http://images.example.com'}), /HTTPS/)
})

test('unsupported provider is rejected', () => {
  assert.throws(() => getStorageConfig({STORAGE_PROVIDER:'filesystem'}), /s3 or r2/)
})

test('private R2 bucket does not require a public image domain', () => {
  const config = getStorageConfig({STORAGE_PROVIDER:'r2',R2_ACCOUNT_ID:'example',R2_BUCKET:'questions',R2_ACCESS_KEY_ID:'key',R2_SECRET_ACCESS_KEY:'secret'})
  assert.equal(config.publicBaseUrl, null)
  assert.equal(config.clientOptions.region, 'auto')
})

test('S3 can serve images through the app without a public bucket URL', () => {
  const config = getStorageConfig({STORAGE_PROVIDER:'s3',S3_BUCKET:'questions'})
  assert.equal(config.publicBaseUrl, null)
})
