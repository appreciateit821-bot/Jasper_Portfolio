// Public write-only applications; reading requires the existing owner credential.
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
const brands = new Set(['','웰모먼트','알마','재스퍼앤샬롯','타임오프클럽']);
async function authorized(request,secret) {
  const supplied=request.headers.get('Authorization') || '';
  if (!supplied.startsWith('Bearer ') || supplied.length>256) return false;
  const a=await digest(supplied.slice(7)),b=await digest(secret);
  let diff=0;for(let i=0;i<a.length;i++) diff |= a[i]^b[i];return diff===0;
}
export async function onRequest({request,env}) {
  if(!env.FEEDBACK_DB || !env.FEEDBACK_REVIEW_KEY || env.FEEDBACK_REVIEW_KEY.length<24) return json({error:'NOT_CONFIGURED'},503);
  const origin=request.headers.get('Origin');
  if(origin && origin!==new URL(request.url).origin) return json({error:'ORIGIN'},403);
  if(!['GET','POST'].includes(request.method)) return json({error:'METHOD'},405);
  if(request.method==='GET' && !await authorized(request,env.FEEDBACK_REVIEW_KEY)) return json({error:'UNAUTHORIZED'},401);
  try {
    if(request.method==='GET') {
      const rows=await env.FEEDBACK_DB.prepare('SELECT id,purpose,name,email,brand,message,consent_at,created_at FROM applications ORDER BY created_at DESC LIMIT 1001').all();
      return json({items:rows.results.slice(0,1000),truncated:rows.results.length>1000});
    }
    if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'CONTENT_TYPE'},415);
    const chunks=[];let size=0;const reader=request.body?.getReader();
    if(reader) while(true) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>18000){await reader.cancel();return json({error:'TOO_LARGE'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'JSON'},400);}
    const validText=(key,min,max)=> typeof input?.[key]==='string' && input[key].trim().length>=min && input[key].length<=max;
    if(!input || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.id||'') || !['partner','art','lab'].includes(input.purpose) || !validText('name',1,80) || !validText('email',3,254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || !validText('message',10,4000) || input.consent!==true || !brands.has(input.brand) || input.website) return json({error:'INVALID_APPLICATION'},400);
    const now=new Date().toISOString();
    // No raw IP addresses are stored. Salted hashes enforce a per-hour limit.
    const hashed=await digest(env.FEEDBACK_REVIEW_KEY+'|'+(request.headers.get('CF-Connecting-IP') || 'local'));
    const sender=Array.from(hashed,x=>x.toString(16).padStart(2,'0')).join('');
    const existing=await env.FEEDBACK_DB.prepare('SELECT id,sender_hash FROM applications WHERE id=?').bind(input.id).first();
    if(existing) return existing.sender_hash===sender ? json({id:input.id},200) : json({error:'CONFLICT'},409);
    const since=new Date(Date.now()-3600000).toISOString();
    // Check and insert in one statement so concurrent requests cannot bypass the limit.
    const result=await env.FEEDBACK_DB.prepare('INSERT OR IGNORE INTO applications (id,purpose,name,email,brand,message,consent_at,created_at,sender_hash) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM applications WHERE sender_hash=? AND created_at>?) < 5')
      .bind(input.id,input.purpose,input.name.trim(),input.email.trim(),input.purpose==='partner'?input.brand:'',input.message.trim(),now,now,sender,sender,since).run();
    if(result.meta.changes===1) return json({id:input.id},201);
    const retry=await env.FEEDBACK_DB.prepare('SELECT id,sender_hash FROM applications WHERE id=?').bind(input.id).first();
    if(retry?.sender_hash===sender) return json({id:input.id},200);
    return json({error:'RATE_LIMIT'},429);
  } catch {return json({error:'STORAGE_ERROR'},503);}
}
