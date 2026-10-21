import { migrate, getEarningsForWallet } from './db';
import { startIndexer } from './indexer';

const PORT = Number(process.env.PORT ?? 3001);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // GET /api/health
  if (url.pathname === '/api/health') {
    return json({ ok: true, ts: Date.now() });
  }

  // GET /api/earnings?address=0x…&limit=200
  if (url.pathname === '/api/earnings') {
    const address = url.searchParams.get('address');
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return json({ error: 'Invalid address' }, 400);
    }
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '200'), 500);
    try {
      const rows = await getEarningsForWallet(address, limit);
      return json({ address, rows, count: rows.length });
    } catch (e) {
      console.error('[api] earnings error:', e);
      return json({ error: 'Database error' }, 500);
    }
  }

  return json({ error: 'Not found' }, 404);
}

// Boot
await migrate();
startIndexer();

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`[server] listening on port ${server.port}`);
