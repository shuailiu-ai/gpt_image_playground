// 同源转发到 88API，避免浏览器直连被 CORS 拦截。
export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
}

const UPSTREAM = 'https://88api.xyz/v1'
const SKIP_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'forwarded',
  'host',
  'transfer-encoding',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'x-vercel-forwarded-for',
  'x-vercel-id',
])

function buildUpstreamUrl(incomingUrl) {
  const idx = incomingUrl.indexOf('?')
  const pathname = idx >= 0 ? incomingUrl.slice(0, idx) : incomingUrl
  const search = idx >= 0 ? incomingUrl.slice(idx) : ''
  const stripped = pathname.replace(/^\/api\/proxy\/?/, '').replace(/^\/api-proxy\/?/, '')
  return `${UPSTREAM}/${stripped}${search}`
}

function collectRequestHeaders(req) {
  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || SKIP_HEADERS.has(key.toLowerCase())) continue
    headers[key] = Array.isArray(value) ? value.join(',') : value
  }
  return headers
}

async function readRequestBody(req) {
  const method = req.method || 'GET'
  if (method === 'GET' || method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length ? Buffer.concat(chunks) : undefined
}

export default async function handler(req, res) {
  try {
    const dest = buildUpstreamUrl(req.url || '/')
    const upstream = await fetch(dest, {
      method: req.method || 'GET',
      headers: collectRequestHeaders(req),
      body: await readRequestBody(req),
    })

    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      if (key === 'content-encoding' || key === 'transfer-encoding' || key === 'content-length') return
      res.setHeader(key, value)
    })
    res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch (err) {
    console.error('API proxy failed', err)
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'API 代理请求失败' }))
  }
}
