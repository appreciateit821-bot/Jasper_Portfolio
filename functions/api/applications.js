// Public write-only applications. Owner reads and notes require the review key.
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const brands = new Set(['', '웰모먼트', '알마', '재스퍼앤샬롯', '타임오프클럽']);
const purposes = new Set(['connect', 'partner', 'art', 'lab']);
const interests = new Set(['partner', 'painting', 'film', 'writing', 'lab']);
const statuses = new Set(['new', 'contacted', 'connected', 'archived']);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const fallbackInterests = purpose => ['partner', 'lab'].includes(purpose) ? [purpose] : [];
const selectApplication = `SELECT a.id,a.purpose,a.name,a.email,a.brand,a.message,a.consent_at,a.created_at,
  d.interests,d.profile_url,d.source_context,d.consent_version,d.status,d.owner_note,d.updated_at
  FROM applications a LEFT JOIN application_details d ON d.application_id=a.id`;

function publicOwnerFields(row) {
  let selected = fallbackInterests(row.purpose);
  if (row.interests) {
    try { const parsed = JSON.parse(row.interests); if (Array.isArray(parsed)) selected = parsed.filter(value => interests.has(value)); } catch { /* Legacy values remain readable. */ }
  }
  return {
    id: row.id, purpose: row.purpose, name: row.name, email: row.email, brand: row.brand,
    message: row.message, consent_at: row.consent_at, created_at: row.created_at,
    interests: selected, profileUrl: row.profile_url || '', sourceContext: row.source_context || '',
    consentVersion: row.consent_version || '', status: statuses.has(row.status) ? row.status : 'new',
    ownerNote: row.owner_note || '', updatedAt: row.updated_at || row.created_at,
  };
}

async function authorized(request, secret) {
  const supplied = request.headers.get('Authorization') || '';
  if (!supplied.startsWith('Bearer ') || supplied.length > 256) return false;
  const a = await digest(supplied.slice(7)), b = await digest(secret);
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function profileUrl(value) {
  if (value === undefined || value === '') return '';
  if (!validText(value, 1, 2048)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

async function readInput(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return {error: json({error: 'CONTENT_TYPE'}, 415)};
  const chunks = []; let size = 0; const reader = request.body?.getReader();
  if (reader) while (true) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 24000) { await reader.cancel(); return {error: json({error: 'TOO_LARGE'}, 413)}; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return {input: JSON.parse(new TextDecoder().decode(bytes))}; }
  catch { return {error: json({error: 'JSON'}, 400)}; }
}

async function listApplications(request, db) {
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get('limit') || 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return json({error: 'INVALID_PAGE'}, 400);
  let cursor;
  if (params.has('cursor')) {
    try {
      const value = params.get('cursor'); if (value.length > 256) throw Error('cursor');
      cursor = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
      if (!uuid(cursor.id) || typeof cursor.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt)) throw Error('cursor');
    } catch { return json({error: 'INVALID_PAGE'}, 400); }
  }
  const where = cursor ? ' WHERE (a.created_at < ? OR (a.created_at = ? AND a.id < ?))' : '';
  const bindings = cursor ? [cursor.createdAt, cursor.createdAt, cursor.id, limit + 1] : [limit + 1];
  const rows = await db.prepare(selectApplication + where + ' ORDER BY a.created_at DESC,a.id DESC LIMIT ?').bind(...bindings).all();
  const items = rows.results.slice(0, limit).map(publicOwnerFields);
  const hasMore = rows.results.length > limit;
  const last = items.at(-1);
  const nextCursor = hasMore ? btoa(JSON.stringify({createdAt: last.created_at, id: last.id})).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : null;
  const count = await db.prepare('SELECT COUNT(*) AS total FROM applications').first();
  return json({items, nextCursor, hasMore, total: Number(count.total), truncated: false});
}

async function updateApplication(input, db) {
  if (!uuid(input?.id) || !statuses.has(input?.status) || (input.ownerNote !== undefined && !validText(input.ownerNote, 0, 4000))) return json({error: 'INVALID_UPDATE'}, 400);
  const current = await db.prepare(selectApplication + ' WHERE a.id=?').bind(input.id).first();
  if (!current) return json({error: 'NOT_FOUND'}, 404);
  const note = input.ownerNote === undefined ? (current.owner_note || '') : input.ownerNote.trim();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO application_details (application_id,interests,status,owner_note,updated_at)
    VALUES (?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET status=excluded.status,owner_note=excluded.owner_note,updated_at=excluded.updated_at`)
    .bind(input.id, JSON.stringify(fallbackInterests(current.purpose)), input.status, note, now).run();
  return json({id: input.id, status: input.status, ownerNote: note, updatedAt: now});
}

export async function onRequest({request, env}) {
  if (!env.FEEDBACK_DB || !env.FEEDBACK_REVIEW_KEY || env.FEEDBACK_REVIEW_KEY.length < 24) return json({error: 'NOT_CONFIGURED'}, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({error: 'ORIGIN'}, 403);
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return json({error: 'METHOD'}, 405);
  if (['GET', 'PATCH'].includes(request.method) && !await authorized(request, env.FEEDBACK_REVIEW_KEY)) return json({error: 'UNAUTHORIZED'}, 401);
  try {
    if (request.method === 'GET') return await listApplications(request, env.FEEDBACK_DB);
    const body = await readInput(request); if (body.error) return body.error;
    const input = body.input;
    if (request.method === 'PATCH') return await updateApplication(input, env.FEEDBACK_DB);
    const selected = input?.interests === undefined ? fallbackInterests(input?.purpose) : input.interests;
    const profile = profileUrl(input?.profileUrl);
    if (!input || !uuid(input.id) || !purposes.has(input.purpose) || !validText(input.name, 1, 80) || /[\r\n\t]/.test(input.name)
      || !validText(input.email, 3, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
      || !validText(input.message, 10, 4000) || input.consent !== true || !brands.has(input.brand) || input.website
      || !Array.isArray(selected) || selected.length > 5 || selected.some(value => !interests.has(value))
      || profile === null || (input.sourceContext !== undefined && !validText(input.sourceContext, 0, 160))
      || (input.consentVersion !== undefined && (typeof input.consentVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(input.consentVersion)))) {
      return json({error: 'INVALID_APPLICATION'}, 400);
    }
    const now = new Date().toISOString();
    // No raw IP addresses are stored. Salted hashes enforce a per-hour limit.
    const hashed = await digest(env.FEEDBACK_REVIEW_KEY + '|' + (request.headers.get('CF-Connecting-IP') || 'local'));
    const sender = Array.from(hashed, x => x.toString(16).padStart(2, '0')).join('');
    const existing = await env.FEEDBACK_DB.prepare('SELECT id,sender_hash FROM applications WHERE id=?').bind(input.id).first();
    if (existing) return existing.sender_hash === sender ? json({id: input.id}, 200) : json({error: 'CONFLICT'}, 409);
    const since = new Date(Date.now() - 3600000).toISOString();
    // D1 batch is transactional: missing migrations or metadata failures roll back the contact too.
    // Each statement is conditional so concurrent retries preserve the first accepted submission.
    const results = await env.FEEDBACK_DB.batch([
      env.FEEDBACK_DB.prepare(`INSERT OR IGNORE INTO applications (id,purpose,name,email,brand,message,consent_at,created_at,sender_hash)
        SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM applications WHERE sender_hash=? AND created_at>?) < 5`)
        .bind(input.id, input.purpose, input.name.trim(), input.email.trim(), input.brand, input.message.trim(), now, now, sender, sender, since),
      env.FEEDBACK_DB.prepare(`INSERT INTO application_details (application_id,interests,profile_url,source_context,consent_version,updated_at)
        SELECT id,?,?,?,?,? FROM applications WHERE id=? AND sender_hash=? ON CONFLICT(application_id) DO NOTHING`)
        .bind(JSON.stringify([...new Set(selected)]), profile, (input.sourceContext || '').trim(), input.consentVersion || '', now, input.id, sender),
    ]);
    if (results[0].meta.changes === 1) return json({id: input.id}, 201);
    const retry = await env.FEEDBACK_DB.prepare('SELECT id,sender_hash FROM applications WHERE id=?').bind(input.id).first();
    if (retry) return retry.sender_hash === sender ? json({id: input.id}, 200) : json({error: 'CONFLICT'}, 409);
    return json({error: 'RATE_LIMIT'}, 429);
  } catch { return json({error: 'STORAGE_ERROR'}, 503); }
}
