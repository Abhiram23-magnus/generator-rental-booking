// Uploads a generator photo to the public `generator-images` bucket.
// The admin's session token (x-admin-token header) is checked with the
// database before anything is stored; the service-role key never leaves the server.
//
// Request:  POST, body = raw image bytes, content-type image/jpeg | image/png | image/webp
// Response: { url } or { error, message }
import { createClient } from 'npm:@supabase/supabase-js@2'

const MAX_BYTES = 5 * 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'METHOD', message: 'Use POST.' })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const token = req.headers.get('x-admin-token') ?? ''
  const { error: authError } = await supabase.rpc('admin_session', { p_token: token })
  if (authError) return json(401, { error: 'UNAUTHORIZED', message: 'Your admin session has ended. Enter your PIN again.' })

  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim()
  const ext = EXT[type]
  if (!ext) return json(400, { error: 'VALIDATION', message: 'Upload a JPG, PNG or WebP image.' })

  const body = new Uint8Array(await req.arrayBuffer())
  if (body.byteLength === 0) return json(400, { error: 'VALIDATION', message: 'The image is empty.' })
  if (body.byteLength > MAX_BYTES) return json(413, { error: 'VALIDATION', message: 'Images must be 5 MB or smaller.' })

  const path = `generators/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('generator-images').upload(path, body, { contentType: type, upsert: false })
  if (error) return json(500, { error: 'UPLOAD_FAILED', message: 'The image could not be saved. Try again.' })

  const { data } = supabase.storage.from('generator-images').getPublicUrl(path)
  return json(200, { url: data.publicUrl })
})
