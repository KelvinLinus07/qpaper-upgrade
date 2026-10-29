import pg from 'pg'
import 'dotenv/config'
import { readFileSync } from 'node:fs'

// RDS master credentials are injected into ECS from an AWS-managed secret.
// Local development may continue using DATABASE_URL unchanged.
const ssl = process.env.DB_SSL_CA_FILE
  ? { rejectUnauthorized: true, ca: readFileSync(process.env.DB_SSL_CA_FILE, 'utf8') }
  : process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined

const connection = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'qpaper',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    }
export const pool = new pg.Pool({ ...connection, ssl, max: Number(process.env.DB_POOL_MAX || 10), connectionTimeoutMillis: 10000 })
