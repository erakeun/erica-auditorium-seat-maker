(function () {
  'use strict';

  const app = window.SEAT_APP;
  const engine = window.ROSTER_ENGINE;
  const XLSX = window.XLSX;
  if (!app || !engine || !XLSX) return;

  const $ = (id) => document.getElementById(id);
  const dialog = $('roster-dialog');
  const titles = { import: '명단 불러오기', auto: '자동 배치', list: '명단 보기' };
  const fieldLabels = {
    event: { name: '이름', org: '소속', title: '직함', priority: '의전순위', group: '그룹', requestedSeat: '지정좌석', note: '메모' },
    class: { name: '이름', identifier: '학번 또는 식별번호', org: '소속 또는 반', group: '그룹', requestedSeat: '지정좌석', note: '메모' }
  };
  const aliases = {
    name: ['이름', '성명', 'name'], identifier: ['학번', '식별번호', '아이디', 'id'], org: ['소속', '기관', '반', '학과'], title: ['직함', '직위'],
    priority: ['의전순위', '순위'], group: ['그룹', '조'], requestedSeat: ['지정좌석', '좌석', 'seat'], note: ['메모', '비고', 'note']
  };
  let sourceSheets = null;
  let sourceMatrix = null;
  let importPreview = [];
  let layoutPreview = null;
  let idCounter = 0;

  function makeId() {
    idCounter += 1;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `P-${window.crypto.randomUUID()}`;
    return `P-${Date.now().toString(36)}-${idCounter.toString(36)}`;
  }
  function state() { return app.getState(); }
  function currentRosterMode() { return document.querySelector('input[name="roster-mode"]:checked').value; }
  function showTab(name) {
    document.querySelectorAll('[data-roster-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.rosterTab === name));
    document.querySelectorAll('[data-roster-page]').forEach((page) => page.classList.toggle('is-active', page.dataset.rosterPage === name));
    $('roster-dialog-title').textContent = titles[name];
    if (name === 'list') renderRosterList();
    if (name === 'auto') { syncLayoutMode(); renderGroupLinks(); cancelLayoutPreview(); }
  }
  function openDialog(tab) {
    showTab(tab);
    if (!dialog.open) dialog.showModal();
    app.closeEditor();
    window.requestAnimationFrame(app.recalculateView);
  }
  function closeDialog() { dialog.close(); window.requestAnimationFrame(app.recalculateView); }

  function workbookDownload(rows, headers, filename) {
    const safeRows = rows.map((row) => headers.map((header) => safeCell(row[header])));
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...safeRows]);
    sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length * 2 + 4) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, '명단');
    XLSX.writeFile(book, filename, { compression: true });
  }
  function safeCell(value) {
    return engine.safeSpreadsheetText(value);
  }
  function csvDownload(rows, headers, filename) {
    const escape = (value) => `"${safeCell(value).replace(/"/g, '""')}"`;
    const csv = `\ufeff${[headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(escape).join(',')).join('\r\n')}`;
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    link.download = filename;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  function downloadTemplate(mode) {
    const headers = Object.values(fieldLabels[mode]);
    workbookDownload([], headers, mode === 'event' ? '행사용-명단-양식.xlsx' : '수업용-명단-양식.xlsx');
  }

  function parsePaste() {
    const text = $('roster-paste').value.replace(/\r/g, '').trim();
    if (!text) { app.showToast('붙여넣은 명단이 없습니다.'); return; }
    const lines = text.split('\n').filter((line) => line.trim());
    const matrix = lines.map((line) => line.includes('\t') ? line.split('\t') : [line]);
    const recognized = matrix[0].some((cell) => Object.values(aliases).flat().includes(String(cell).trim().toLocaleLowerCase('ko-KR')) || String(cell).trim() === '이름');
    sourceMatrix = recognized ? matrix : [['이름'], ...matrix];
    sourceSheets = null;
    prepareMapping();
  }
  async function parseFile(file) {
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const book = XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellText: true, cellDates: false });
      sourceSheets = Object.fromEntries(book.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })]));
      const picker = $('sheet-picker'); picker.replaceChildren();
      book.SheetNames.forEach((name) => picker.add(new Option(name, name)));
      $('sheet-picker-wrap').hidden = book.SheetNames.length < 2;
      sourceMatrix = sourceSheets[book.SheetNames[0]];
      prepareMapping();
    } catch (error) { app.showToast('파일을 읽지 못했습니다. .xlsx 또는 .csv 형식을 확인하세요.'); }
  }
  function prepareMapping() {
    if (!sourceMatrix || !sourceMatrix.length) { app.showToast('명단에 읽을 수 있는 행이 없습니다.'); return; }
    const headers = sourceMatrix[0].map((value, index) => String(value || `열 ${index + 1}`).trim());
    const mode = currentRosterMode();
    const container = $('mapping-fields'); container.replaceChildren();
    Object.entries(fieldLabels[mode]).forEach(([field, label]) => {
      const wrap = document.createElement('label'); wrap.textContent = label;
      const select = document.createElement('select'); select.dataset.field = field; select.add(new Option('연결 안 함', ''));
      headers.forEach((header, index) => select.add(new Option(header, String(index))));
      const match = headers.findIndex((header) => aliases[field].includes(header.trim().toLocaleLowerCase('ko-KR')));
      if (match >= 0) select.value = String(match);
      if (field === 'name' && match < 0) select.value = '0';
      wrap.append(select); container.append(wrap);
    });
    $('column-mapping').hidden = false;
    $('roster-import-preview').hidden = true;
  }

  function buildImportPreview() {
    if (!sourceMatrix || sourceMatrix.length < 2) { app.showToast('명단 데이터 행이 없습니다.'); return; }
    const mode = currentRosterMode();
    const mapping = Object.fromEntries(Array.from($('mapping-fields').querySelectorAll('select')).map((select) => [select.dataset.field, select.value === '' ? -1 : Number(select.value)]));
    if (mapping.name < 0) { app.showToast('이름 열을 연결하세요.'); return; }
    importPreview = sourceMatrix.slice(1).filter((row) => row.some((cell) => String(cell).trim())).map((row, index) => {
      const data = {};
      Object.entries(mapping).forEach(([field, column]) => { data[field] = column >= 0 ? row[column] : ''; });
      return engine.participant(data, index, mode, makeId);
    });
    renderImportPreview();
  }
  function renderImportPreview() {
    const mode = currentRosterMode();
    const fields = Object.keys(fieldLabels[mode]);
    const merge = document.querySelector('input[name="roster-merge"]:checked').value;
    const rosterToValidate = merge === 'append' ? [...state().participants, ...importPreview] : importPreview;
    const result = engine.validateRoster(rosterToValidate, app.blueprint, state().assignments,state());
    const fixedIds = new Set(Object.values(state().assignments).filter((record) => record.fixed && record.participantId).map((record) => record.participantId));
    $('import-summary').textContent = `${importPreview.length}명 · 오류 ${result.errors}건 · 안내 ${result.warnings}건 · ${merge === 'replace' ? `교체 시 고정 참가자 ${fixedIds.size}명 유지` : `기존 명단 ${state().participants.length}명에 추가`}`;
    const issues = $('import-issues'); issues.replaceChildren();
    result.issues.forEach((issue) => { const item = document.createElement('p'); item.className = `issue ${issue.level}`; item.textContent = issue.index >= 0 ? `${issue.index + 1}행: ${issue.message}` : issue.message; issues.append(item); });
    const head = $('import-table-head'); head.replaceChildren(); const tr = document.createElement('tr');
    [...fields.map((field) => fieldLabels[mode][field]), '확인'].forEach((label) => { const th = document.createElement('th'); th.textContent = label; tr.append(th); }); head.append(tr);
    const body = $('import-table-body'); body.replaceChildren();
    importPreview.forEach((person, index) => {
      const row = document.createElement('tr');
      fields.forEach((field) => { const td = document.createElement('td'); const input = document.createElement('input'); input.value = person[field] == null ? '' : person[field]; input.dataset.index = index; input.dataset.field = field; input.addEventListener('change', editImportCell); td.append(input); row.append(td); });
      const td = document.createElement('td'); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'mini-button'; remove.textContent = '삭제'; remove.addEventListener('click', () => { importPreview.splice(index, 1); renderImportPreview(); }); td.append(remove); row.append(td); body.append(row);
    });
    $('apply-roster-import').disabled = result.errors > 0;
    $('roster-import-preview').hidden = false;
  }
  function editImportCell(event) {
    const { index, field } = event.target.dataset;
    importPreview[Number(index)][field] = field === 'priority' ? (event.target.value ? Number(event.target.value) : null) : event.target.value.trim();
    renderImportPreview();
  }
  function applyImport() {
    const merge = document.querySelector('input[name="roster-merge"]:checked').value;
    const rosterToValidate = merge === 'append' ? [...state().participants, ...importPreview] : importPreview;
    const result = engine.validateRoster(rosterToValidate, app.blueprint, state().assignments,state());
    if (result.errors) { app.showToast('기존 명단을 포함한 오류를 먼저 수정하세요.'); return; }
    if (merge === 'replace') {
      const oldIds = new Set(state().participants.map((person) => person.id));
      const fixedIds = new Set(Object.values(state().assignments).filter((record) => record.fixed && record.participantId).map((record) => record.participantId));
      const fixedPeople = state().participants.filter((person) => fixedIds.has(person.id));
      state().participants = [...fixedPeople, ...importPreview].filter((person, index, all) => all.findIndex((item) => item.id === person.id) === index);
      Object.keys(state().assignments).forEach((seatId) => {
        const record = state().assignments[seatId];
        if (record.participantId && oldIds.has(record.participantId) && !record.fixed) delete state().assignments[seatId];
      });
    } else state().participants.push(...importPreview);
    state().participants.forEach((person, index) => { person.order = index; });
    app.notifyStateChanged(`명단 ${importPreview.length}명을 적용했습니다.`);
    renderRosterList(); showTab('list');
  }

  function assignmentMap() {
    const map = new Map();
    Object.entries(state().assignments).forEach(([seatId, record]) => { if (record.participantId) map.set(record.participantId, { seatId, record }); });
    return map;
  }
  function renderRosterList() {
    const query = $('roster-search').value.trim().toLocaleLowerCase('ko-KR');
    const assigned = assignmentMap();
    const people = state().participants.filter((person) => {
      if ($('unassigned-only').checked && assigned.has(person.id)) return false;
      return !query || [person.name, person.org, person.title, person.identifier].some((value) => String(value || '').toLocaleLowerCase('ko-KR').includes(query));
    });
    $('roster-count').textContent = `명단 ${state().participants.length}명`;
    $('roster-unassigned-count').textContent = `아직 자리가 없는 사람 ${state().participants.filter((person) => !assigned.has(person.id)).length}명`;
    const body = $('roster-list-body'); body.replaceChildren();
    people.forEach((person) => {
      const placement = assigned.get(person.id); const row = document.createElement('tr');
      const values = [person.name, [person.org, person.title].filter(Boolean).join(' · '), person.identifier, placement ? placement.seatId : '미배정'];
      values.forEach((value, index) => { const td = document.createElement('td'); td.textContent = value || '-'; if (index === 3 && placement) { td.className = 'seat-link'; td.addEventListener('click', () => { closeDialog(); app.selectSeat(placement.seatId, { focusMap: true }); }); } row.append(td); });
      const fixed = document.createElement('td'); fixed.textContent = placement && placement.record.fixed ? '고정' : '-'; row.append(fixed);
      const status = document.createElement('td'); status.textContent = placement ? '배정 완료' : '미배정'; row.append(status);
      const actions = document.createElement('td');
      [['수정', () => editPerson(person)], ['삭제', () => deletePerson(person)]].forEach(([label, handler]) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'mini-button'; button.textContent = label; button.addEventListener('click', handler); actions.append(button); });
      if (placement) { const lock = document.createElement('button'); lock.type = 'button'; lock.className = 'mini-button'; lock.textContent = placement.record.fixed ? '고정 해제' : '고정'; lock.addEventListener('click', () => { placement.record.fixed = !placement.record.fixed; app.notifyStateChanged(); renderRosterList(); }); actions.append(lock); }
      row.append(actions); body.append(row);
    });
    renderSwapOptions();
  }
  function editPerson(person) {
    const name = window.prompt('이름', person.name); if (name == null || !name.trim()) return;
    const org = window.prompt(person.mode === 'class' ? '소속 또는 반' : '소속', person.org); if (org == null) return;
    const title = person.mode === 'event' ? window.prompt('직함', person.title) : person.title; if (title == null) return;
    person.name = name.trim().slice(0, 40); person.org = org.trim().slice(0, 80); person.title = title.trim().slice(0, 60);
    const placement = assignmentMap().get(person.id); if (placement) { placement.record.name = person.name; placement.record.org = [person.org, person.title].filter(Boolean).join(' · ').slice(0, 80); }
    app.notifyStateChanged('명단 정보를 수정했습니다.'); renderRosterList();
  }
  function deletePerson(person) {
    const placement = assignmentMap().get(person.id);
    if (!window.confirm(`${person.name}을(를) 명단에서 삭제${placement ? '하고 좌석 배정을 해제' : ''}할까요?`)) return;
    state().participants = state().participants.filter((item) => item.id !== person.id);
    if (placement) delete state().assignments[placement.seatId];
    app.notifyStateChanged('참가자를 삭제했습니다.'); renderRosterList();
  }
  function addPerson() {
    const name = window.prompt('이름'); if (!name || !name.trim()) return;
    const mode = window.confirm('행사용 참가자입니까?\n확인: 행사용 / 취소: 수업용') ? 'event' : 'class';
    state().participants.push(engine.participant({ name }, state().participants.length, mode, makeId));
    app.notifyStateChanged('참가자를 추가했습니다.'); renderRosterList();
  }
  function renderSwapOptions() {
    const assigned = assignmentMap();
    [$('swap-first'), $('swap-second')].forEach((select, index) => { const current = select.value; select.replaceChildren(new Option(index ? '둘째 사람' : '첫 사람', '')); state().participants.filter((person) => assigned.has(person.id)).forEach((person) => select.add(new Option(`${person.name} · ${assigned.get(person.id).seatId}`, person.id))); select.value = current; });
  }
  function swapSeats() {
    const first = $('swap-first').value; const second = $('swap-second').value;
    const map = assignmentMap(); if (!first || !second || first === second || !map.has(first) || !map.has(second)) { app.showToast('서로 다른 배정자 두 명을 선택하세요.'); return; }
    const a = map.get(first); const b = map.get(second);
    if(a.record.fixed || b.record.fixed || !window.GROUP_ENGINE.allowed(state(),state().participants.find(p=>p.id===first),b.seatId) || !window.GROUP_ENGINE.allowed(state(),state().participants.find(p=>p.id===second),a.seatId)){app.showToast('고정·그룹 제한·비워두기 조건과 충돌하여 맞바꾸지 않았습니다.');return;}
    state().assignments[a.seatId] = b.record; state().assignments[b.seatId] = a.record;
    app.notifyStateChanged('두 사람의 좌석을 맞바꿨습니다.'); renderRosterList();
  }

  function optionsFromForm(mode) {
    const zones = (id) => Array.from($(id).querySelectorAll('input:checked')).map((input) => input.value);
    return {
      groupOnly: $('group-only-layout').checked,
      ignoreGroups: $('ignore-group-limits').checked,
      scope: document.querySelector('input[name="layout-scope"]:checked').value,
      centerDirection: $('center-direction').value,
      vipArea: { zones: zones('vip-zones'), startRow: $('vip-start-row').value, endRow: $('vip-end-row').value },
      generalArea: { zones: zones('general-zones'), startRow: $('general-start-row').value, endRow: $('general-end-row').value },
      classPattern: $('class-pattern').value,
      classArea: { zones: zones('class-zones'), startRow: $('class-start-row').value, endRow: $('class-end-row').value }
    };
  }
  function previewLayout() {
    const mode = document.querySelector('input[name="layout-mode"]:checked').value;
    const participants = state().participants.filter((person) => person.mode === mode);
    if (!participants.length) { app.showToast(`${mode === 'event' ? '행사용' : '수업용'} 명단이 없습니다.`); return; }
    const options = optionsFromForm(mode);
    if (options.scope === 'all' && !window.confirm('고정 좌석과 사용 불가 좌석을 제외한 기존 배정을 전체 재배치할까요?')) return;
    if(options.ignoreGroups && !window.confirm('이번 배치에서 그룹 제한을 해제할까요? 다른 그룹 좌석에도 배정될 수 있습니다. 비워두기·사용 불가는 유지합니다.'))return;
    layoutPreview = engine.buildPreview({ blueprint: app.blueprint, participants, assignments: state().assignments, groupState: state(), mode, options });
    layoutPreview.revision = app.getRevision();
    layoutPreview.mode = mode;
    layoutPreview.options = options;
    renderLayoutPreview();
  }
  function renderLayoutPreview() {
    const allowPartial = $('allow-partial').checked;
    const people = state().participants.filter((person) => person.mode === layoutPreview.mode);
    const assignedIds = new Set(layoutPreview.mappings.map((item) => item.participantId));
    const assignedCount = people.filter((person) => assignedIds.has(person.id)).length;
    $('layout-summary').textContent = `명단 ${people.length}명 · 배정 ${assignedCount}명 · 아직 자리가 없는 사람 ${layoutPreview.unassigned.length}명 · 충돌 ${layoutPreview.conflicts.length}건`;
    const conflicts = $('layout-conflicts'); conflicts.replaceChildren();
    state().groups.forEach(group=>{
      const linked=people.filter(p=>window.GROUP_ENGINE.targetFor(state(),p)===group.id);
      const stat=window.GROUP_ENGINE.stats({...state(),assignments:layoutPreview.assignments},app.blueprint,group.id);
      const p=document.createElement('p');p.textContent=`${group.name}: 연결 ${linked.length}명 · 배정 ${stat.assigned}명 · 추가 가능 ${stat.available}석 · 미배정 ${linked.filter(p=>!assignedIds.has(p.id)).length}명`;conflicts.append(p);
    });
    [...layoutPreview.conflicts.map((item) => item.message), ...(layoutPreview.unassigned.length ? [`미배정: ${layoutPreview.unassigned.map((person) => person.name).join(', ')}`] : [])].forEach((message) => { const p = document.createElement('p'); p.className = 'issue error'; p.textContent = message; conflicts.append(p); });
    const byPerson = new Map(layoutPreview.mappings.map((item) => [item.participantId, item.seatId]));
    const body = $('layout-table-body'); body.replaceChildren();
    people.forEach((person) => { const row = document.createElement('tr'); [person.name, byPerson.get(person.id) || '미배정', assignedIds.has(person.id) ? '배정 예정' : '확인 필요'].forEach((value) => { const td = document.createElement('td'); td.textContent = value; row.append(td); }); body.append(row); });
    $('apply-layout').disabled = (layoutPreview.unassigned.length > 0 && !allowPartial) || layoutPreview.conflicts.some(c=>c.blocking);
    $('cancel-layout-preview').disabled = false; $('layout-preview').hidden = false;
  }
  function applyLayout() {
    if (!layoutPreview) return;
    if(layoutPreview.revision!==app.getRevision()){app.showToast('그룹 또는 배정 내용이 바뀌었습니다. 미리보기를 다시 만드세요.');cancelLayoutPreview();return;}
    if(layoutPreview.conflicts.some(c=>c.blocking)){app.showToast('보존/고정 배정 충돌을 먼저 해결하세요.');return;}
    if (layoutPreview.unassigned.length && !$('allow-partial').checked) { app.showToast('미배정 인원을 확인하거나 부분 배치를 선택하세요.'); return; }
    state().layoutSettings = { mode: layoutPreview.mode, ...layoutPreview.options };
    const targetIds = new Set(state().participants.filter((person) => person.mode === layoutPreview.mode).map((person) => person.id));
    const appliedCount = layoutPreview.mappings.filter((item) => targetIds.has(item.participantId)).length;
    app.replaceAssignments(layoutPreview.assignments, `배치 ${appliedCount}명을 적용했습니다.`);
    $('undo-layout').disabled = false; cancelLayoutPreview(); renderRosterList();
  }
  function cancelLayoutPreview() { layoutPreview = null; $('layout-preview').hidden = true; $('cancel-layout-preview').disabled = true; }
  function undoLayout() { app.undo(); cancelLayoutPreview(); renderRosterList(); $('undo-layout').disabled = !app.canUndo(); }
  function syncLayoutMode() { const mode = document.querySelector('input[name="layout-mode"]:checked').value; $('event-layout-settings').hidden = mode !== 'event'; $('class-layout-settings').hidden = mode !== 'class'; }

  function exportRows(order) {
    const assigned = assignmentMap();
    const rows = state().participants.map((person) => ({
      이름: person.name, '소속·직함 또는 반': [person.org, person.title].filter(Boolean).join(' · '), 식별번호: person.identifier, 배정좌석: assigned.get(person.id)?.seatId || '', 고정여부: assigned.get(person.id)?.record.fixed ? '고정' : '', 배정상태: assigned.has(person.id) ? '배정 완료' : '미배정', 메모: person.note, 명단그룹:person.group, 좌석그룹:state().groups.find(g=>g.id===state().seatGroups[assigned.get(person.id)?.seatId])?.name||'', 비워두기:''
    }));
    if(order==='seat'){
      const represented=new Set(rows.map(r=>r.배정좌석));
      app.blueprint.seats.forEach(seat=>{if(!represented.has(seat.id)){const r=app.getRecord(seat.id);rows.push({이름:r.name||'','소속·직함 또는 반':r.org||'',식별번호:'',배정좌석:seat.id,고정여부:r.fixed?'고정':'',배정상태:r.status==='unavailable'?'사용 불가':state().heldSeats[seat.id]?'비워두기':r.status==='assigned'?'배정 완료':'빈 좌석',메모:r.note||'',명단그룹:'',좌석그룹:state().groups.find(g=>g.id===state().seatGroups[seat.id])?.name||'',비워두기:state().heldSeats[seat.id]?'비워두기':''});}});
    }
    return rows.sort(order === 'seat' ? (a, b) => (a.배정좌석 || 'ZZZ').localeCompare(b.배정좌석 || 'ZZZ') : (a, b) => a.이름.localeCompare(b.이름, 'ko'));
  }
  function exportResult(order, format) {
    const headers = ['이름', '소속·직함 또는 반', '식별번호', '배정좌석', '고정여부', '배정상태', '명단그룹', '좌석그룹', '비워두기', '메모']; const rows = exportRows(order); const base = order === 'seat' ? '좌석순-배정명단' : '이름순-배정명단';
    if (format === 'xlsx') workbookDownload(rows, headers, `${base}.xlsx`); else csvDownload(rows, headers, `${base}.csv`);
  }

  function populateControls() {
    ['vip-start-row', 'vip-end-row', 'general-start-row', 'general-end-row', 'class-start-row', 'class-end-row'].forEach((id) => { const select = $(id); engine.ROWS.forEach((row) => select.add(new Option(`${row}열`, row))); });
    $('vip-start-row').value = 'A'; $('vip-end-row').value = 'C'; $('general-start-row').value = 'A'; $('general-end-row').value = 'N'; $('class-start-row').value = 'A'; $('class-end-row').value = 'N';
    [['vip-zones', ['C']], ['general-zones', engine.ZONE_ORDER], ['class-zones', engine.ZONE_ORDER]].forEach(([id, selected]) => { engine.ZONE_ORDER.forEach((zone) => { const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = zone; input.checked = selected.includes(zone); label.append(input, document.createTextNode(zone)); $(id).append(label); }); });
  }
  function bind() {
    $('open-roster-import').addEventListener('click', () => openDialog('import')); $('open-auto-layout').addEventListener('click', () => openDialog('auto')); $('open-roster-list').addEventListener('click', () => openDialog('list'));
    $('close-roster-dialog').addEventListener('click', closeDialog); dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
    document.querySelectorAll('[data-roster-tab]').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.rosterTab)));
    $('download-event-template').addEventListener('click', () => downloadTemplate('event')); $('download-class-template').addEventListener('click', () => downloadTemplate('class'));
    $('roster-file').addEventListener('change', () => parseFile($('roster-file').files[0])); $('sheet-picker').addEventListener('change', () => { sourceMatrix = sourceSheets[$('sheet-picker').value]; prepareMapping(); }); $('analyze-paste').addEventListener('click', parsePaste);
    document.querySelectorAll('input[name="roster-mode"]').forEach((input) => input.addEventListener('change', () => { if (sourceMatrix) prepareMapping(); }));
    $('build-roster-preview').addEventListener('click', buildImportPreview); $('apply-roster-import').addEventListener('click', applyImport);
    $('roster-search').addEventListener('input', renderRosterList); $('unassigned-only').addEventListener('change', renderRosterList); $('add-participant').addEventListener('click', addPerson); $('swap-seats').addEventListener('click', swapSeats);
    document.querySelectorAll('input[name="layout-mode"]').forEach((input) => input.addEventListener('change', syncLayoutMode)); $('preview-layout').addEventListener('click', previewLayout); $('reshuffle-layout').addEventListener('click', previewLayout); $('cancel-layout-preview').addEventListener('click', cancelLayoutPreview); $('apply-layout').addEventListener('click', applyLayout); $('undo-layout').addEventListener('click', undoLayout); $('allow-partial').addEventListener('change', () => { if (layoutPreview) renderLayoutPreview(); });
    $('export-name-xlsx').addEventListener('click', () => exportResult('name', 'xlsx')); $('export-seat-xlsx').addEventListener('click', () => exportResult('seat', 'xlsx')); $('export-name-csv').addEventListener('click', () => exportResult('name', 'csv')); $('export-seat-csv').addEventListener('click', () => exportResult('seat', 'csv'));
  }

  function renderGroupLinks(){
    const box=$('group-link-fields');box.replaceChildren();
    const sources=[...new Set(state().participants.map(p=>p.group||''))];
    sources.forEach(source=>{const label=document.createElement('label');label.textContent=source||'(명단 그룹 없음)';const select=document.createElement('select');select.dataset.source=source;select.add(new Option('연결 안 함',''));state().groups.forEach(g=>select.add(new Option(g.name,g.id)));select.value=state().groupLinks.find(l=>l.source===source)?.target||'';label.append(select);box.append(label);});
    if(!sources.length)box.textContent='명단이 없습니다. 그룹 안내도만 만들 때는 명단이 필요하지 않습니다.';
  }
  $('save-group-links').onclick=()=>{state().groupLinks=Array.from($('group-link-fields').querySelectorAll('select')).filter(s=>s.value).map(s=>({source:s.dataset.source,target:s.value}));app.notifyStateChanged('명단 그룹 연결을 저장했습니다. 기존 배정은 이동하지 않습니다.');cancelLayoutPreview();};
  document.querySelectorAll('#group-only-layout, #ignore-group-limits, #event-layout-settings input, #event-layout-settings select, #class-layout-settings input, #class-layout-settings select, input[name="layout-scope"], input[name="layout-mode"]').forEach(input=>input.addEventListener('change',cancelLayoutPreview));
  window.addEventListener('seating-change',()=>{$('undo-layout').disabled=!app.canUndo();});
  populateControls(); bind();
})();
