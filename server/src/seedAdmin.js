import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from './db.js'
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Administrator' } = process.env
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters)'); process.exit(1) }
try {
 const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)
 await pool.query(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin') ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,role='admin',active=true`,[ADMIN_NAME, ADMIN_EMAIL.toLowerCase(),hash])
 console.log('Admin account configured')
} finally { await pool.end() }
