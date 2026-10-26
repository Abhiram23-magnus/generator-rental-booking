/**
 * Local stand-in for the two Supabase endpoints this app uses, so the whole site
 * can run against a plain local Postgres without Docker:
 *
 *   POST /rest/v1/rpc/<function>          -> calls the function as the anon role (like PostgREST)
 *   POST /functions/v1/admin-upload-image -> same contract as the Edge Function
 *   GET  /uploads/<file>                  -> serves uploaded images
 *
 * Development and testing only. Production uses real Supabase.
 * Usage: LOCAL_DATABASE_URL=postgres://postgres@localhost:5432/generator_dev npm run api
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const PORT = Number(process.env.LOCAL_API_PORT ?? 54321)
const pool = new pg.Pool({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgres://postgres@localhost:5432/generator_dev' })
// a dropped connection (for example after a database reset) must not stop the server
pool.on('error', (e) => console.error('database connection lost:', e.message))
const UPLOAD_DIR = path.resolve('.local-uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage, limit = 6 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) { reject(new Error('too large')); req.destroy() }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function callRpc(fn: string, args: Record<string, unknown>, ip: string) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local role anon')
    await client.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': ip })])
    const names = Object.keys(args)
    for (const n of names) if (!/^p_[a-z_]+$/.test(n)) throw Object.assign(new Error(`bad argument ${n}`), { code: 'PGRST100' })
    const params = names.map((n) => {
      const v = args[n]
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v
    })
    const r = await client.query(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`, params)
    await client.query('commit')
    return r.rows[0].result
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-admin-token, prefer, accept-profile, content-profile',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const ip = req.socket.remoteAddress ?? 'local'
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }

  try {
    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)
    if (rpcMatch && req.method === 'POST') {
      const raw = (await readBody(req)).toString('utf8')
      const args = raw ? JSON.parse(raw) : {}
      try {
        const result = await callRpc(rpcMatch[1], args, ip)
        return send(res, 200, result, cors)
      } catch (e: any) {
        return send(res, e.code === '42501' ? 401 : 400, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null }, cors)
      }
    }

    if (url.pathname === '/functions/v1/admin-upload-image' && req.method === 'POST') {
      const token = String(req.headers['x-admin-token'] ?? '')
      try {
        await callRpc('admin_session', { p_token: token }, ip)
      } catch {
        return send(res, 401, { error: 'UNAUTHORIZED', message: 'Your admin session has ended. Enter your PIN again.' }, cors)
      }
      const type = String(req.headers['content-type'] ?? '').split(';')[0]
      const ext = MIME_EXT[type]
      if (!ext) return send(res, 400, { error: 'VALIDATION', message: 'Upload a JPG, PNG or WebP image.' }, cors)
      let body: Buffer
      try { body = await readBody(req, 5 * 1024 * 1024) } catch {
        return send(res, 413, { error: 'VALIDATION', message: 'Images must be 5 MB or smaller.' }, cors)
      }
      const name = `${randomUUID()}.${ext}`
      fs.writeFileSync(path.join(UPLOAD_DIR, name), body)
      return send(res, 200, { url: `http://localhost:${PORT}/uploads/${name}` }, cors)
    }

    const up = url.pathname.match(/^\/uploads\/([0-9a-f-]+\.(jpg|png|webp))$/)
    if (up && req.method === 'GET') {
      const file = path.join(UPLOAD_DIR, up[1])
      if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' }, cors)
      res.writeHead(200, { ...cors, 'content-type': up[2] === 'jpg' ? 'image/jpeg' : `image/${up[2]}` })
      return fs.createReadStream(file).pipe(res)
    }

    send(res, 404, { message: 'Not found' }, cors)
  } catch (e: any) {
    send(res, 500, { message: e.message }, cors)
  }
}).listen(PORT, () => console.log(`Local API on http://localhost:${PORT}`))
