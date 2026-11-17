import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const port = Number(process.env.TUTOR_PREVIEW_PORT ?? 4178)
const allowed = new Map([['/', 'index.html'], ['/index.html', 'index.html'], ['/preview.js', 'preview.js']])
export function createPreviewServer() { return http.createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const file = allowed.get(path)
  if (!file || !['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(404).end('Not found'); return }
  try {
    const body = await readFile(new URL(`../preview-dist/${file}`, import.meta.url))
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { res.writeHead(503).end('Run npm run build first.'); }
}) }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createPreviewServer().listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`))
}
