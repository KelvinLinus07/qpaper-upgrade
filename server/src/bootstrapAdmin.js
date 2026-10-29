import 'dotenv/config'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'

if (!process.env.ADMIN_BOOTSTRAP_SECRET_ARN) throw new Error('ADMIN_BOOTSTRAP_SECRET_ARN is required')
const sm = new SecretsManagerClient({region: process.env.AWS_REGION || 'ap-south-1'})
const result = await sm.send(new GetSecretValueCommand({SecretId: process.env.ADMIN_BOOTSTRAP_SECRET_ARN}))
const credentials = JSON.parse(result.SecretString || '{}')
if (!credentials.email || !credentials.password || credentials.password.length < 12) throw new Error('Bootstrap secret requires email and password (12+ characters)')
try {
  const hash = await bcrypt.hash(credentials.password, 12)
  // Only create the first admin; do not silently overwrite later password changes.
  const {rowCount} = await pool.query(`INSERT INTO users(name,email,password_hash,role)
    VALUES($1,$2,$3,'admin') ON CONFLICT (email) DO NOTHING`,
    [credentials.name || 'Administrator', credentials.email.toLowerCase().trim(), hash])
  console.log(rowCount ? 'First admin created' : 'Admin email already exists; unchanged')
} finally { await pool.end() }
