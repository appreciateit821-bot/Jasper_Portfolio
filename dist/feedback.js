(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('review') !== '1') return;
  const STORE = 'jasper-feedback-v1', KEY = 'jasper-review-key';
  const labels = { local: '이 기기에만 저장', open: '접수됨', in_progress: '수정 중', ready: '수정안 확인', approved: '공개 반영 승인됨', done: '공개 반영 완료' };
  const categories = { design: '배치·디자인', copy: '문구', media: '그림·사진·영상', motion: '모션', bug: '불편·오류' };
  let state = { drafts: [], cache: [], composing: null }, key = '', picking = false, selected = null, lastFocus = null, busy = false;
  let storageOK = true, online = false, connection = '온라인 저장 연결을 확인해 주세요.';
  try { const saved = JSON.parse(localStorage.getItem(STORE)); if (saved && Array.isArray(saved.drafts) && Array.isArray(saved.cache)) state = saved; } catch { /* corrupt storage starts clean */ }
  try { key = sessionStorage.getItem(KEY) || ''; } catch { /* session storage optional */ }
  const el = (tag, attrs = {}, text = '') => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  };
  const button = (text, action, attrs = {}) => { const b = el('button', { type: 'button', ...attrs }, text); b.addEventListener('click', action); return b; };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); storageOK = true; } catch { storageOK = false; } };
  const box = el('div', { class: 'jf-box', 'aria-hidden': 'true', hidden: '' });
  const toolbar = el('aside', { class: 'jf-toolbar', 'data-feedback-ui': '', 'aria-label': '사이트 피드백 도구' });
  const instruction = el('span', { class: 'jf-hint', role: 'status' }, '피드백 모드');
  const pickButton = button('위치 찍기', () => setPicking(!picking), { 'aria-pressed': 'false' });
  const listButton = button('의견 목록', openList);
  const exitButton = button('종료', () => {
    const u = new URL(location.href); u.searchParams.delete('review'); location.assign(u.href);
  }, { 'aria-label': '피드백 모드 종료' });
  toolbar.append(instruction, pickButton, listButton, exitButton);
  const sheet = el('dialog', { class: 'jf-sheet', 'data-feedback-ui': '', 'aria-labelledby': 'jf-title' });
  const head = el('header', { class: 'jf-head' });
  const title = el('h2', { id: 'jf-title', tabindex: '-1' });
  const close = button('닫기 ×', () => sheet.close(), { 'aria-label': '피드백 창 닫기' });
  const body = el('div', { class: 'jf-body' });
  head.append(title, close); sheet.append(head, body);
  document.body.append(toolbar, box, sheet);
  document.documentElement.classList.add('jf-active');
  sheet.addEventListener('close', () => { box.hidden = true; mountToolbar(); lastFocus?.isConnected && lastFocus.focus({ preventScroll: true }); });
  sheet.addEventListener('keydown', e => e.stopPropagation());
  function mountToolbar() {
    if (sheet.open) return;
    const dialogs = [...document.querySelectorAll('dialog[open]:not(.jf-sheet)')];
    const parent = dialogs.at(-1) || document.body;
    if (toolbar.parentElement !== parent) parent.append(toolbar);
    if (box.parentElement !== parent) parent.append(box);
  }
  new MutationObserver(mountToolbar).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['open'] });
  function openSheet(heading) {
    setPicking(false); lastFocus = document.activeElement; title.textContent = heading; body.replaceChildren();
    if (!sheet.open) sheet.showModal(); title.focus(); sheet.scrollTop = 0;
  }
  function setPicking(value) {
    picking = value; pickButton.setAttribute('aria-pressed', String(value));
    pickButton.textContent = value ? '선택 취소' : '위치 찍기';
    instruction.textContent = value ? '고칠 부분을 눌러 주세요. 스크롤도 할 수 있어요.' : '피드백 모드';
    document.documentElement.classList.toggle('jf-picking', value); box.hidden = true;
  }
  function selectorFor(node) {
    const path = [];
    while (node && node !== document.body && path.length < 12) {
      if (node.id) { path.unshift('#' + CSS.escape(node.id)); break; }
      const siblings = node.parentElement ? [...node.parentElement.children].filter(x => x.tagName === node.tagName) : [node];
      path.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')'); node = node.parentElement;
    }
    return path.join(' > ') || 'body';
  }
  function targetData(node) {
    const section = node.closest('section[id]'), dialog = node.closest('dialog');
    const image = node.matches('img,video') ? node : node.querySelector('img,video');
    let asset = '';
    if (image) { try { const u = new URL(image.currentSrc || image.getAttribute('src'), location.href); if (u.origin === location.origin || location.protocol === 'file:') asset = u.pathname.slice(u.pathname.indexOf('assets/')); } catch {} }
    return { selector: selectorFor(node), text: (node.innerText || node.getAttribute('alt') || '').trim().slice(0, 800),
      label: (node.getAttribute('aria-label') || node.getAttribute('alt') || node.innerText || node.tagName).trim().slice(0, 200),
      section: section?.id || '', dialog: dialog?.id || '', work: dialog?.dataset.work || node.closest('[data-art]')?.dataset.art || '',
      venture: dialog?.dataset.venture || '', mode: dialog?.dataset.kind || '', asset: asset.startsWith('assets/') ? asset : '' };
  }
  function point(node) {
    const r = node.getBoundingClientRect(); box.hidden = false;
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: Math.max(10, r.width) + 'px', height: Math.max(10, r.height) + 'px' });
  }
  document.addEventListener('pointermove', e => { if (picking && !e.target.closest('[data-feedback-ui]')) point(e.target); }, true);
  window.addEventListener('scroll', () => { box.hidden = true; }, true);
  let down = null;
  window.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; }, true);
  window.addEventListener('click', e => {
    if (!picking || e.target.closest('[data-feedback-ui]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.detail && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 12) return;
    if (e.target.closest('input,textarea,select,[contenteditable]')) { instruction.textContent = '입력값 대신 필드의 제목이나 주변 영역을 선택해 주세요.'; return; }
    selected = e.target; const target = targetData(selected); setPicking(false); openEditor(target);
  }, true);
  window.addEventListener('keydown', e => { if (picking && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); setPicking(false); } }, true);
  function context(target) {
    const c = el('div', { class: 'jf-context' });
    c.append(el('small', {}, [target.dialog ? '상세 화면' : target.section || '첫 화면', innerWidth + 'px'].join(' · ')), el('p', {}, target.label));
    if (target.asset && /\.(jpg|png|webp|jpeg)$/i.test(target.asset)) c.append(el('img', { src: target.asset, alt: '선택한 이미지', loading: 'lazy' }));
    return c;
  }
  function openEditor(target, existing = null) {
    openSheet('이 부분, 이렇게 바꿔 주세요'); body.append(context(target));
    const form = el('form'), category = el('select', { id: 'jf-category' }), message = el('textarea', { id: 'jf-message', rows: '5', maxlength: '4000', required: '', placeholder: '예: 이 사진은 얼굴이 잘리지 않게 보여 주세요. 제목은 두 줄로 줄이고 싶어요.' });
    Object.entries(categories).forEach(([value, name]) => category.append(el('option', { value }, name)));
    const id = existing?.id || crypto.randomUUID();
    category.value = existing?.category || 'design'; message.value = existing?.message || '';
    form.append(el('label', { for: 'jf-category' }, '어떤 피드백인가요?'), category, el('label', { for: 'jf-message' }, '바꾸고 싶은 점'), message);
    const notice = el('p', { class: 'jf-note', role: 'status' }, online ? '저장하면 연결된 피드백 보관함에 접수됩니다.' : '현재 이 기기에 저장됩니다. 온라인 연결 후 전송하거나 파일로 전달할 수 있어요.');
    const submit = el('button', { type: 'submit', class: 'jf-primary' }, online ? '피드백 보내기' : '이 기기에 저장');
    const draft = () => ({ id, target, category: category.value, message: message.value, page: '/cinema',
      build: document.querySelector('meta[name="jasper-build"]')?.content || 'unknown', viewport: { width: innerWidth, height: innerHeight }, createdAt: existing?.createdAt || new Date().toISOString(), status: 'local' });
    const persist = () => { state.composing = draft(); save(); if (!storageOK) notice.textContent = '기기 저장 공간에 접근할 수 없습니다. 이 창을 닫기 전에 내용을 복사해 주세요.'; };
    message.addEventListener('input', persist); category.addEventListener('change', persist);
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (!message.value.trim()) { message.setCustomValidity('피드백 내용을 적어 주세요.'); message.reportValidity(); return; }
      message.setCustomValidity(''); const item = draft(); state.drafts = state.drafts.filter(x => x.id !== id); state.drafts.push(item); state.composing = null; save();
      if (!storageOK) { notice.textContent = '기기에 저장하지 못했습니다. 파일로 내려받아 보관해 주세요.'; }
      submit.disabled = true;
      if (online) await sendDraft(item);
      openList();
    });
    message.addEventListener('input', () => message.setCustomValidity(''));
    form.append(notice, submit); body.append(form); if (existing) message.focus();
  }
  async function api(method = 'GET', data) {
    let response;
    try { response = await fetch('/api/feedback', { method, headers: { Authorization: 'Bearer ' + key, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000) }); } catch { throw Error('연결되지 않았어요. 의견은 이 기기에 남아 있습니다.'); }
    const type = response.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) throw Error('온라인 저장 연결 전입니다. 기기 저장·파일 전달을 이용해 주세요.');
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401) { key = ''; try { sessionStorage.removeItem(KEY); } catch {} }
      throw Error(response.status === 401 ? '접속 키를 확인해 주세요.' : response.status === 409 ? '다른 곳에서 상태가 바뀌었어요. 새로고침 후 다시 확인해 주세요.' : payload.message || '처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return payload;
  }
  async function refresh() {
    if (!key) return;
    try { const data = await api(); state.cache = data.items; online = true; connection = data.truncated ? '최근 1,000개 의견을 불러왔습니다.' : '온라인 보관함에 연결됨'; save(); }
    catch (e) { online = false; connection = e.message; }
  }
  async function sendDraft(item) {
    try { const { item: stored } = await api('POST', item); state.cache = [stored, ...state.cache.filter(x => x.id !== item.id)]; state.drafts = state.drafts.filter(x => x.id !== item.id); save(); }
    catch (e) { online = false; connection = e.message; }
  }
  function allItems() { return [...state.drafts, ...state.cache.filter(x => !state.drafts.some(y => y.id === x.id))]; }
  function download() {
    const data = { schema: 'jasper-feedback/v1', exportedAt: new Date().toISOString(), items: allItems(), composing: state.composing };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(blob), a = el('a', { href: u, download: 'jasper-feedback-' + new Date().toISOString().slice(0, 10) + '.json' });
    a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function locate(item) {
    sheet.close(); const t = item.target;
    // Re-open the exact artwork/brand before resolving selectors in dynamic dialogs.
    if (t.work) document.querySelector('[data-art="' + CSS.escape(t.work) + '"]')?.click();
    if (t.venture) document.querySelector('[data-open-venture="' + CSS.escape(t.venture) + '"]')?.click();
    if (t.dialog && t.dialog !== 'art-dialog' && !t.venture) {
      const open = document.getElementById(t.dialog); if (!open?.open) { openList(); body.prepend(el('p', { class: 'jf-note' }, '이 의견은 상세 화면에서 작성했어요. 해당 화면을 연 다음 위치를 확인해 주세요.')); return; }
    }
    requestAnimationFrame(() => {
      let target; try { target = document.querySelector(t.selector); } catch {}
      if (!target || (t.work && document.getElementById('art-dialog')?.dataset.work !== t.work)) {
        openList(); body.prepend(el('p', { class: 'jf-note' }, '페이지가 바뀌어 정확한 위치를 찾지 못했어요. 저장된 문구와 이미지로 확인해 주세요.')); return;
      }
      target.scrollIntoView({ block: 'center', behavior: 'instant' }); mountToolbar(); point(target); setTimeout(() => { box.hidden = true; }, 2800);
    });
  }
  function openList() {
    openSheet('남긴 피드백');
    body.append(el('p', { class: 'jf-note' }, '접수 → Codex 수정안 → 공개 반영 승인 → 공개 반영 완료. 수정안을 확인하고 승인한 뒤 공개본에 반영합니다.'));
    const status = el('p', { class: 'jf-connection', role: 'status' }, connection); body.append(status);
    if (!storageOK) body.append(el('p', { role: 'alert' }, '기기 저장 불가 — 창을 닫기 전에 파일을 내려받아 주세요.'));
    if (!key) {
      const auth = el('details'), summary = el('summary', {}, '온라인 보관함 연결'); auth.append(summary);
      const f = el('form'), input = el('input', { id: 'jf-key', type: 'password', autocomplete: 'off', placeholder: '관리자 접속 키', minlength: '24', required: '' });
      f.append(el('label', { for: 'jf-key' }, '접속 키'), input, el('button', { type: 'submit' }, '연결'));
      f.addEventListener('submit', async e => { e.preventDefault(); key = input.value.trim(); input.value = ''; await refresh(); if (online) { try { sessionStorage.setItem(KEY, key); } catch {} } else { key = ''; } openList(); });
      auth.append(f, el('p', { class: 'jf-note' }, '사이트 관리자용입니다. 키는 현재 탭 세션에서만 사용합니다.')); body.append(auth);
    }
    const actions = el('div', { class: 'jf-actions' });
    actions.append(button('새로고침', async () => { if (busy) return; busy = true; status.textContent = '불러오는 중…'; await refresh(); busy = false; openList(); }), button('파일로 전달', download));
    if (online && state.drafts.length) actions.append(button('기기 의견 전송 (' + state.drafts.length + ')', async () => {
      if (busy) return; busy = true; status.textContent = '전송 중…'; for (const item of [...state.drafts]) { await sendDraft(item); if (!online) break; } busy = false; openList();
    }));
    if (key) actions.append(button('연결 해제', () => { key = ''; online = false; connection = '온라인 연결 해제됨'; try { sessionStorage.removeItem(KEY); } catch {} openList(); }));
    body.append(actions);
    if (!online) body.append(el('p', { class: 'jf-note' }, '온라인 보관함 연결 전에는 자동 전달되지 않습니다. ‘파일로 전달’로 내려받은 파일을 Codex 채팅에 첨부해 주세요.'));
    if (state.composing?.message) body.append(button('작성하던 의견 이어쓰기', () => openEditor(state.composing.target, state.composing)));
    const items = allItems(); listButton.textContent = '의견 ' + items.length;
    if (!items.length) body.append(el('p', { class: 'jf-empty' }, '아직 남긴 의견이 없습니다. 창을 닫고 ‘위치 찍기’로 원하는 부분을 선택해 주세요.'));
    for (const item of items) {
      const card = el('article', { class: 'jf-card' });
      card.append(el('small', {}, (labels[item.status] || '확인 필요') + ' · ' + (categories[item.category] || '피드백')), el('h3', {}, item.target.label), el('p', { class: 'jf-message' }, item.message),
        el('small', {}, item.viewport.width + ' × ' + item.viewport.height + ' · ' + new Date(item.createdAt).toLocaleDateString('ko-KR')));
      const controls = el('div', { class: 'jf-actions' }); controls.append(button('위치 보기', () => locate(item)));
      if (item.status === 'local') controls.append(button('수정', () => openEditor(item.target, item)));
      if (item.resolution) card.append(el('p', { class: 'jf-resolution' }, '수정 내용: ' + item.resolution));
      if (item.deploymentUrl) { try { const u = new URL(item.deploymentUrl); if ((u.hostname === location.hostname || u.hostname.endsWith('.' + location.hostname)) && u.protocol === 'https:') controls.append(el('a', { href: u.href, target: '_blank', rel: 'noopener' }, item.status === 'done' ? '공개 사이트 보기' : '수정안 보기')); } catch {} }
      if (item.status === 'ready' && online) controls.append(button('이 수정안 공개 반영 승인', async () => {
        try { await api('PATCH', { id: item.id, version: item.version, status: 'approved' }); await refresh(); openList(); } catch (e) { status.textContent = e.message; }
      }));
      card.append(controls); body.append(card);
    }
  }
  mountToolbar(); save();
  if (key) refresh().then(() => { instruction.textContent = online ? '피드백 모드 · 온라인' : '피드백 모드 · 기기 저장'; });
})();
