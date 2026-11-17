import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

export function reply(res: ServerResponse, status: number, body: unknown) {
  if (!res.destroyed && !res.writableEnded) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(JSON.stringify(body))
}

export function tutorCapability(ctx: Context, name: string, path: string, message: string) {
  // The native host authenticates the index. Only its boot data contains the token.
  const token = randomBytes(32).toString('hex')
  const expected = Buffer.from(token)
  ctx.on('webserver/index-inject', table => table.push({ kind: 'global', name, value: { path: path.slice(1), token } }))
  return (req: IncomingMessage, res: ServerResponse) => {
    const supplied = req.headers['x-socratic-token']
    if (typeof supplied === 'string' && /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied), expected)) return true
    reply(res, 401, { error: message })
    return false
  }
}

export async function readJson(req: IncomingMessage, maxBytes: number, invalid: string, tooLarge: string): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error(invalid)
  let size = 0
  const parts: Buffer[] = []
  for await (const part of req) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part)
    size += bytes.length
    if (size > maxBytes) throw new Error(tooLarge)
    parts.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { throw new Error(invalid) }
}
