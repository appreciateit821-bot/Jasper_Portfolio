// Owner-only review API. No feedback or credential is embedded in the public build.
const statuses = new Set(['open', 'in_progress', 'ready', 'approved', 'done']);
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const str = (x, max) => typeof x === 'string' ? x.slice(0, max) : '';
const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
async function authorized(request, env) {
  const supplied = request.headers.get('Authorization') || '';
  if (!supplied.startsWith('Bearer ') || supplied.length > 256) return false;
  const a = await hash(supplied.slice(7)), b = await hash(env.FEEDBACK_REVIEW_KEY);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
function publicRow(row) {
  return { ...JSON.parse(row.payload), status: row.status, resolution: row.resolution,
    deploymentUrl: row.deployment_url, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}
function cleanPayload(input) {
  if (!input || !/^[0-9a-f-]{36}$/i.test(input.id || '')) throw Error('INVALID_ID');
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 4000) throw Error('INVALID_MESSAGE');
  const t = input.target || {};
  if (!t.label || !t.selector) throw Error('INVALID_TARGET');
  const asset = typeof t.asset === 'string' && /^assets\/[a-z0-9_./-]+\.(jpg|png|webp|mp4|jpeg)$/i.test(t.asset) && !t.asset.includes('..') ? t.asset : '';
  return { id: input.id, message: input.message.trim(), category: ['design','copy','media','motion','bug'].includes(input.category) ? input.category : 'design',
    page: '/cinema', build: str(input.build, 80),
    viewport: { width: Math.min(10000, Math.max(1, Number(input.viewport?.width) || 1)), height: Math.min(10000, Math.max(1, Number(input.viewport?.height) || 1)) },
    target: { selector: str(t.selector, 1000), label: str(t.label, 200), text: str(t.text, 800), section: str(t.section, 100),
      dialog: str(t.dialog, 100), work: str(t.work, 100), asset, venture: str(t.venture, 100), mode: str(t.mode, 80) } };
}
export async function onRequest({ request, env }) {
  if (!env.FEEDBACK_DB || !env.FEEDBACK_REVIEW_KEY || env.FEEDBACK_REVIEW_KEY.length < 24)
    return json({ error: 'NOT_CONFIGURED', message: '온라인 저장 연결 전입니다. 의견은 이 기기에 보관할 수 있습니다.' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'ORIGIN' }, 403);
  if (!await authorized(request, env)) return json({ error: 'UNAUTHORIZED' }, 401);
  try {
    if (request.method === 'GET') {
      const rows = await env.FEEDBACK_DB.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 1001').all();
      return json({ items: rows.results.slice(0, 1000).map(publicRow), truncated: rows.results.length > 1000 });
    }
    if (!['POST', 'PATCH'].includes(request.method)) return json({ error: 'METHOD' }, 405);
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'CONTENT_TYPE' }, 415);
    const reader = request.body?.getReader();
    const chunks = []; let size = 0;
    if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 16000) { await reader.cancel(); return json({ error: 'TOO_LARGE' }, 413); } chunks.push(value); } }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let input; try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'JSON' }, 400); }
    const now = new Date().toISOString();
    if (request.method === 'POST') {
      let payload; try { payload = cleanPayload(input); } catch (e) { return json({ error: e.message }, 400); }
      // Retry-safe insert: an existing ID is returned unchanged, never overwritten.
      await env.FEEDBACK_DB.prepare('INSERT OR IGNORE INTO feedback (id,payload,created_at,updated_at) VALUES (?,?,?,?)').bind(payload.id, JSON.stringify(payload), now, now).run();
      const row = await env.FEEDBACK_DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(payload.id).first();
      return json({ item: publicRow(row) }, 201);
    }
    if (!/^[0-9a-f-]{36}$/i.test(input.id || '') || !statuses.has(input.status) || !Number.isInteger(input.version)) return json({ error: 'INVALID_UPDATE' }, 400);
    const row = await env.FEEDBACK_DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(input.id).first();
    if (!row) return json({ error: 'NOT_FOUND' }, 404);
    if (row.version !== input.version) return json({ error: 'CONFLICT' }, 409);
    const allowed = { open: ['in_progress'], in_progress: ['open', 'ready'], ready: ['in_progress', 'approved'], approved: ['in_progress', 'done'], done: ['open'] };
    if (!allowed[row.status].includes(input.status)) return json({ error: 'INVALID_TRANSITION' }, 400);
    const resolution = str(input.resolution ?? row.resolution, 4000);
    const deploymentUrl = str(input.deploymentUrl ?? row.deployment_url, 500);
    if (['ready', 'approved', 'done'].includes(input.status)) {
      let u; try { u = new URL(deploymentUrl); } catch { return json({ error: 'DEPLOYMENT_REQUIRED' }, 400); }
      const host = new URL(request.url).hostname;
      const allowedHost = u.hostname === host || (input.status !== 'done' && u.hostname.endsWith('.' + host));
      if (u.protocol !== 'https:' || !allowedHost || u.username || u.password || !resolution.trim()) return json({ error: 'DEPLOYMENT_REQUIRED' }, 400);
    }
    const result = await env.FEEDBACK_DB.prepare('UPDATE feedback SET status=?, resolution=?, deployment_url=?, version=version+1, updated_at=? WHERE id=? AND version=?')
      .bind(input.status, resolution, deploymentUrl, now, input.id, input.version).run();
    if (result.meta.changes !== 1) return json({ error: 'CONFLICT' }, 409);
    return json({ item: publicRow(await env.FEEDBACK_DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(input.id).first()) });
  } catch { return json({ error: 'STORAGE_ERROR', message: '저장하지 못했습니다. 작성 내용은 기기에 남아 있습니다.' }, 503); }
}
