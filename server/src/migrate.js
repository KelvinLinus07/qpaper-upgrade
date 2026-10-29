import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { pool } from './db.js'
const dir=fileURLToPath(new URL('../sql/',import.meta.url))
try {
 await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())')
 for (const name of (await readdir(dir)).filter(x=>/^\d+_.*\.sql$/.test(x)).sort()) {
  const client=await pool.connect()
  try {
   await client.query('BEGIN')
   const {rows}=await client.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])
   if (!rows.length) {await client.query(await readFile(join(dir,name),'utf8'));await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);console.log('Applied',name)}
   else console.log('Already applied',name)
   await client.query('COMMIT')
  } catch(err){await client.query('ROLLBACK');throw err} finally{client.release()}
 }
} finally {await pool.end()}
