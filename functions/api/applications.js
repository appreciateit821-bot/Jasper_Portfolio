// Public write-only applications. Owner reads and notes require the review key.
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
});
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const brands = new Set(['', '웰모먼트', '알마', '재스퍼앤샬롯', '타임오프클럽']);
const projectSeparator = ' · ';
const maxAttachmentBytes = 1024 * 1024;
const maxJsonBytes = 24000;
const maxAttachmentBase64 = Math.ceil(maxAttachmentBytes / 3) * 4;
const purposes = new Set(['connect', 'partner', 'art', 'lab']);
const interests = new Set(['partner', 'painting', 'film', 'writing', 'lab']);
const statuses = new Set(['new', 'contacted', 'connected', 'archived']);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const fallbackInterests = purpose => ['partner', 'lab'].includes(purpose) ? [purpose] : [];
const selectApplication = `SELECT a.id,a.purpose,a.name,a.email,a.brand,a.message,a.consent_at,a.created_at,
  d.interests,d.profile_url,d.source_context,d.consent_version,d.status,d.owner_note,d.updated_at,
  f.filename AS attachment_name,length(f.content) AS attachment_size,c.phone,c.profile_urls
  FROM applications a LEFT JOIN application_details d ON d.application_id=a.id
  LEFT JOIN application_attachments f ON f.application_id=a.id
  LEFT JOIN application_contacts c ON c.application_id=a.id`;

function publicOwnerFields(row) {
  let selected = fallbackInterests(row.purpose);
  if (row.interests) {
    try { const parsed = JSON.parse(row.interests); if (Array.isArray(parsed)) selected = parsed.filter(value => interests.has(value)); } catch { /* Legacy values remain readable. */ }
  }
  const profiles = row.profile_urls ? JSON.parse(row.profile_urls) : row.profile_url ? [row.profile_url] : [];
  return {
    id: row.id, purpose: row.purpose, name: row.name, email: row.email, brand: row.brand,
    projects: row.brand ? row.brand.split(projectSeparator) : [],
    message: row.message, consent_at: row.consent_at, created_at: row.created_at,
    interests: selected, phone: row.phone || '', profileUrls: profiles, profileUrl: row.profile_url || '', sourceContext: row.source_context || '',
    consentVersion: row.consent_version || '', status: statuses.has(row.status) ? row.status : 'new',
    ownerNote: row.owner_note || '', updatedAt: row.updated_at || row.created_at,
    attachment: row.attachment_name ? {name: row.attachment_name, size: Number(row.attachment_size)} : null,
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
    if (size > maxJsonBytes + maxAttachmentBase64) { await reader.cancel(); return {error: json({error: 'TOO_LARGE'}, 413)}; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (size > maxJsonBytes && (!input?.attachment || typeof input.attachment.content !== 'string'
      || size - input.attachment.content.length > maxJsonBytes)) return {error: json({error: 'TOO_LARGE'}, 413)};
    return {input};
  }
  catch { return {error: json({error: 'JSON'}, 400)}; }
}

function readAttachment(value) {
  if (!validText(value?.name, 1, 180) || /[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value.name)
    || typeof value.content !== 'string' || value.content.length > maxAttachmentBase64) return null;
  const name = value.name.trim().toWellFormed();
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (!name.includes('.') || !['pdf', 'jpg', 'jpeg', 'png'].includes(extension)) return null;
  let binary;
  try { binary = atob(value.content); } catch { return null; }
  if (!binary.length || binary.length > maxAttachmentBytes) return null;
  const signature = extension === 'pdf' ? '%PDF-' : extension === 'png' ? '\x89PNG\r\n\x1a\n' : '\xff\xd8\xff';
  if (!binary.startsWith(signature)) return null;
  return {name, content: Uint8Array.from(binary, char => char.charCodeAt(0)).buffer};
}

async function downloadAttachment(id, db) {
  if (!uuid(id)) return json({error: 'INVALID_ATTACHMENT_ID'}, 400);
  const file = await db.prepare('SELECT filename,content FROM application_attachments WHERE application_id=?').bind(id).first();
  if (!file) return json({error: 'NOT_FOUND'}, 404);
  const encodedName = encodeURIComponent(file.filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
  return new Response(new Uint8Array(file.content), {headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodedName,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }});
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
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('attachment');
      return id === null ? await listApplications(request, env.FEEDBACK_DB) : await downloadAttachment(id, env.FEEDBACK_DB);
    }
    const body = await readInput(request); if (body.error) return body.error;
    const input = body.input;
    if (request.method === 'PATCH') return await updateApplication(input, env.FEEDBACK_DB);
    const selected = input?.interests === undefined ? fallbackInterests(input?.purpose) : input.interests;
    const projects = input?.projects === undefined ? (input?.brand ? [input.brand] : []) : input.projects;
    const profile = profileUrl(input?.profileUrl);
    const reviewedForm = input?.consentVersion === '2026-11-24-v3';
    const currentForm = reviewedForm || input?.consentVersion === '2026-11-24-v2';
    const phone = input?.phone ?? '';
    const needsPhone = input?.purpose === 'connect' || input?.purpose === 'partner' || (reviewedForm && input?.purpose === 'art');
    const profiles = input?.profileUrls === undefined ? (profile ? [profile] : []) :
      Array.isArray(input.profileUrls) && input.profileUrls.length <= 5 ? input.profileUrls.map(profileUrl) : null;
    if (!input || !uuid(input.id) || !purposes.has(input.purpose) || !validText(input.name, 1, 80) || /[\r\n\t]/.test(input.name)
      || !validText(input.email, 3, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
      || !validText(input.message, currentForm && input.purpose === 'connect' ? 1 : 10, 4000) || input.consent !== true || !brands.has(input.brand) || input.website
      || !Array.isArray(projects) || projects.length > 4 || projects.some(value => !value || !brands.has(value))
      || (input.projects !== undefined && input.purpose !== 'partner' && projects.length)
      || !Array.isArray(selected) || selected.length > 5 || selected.some(value => !interests.has(value))
      || profile === null || !profiles || profiles.some(value => !value)
      || !validText(phone, 0, 32) || (phone && (!/^\+?[0-9() -]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))))
      || (currentForm && (
        (needsPhone ? !phone : Boolean(phone))
        || (input.purpose === 'partner' && (projects.length !== 1 || selected.length !== 1 || selected[0] !== 'partner'))
        || (input.purpose === 'connect' && selected.length !== 0)
        || (input.purpose === 'lab' && (selected.length !== 1 || selected[0] !== 'lab'))
        || (input.purpose === 'art' && selected.some(value => value === 'partner' || value === 'lab'))
      ))
      || (input.sourceContext !== undefined && !validText(input.sourceContext, 0, 160))
      || (input.consentVersion !== undefined && (typeof input.consentVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(input.consentVersion)))) {
      return json({error: 'INVALID_APPLICATION'}, 400);
    }
    const attachment = input.attachment === undefined ? null : readAttachment(input.attachment);
    if (input.attachment !== undefined && (!attachment || input.purpose !== 'partner')) return json({error: 'INVALID_ATTACHMENT'}, 400);
    const now = new Date().toISOString();
    // No raw IP addresses are stored. Salted hashes enforce a per-hour limit.
    const hashed = await digest(env.FEEDBACK_REVIEW_KEY + '|' + (request.headers.get('CF-Connecting-IP') || 'local'));
    const sender = Array.from(hashed, x => x.toString(16).padStart(2, '0')).join('');
    const existing = await env.FEEDBACK_DB.prepare('SELECT id,sender_hash FROM applications WHERE id=?').bind(input.id).first();
    if (existing) return existing.sender_hash === sender ? json({id: input.id}, 200) : json({error: 'CONFLICT'}, 409);
    const since = new Date(Date.now() - 3600000).toISOString();
    // D1 batch is transactional: missing migrations or metadata failures roll back the contact too.
    // Each statement is conditional so concurrent retries preserve the first accepted submission.
    const statements = [
      env.FEEDBACK_DB.prepare(`INSERT OR IGNORE INTO applications (id,purpose,name,email,brand,message,consent_at,created_at,sender_hash)
        SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM applications WHERE sender_hash=? AND created_at>?) < 5`)
        .bind(input.id, input.purpose, input.name.trim(), input.email.trim(), [...new Set(projects)].join(projectSeparator), input.message.trim(), now, now, sender, sender, since),
    ];
    if (attachment) {
      // The winning batch has inserted its application but not its details yet.
      statements.push(env.FEEDBACK_DB.prepare(`INSERT INTO application_attachments (application_id,filename,content)
        SELECT a.id,?,? FROM applications a WHERE a.id=? AND a.sender_hash=?
        AND NOT EXISTS (SELECT 1 FROM application_details d WHERE d.application_id=a.id)`)
        .bind(attachment.name, attachment.content, input.id, sender));
    }
    if (currentForm || phone || input.profileUrls !== undefined) {
      statements.push(env.FEEDBACK_DB.prepare(`INSERT INTO application_contacts (application_id,phone,profile_urls)
        SELECT id,?,? FROM applications WHERE id=? AND sender_hash=? ON CONFLICT(application_id) DO NOTHING`)
        .bind(phone, JSON.stringify([...new Set(profiles)]), input.id, sender));
    }
    statements.push(env.FEEDBACK_DB.prepare(`INSERT INTO application_details (application_id,interests,profile_url,source_context,consent_version,updated_at)
      SELECT id,?,?,?,?,? FROM applications WHERE id=? AND sender_hash=? ON CONFLICT(application_id) DO NOTHING`)
      .bind(JSON.stringify([...new Set(selected)]), profiles[0] || '', (input.sourceContext || '').trim(), input.consentVersion || '', now, input.id, sender));
    const results = await env.FEEDBACK_DB.batch(statements);
    if (results[0].meta.changes === 1) return json({id: input.id}, 201);
    const retry = await env.FEEDBACK_DB.prepare('SELECT id,sender_hash FROM applications WHERE id=?').bind(input.id).first();
    if (retry) return retry.sender_hash === sender ? json({id: input.id}, 200) : json({error: 'CONFLICT'}, 409);
    return json({error: 'RATE_LIMIT'}, 429);
  } catch { return json({error: 'STORAGE_ERROR'}, 503); }
}
