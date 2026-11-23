const interestLabels = {partner: '브랜드', painting: '그림', film: '영화·연기', writing: '글', lab: '실험실 모임'};
const purposeLabels = {connect: '함께할 일', partner: '브랜드', art: '그림·영화', lab: '실험실 모임'};
const statusLabels = {new: '새 신청', contacted: '연락함', connected: '함께하는 중', archived: '보관'};

// Exported pure helpers are also used by the local security/CSV tests.
export function safeProfileLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function escapeCsvCell(value) {
  let text = String(value ?? '');
  // Quoting alone does not stop spreadsheet formulas, including leading whitespace.
  if (/^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function visiblePeople(items, {search = '', interest = '', status = ''} = {}) {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(item => {
    const selected = item.interests || [];
    const matchesInterest = !interest || (interest === 'legacy-art' ? item.purpose === 'art' && !selected.length : selected.includes(interest));
    const text = [item.name, item.email, item.brand, item.message, item.ownerNote, item.profileUrl, purposeLabels[item.purpose], ...selected.map(value => interestLabels[value])].join(' ').toLocaleLowerCase();
    return matchesInterest && (!status || item.status === status) && (!query || text.includes(query));
  });
}
export function peopleCsv(items) {
  const headers = ['이름', '이메일', '관심 분야', '관심 브랜드', '신청 목적', '하고 싶은 일', '소개 링크', '신청 위치', '연결 상태', '비공개 메모', '신청 시각', '동의 시각', '동의 문구 버전', '신청 ID'];
  const rows = items.map(item => [item.name, item.email, (item.interests || []).map(value => interestLabels[value] || value).join(' / '), item.brand, purposeLabels[item.purpose] || item.purpose, item.message, item.profileUrl, item.sourceContext, statusLabels[item.status] || item.status, item.ownerNote, item.created_at, item.consent_at, item.consentVersion, item.id]);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n') + '\r\n';
}

if (typeof document !== 'undefined') initialize();

function initialize() {
  const $ = id => document.getElementById(id);
  let key = '', items = [], activeId = null, generation = 0;
  let busy = false;
  const requests = new Set();
  const date = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '기록 없음' : new Intl.DateTimeFormat('ko-KR', {dateStyle: 'medium', timeStyle: 'short'}).format(parsed);
  };
  const node = (tag, text, className) => {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const filtered = () => visiblePeople(items, {search: $('search').value, interest: $('interest-filter').value, status: $('status-filter').value});
  const message = (text, error = false) => { $('notice').textContent = text; $('notice').classList.toggle('error', error); };
  function setBusy(value) {
    busy = value; $('refresh').disabled = value; $('export').disabled = value || !filtered().length; $('unlock').disabled = value;
  }
  function lock(text = '') {
    generation++; key = ''; items = []; activeId = null;
    for (const request of requests) request.abort(); requests.clear();
    $('person-dialog').close(); $('person-name').textContent = ''; $('person-message').textContent = '';
    $('person-links').replaceChildren(); $('person-meta').replaceChildren(); $('person-interests').textContent = '';
    $('person-note').value = ''; $('review-key').value = ''; $('people-list').replaceChildren();
    $('search').value = ''; $('interest-filter').value = ''; $('status-filter').value = '';
    $('workspace').hidden = true; $('entry').hidden = false; $('lock').hidden = true;
    setBusy(false); message(text); $('review-key').focus();
  }
  async function api(path = '', options = {}) {
    const controller = new AbortController(); requests.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/applications' + path, {
        ...options, headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + key},
        cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (response.status === 401) { lock('관리자 키를 확인하고 다시 입력해 주세요.'); throw Error('AUTH'); }
      if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw Error(response.status === 503 ? 'STORAGE' : 'REQUEST');
      return await response.json();
    } finally { clearTimeout(timeout); requests.delete(controller); }
  }
  function renderList() {
    const visible = filtered(); const fragment = document.createDocumentFragment();
    $('total-count').textContent = String(items.length);
    $('result-count').textContent = visible.length + '명 / 전체 ' + items.length + '명';
    $('export').disabled = busy || !visible.length;
    $('empty-state').hidden = visible.length > 0;
    $('empty-state').textContent = items.length ? '조건에 맞는 신청이 없습니다. 검색어나 필터를 바꿔보세요.' : '아직 남겨진 신청이 없습니다.';
    for (const item of visible) {
      const li = document.createElement('li'); const button = document.createElement('button');
      button.type = 'button'; button.className = 'person-row';
      button.setAttribute('aria-label', item.name + ' 신청 자세히 보기');
      const top = node('span', '', 'person-top');
      top.append(node('span', item.name, 'person-row-name'), node('span', statusLabels[item.status] || '새 신청', 'status status-' + (statusLabels[item.status] ? item.status : 'new')));
      const selected = (item.interests || []).map(value => interestLabels[value]).filter(Boolean);
      const tags = [...selected, item.brand].filter(Boolean).join(' · ') || purposeLabels[item.purpose] || '함께할 일';
      button.append(top, node('span', tags, 'person-row-interest'), node('span', item.message, 'person-row-message'), node('span', date(item.created_at), 'person-row-date'));
      button.addEventListener('click', () => showPerson(item.id)); li.append(button); fragment.append(li);
    }
    $('people-list').replaceChildren(fragment);
  }
  function showPerson(id) {
    const item = items.find(value => value.id === id); if (!item) return;
    activeId = id; $('person-name').textContent = item.name;
    const selected = (item.interests || []).map(value => interestLabels[value]).filter(Boolean);
    $('person-interests').textContent = [...selected, item.brand].filter(Boolean).join(' · ') || purposeLabels[item.purpose] || '함께할 일';
    $('person-message').textContent = item.message;
    const links = document.createDocumentFragment();
    const email = node('a', item.email); email.href = 'mailto:' + encodeURIComponent(item.email); links.append(email);
    const profile = safeProfileLink(item.profileUrl);
    if (profile) { const link = node('a', '소개 링크 열기 ↗'); link.href = profile; link.target = '_blank'; link.rel = 'noopener noreferrer'; links.append(link); }
    $('person-links').replaceChildren(links);
    const meta = document.createDocumentFragment();
    for (const [label, value] of [['신청', date(item.created_at)], ['동의', date(item.consent_at)], ['동의 버전', item.consentVersion || '이전 양식'], ['신청 위치', item.sourceContext || '이전 양식'], ['최근 관리', date(item.updatedAt || item.created_at)]]) meta.append(node('dt', label), node('dd', value));
    $('person-meta').replaceChildren(meta); $('person-status').value = item.status || 'new'; $('person-note').value = item.ownerNote || '';
    $('save-notice').textContent = ''; $('save-person').disabled = false;
    if (!$('person-dialog').open) $('person-dialog').showModal();
    $('close-person').focus();
  }
  async function loadPeople() {
    const version = ++generation; setBusy(true); message('신청을 불러오는 중입니다.');
    const loaded = []; let cursor = null; const seen = new Set();
    try {
      do {
        const result = await api('?limit=200' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        if (version !== generation) return;
        if (!Array.isArray(result.items) || result.truncated || (result.hasMore && !result.nextCursor)) throw Error('INCOMPLETE');
        loaded.push(...result.items); cursor = result.nextCursor || null;
        if (cursor && seen.has(cursor)) throw Error('INCOMPLETE'); if (cursor) seen.add(cursor);
        message(loaded.length + '명의 신청을 불러오는 중입니다.');
      } while (cursor);
      if (version !== generation) return;
      items = loaded; $('entry').hidden = true; $('workspace').hidden = false; $('lock').hidden = false;
      renderList(); message(items.length + '명의 신청을 불러왔습니다.');
    } catch (error) {
      if (version !== generation || error.message === 'AUTH') return;
      const text = error.message === 'STORAGE' ? '신청 저장소에 연결하지 못했습니다. 관리자 설정과 데이터베이스 준비 상태를 확인해 주세요.' : error.message === 'INCOMPLETE' ? '전체 신청을 불러오지 못했습니다. 일부만 내보내지 않도록 목록을 갱신하지 않았습니다.' : '신청을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
      if (!items.length && $('workspace').hidden) { key = ''; $('review-key').focus(); }
      message(text, true);
    } finally { if (version === generation) setBusy(false); }
  }
  $('unlock-form').addEventListener('submit', event => {
    event.preventDefault();
    if (location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) { message('신청 관리는 HTTPS 사이트 또는 로컬 개발 서버에서 열어주세요.', true); return; }
    key = $('review-key').value.trim(); $('review-key').value = ''; loadPeople();
  });
  $('lock').addEventListener('click', () => lock('신청 목록을 잠갔습니다.'));
  $('refresh').addEventListener('click', loadPeople);
  for (const id of ['search', 'interest-filter', 'status-filter']) $(id).addEventListener('input', renderList);
  $('close-person').addEventListener('click', () => $('person-dialog').close());
  $('person-dialog').addEventListener('close', () => { activeId = null; });
  $('person-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!activeId) return;
    const id = activeId, version = generation;
    $('save-person').disabled = true; $('save-notice').textContent = '저장 중입니다.';
    try {
      const result = await api('', {method: 'PATCH', body: JSON.stringify({id, status: $('person-status').value, ownerNote: $('person-note').value})});
      if (version !== generation) return;
      const item = items.find(value => value.id === id); if (item) Object.assign(item, result);
      renderList(); if (activeId === id) $('save-notice').textContent = '저장했습니다. 신청자에게 메시지는 발송되지 않습니다.';
    } catch (error) { if (version === generation && error.message !== 'AUTH' && activeId === id) $('save-notice').textContent = '저장하지 못했습니다. 입력한 내용은 유지되어 있으니 다시 시도해 주세요.'; }
    finally { if (activeId === id && version === generation) $('save-person').disabled = false; }
  });
  $('export').addEventListener('click', () => {
    const visible = filtered(); if (!key || busy || !visible.length) return;
    const url = URL.createObjectURL(new Blob([peopleCsv(visible)], {type: 'text/csv;charset=utf-8'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'jasper-people-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(visible.length + '명의 신청을 CSV로 내려받았습니다. 연락처가 포함된 비공개 파일입니다.');
  });
  window.addEventListener('pagehide', () => lock());
  window.addEventListener('pageshow', event => { if (event.persisted) lock(); });
}
