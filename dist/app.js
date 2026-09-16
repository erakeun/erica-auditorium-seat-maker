(function () {
  'use strict';

  const blueprint = window.SEAT_BLUEPRINT;
  const STORAGE_KEY = 'erica-conference-hall-3f-v1';
  const SCHEMA = 'erica-conference-hall-3f-seating';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const COLORS = ['#0d5c8f', '#169873', '#d36b2c', '#7457b8', '#c1456f', '#198fa4', '#586b7a'];
  const SEAT_WIDTH = 32;
  const SEAT_HEIGHT = 34;
  const SEAT_GAP = 6;
  const SEAT_PITCH = SEAT_WIDTH + SEAT_GAP;
  const DIAGONAL_STEP = SEAT_PITCH / Math.sqrt(2);
  const OUTER_AISLE_CENTER_GAP = 68;
  const EMPTY_RECORD = Object.freeze({ status: 'empty', name: '', org: '', note: '', color: COLORS[0], participantId: '', fixed: false });
  const CONTENT_BOUNDS = Object.freeze({ left: 52, top: 20, right: 1548, bottom: 990 });
  const MAX_SCALE = 2.5;

  const seatById = new Map(blueprint.seats.map((seat) => [seat.id, seat]));
  const seatElements = new Map();
  let state = createEmptyState();
  let selectedSeatId = null;
  let labelMode = 'id';
  let activeColor = COLORS[0];
  let saveTimer = null;
  let toastTimer = null;
  let transform = { scale: 1, x: 0, y: 0 };
  let dragState = null;
  const pointerPositions = new Map();
  let pinchState = null;
  let wheelFrame = null;
  let wheelDelta = 0;
  let wheelPoint = null;
  let fitScale = .28;
  let isFitView = true;
  let restoreLabelMode = null;

  const els = {
    eventName: document.getElementById('event-name'),
    eventDate: document.getElementById('event-date'),
    summaryEventName: document.getElementById('summary-event-name'),
    summaryEventDate: document.getElementById('summary-event-date'),
    printEventName: document.getElementById('print-event-name'),
    printEventDate: document.getElementById('print-event-date'),
    saveStatus: document.getElementById('save-status'),
    countAssigned: document.getElementById('count-assigned'),
    countEmpty: document.getElementById('count-empty'),
    countUnavailable: document.getElementById('count-unavailable'),
    mapStatic: document.getElementById('map-static'),
    mapSeats: document.getElementById('map-seats'),
    mapViewport: document.getElementById('map-viewport'),
    seatMap: document.getElementById('seat-map'),
    editorPanel: document.getElementById('editor-panel'),
    panelScrim: document.getElementById('panel-scrim'),
    editorTitle: document.getElementById('editor-title'),
    closeEditor: document.getElementById('close-editor'),
    seatForm: document.getElementById('seat-form'),
    personName: document.getElementById('person-name'),
    personOrg: document.getElementById('person-org'),
    personNote: document.getElementById('person-note'),
    seatFixed: document.getElementById('seat-fixed'),
    colorOptions: document.getElementById('color-options'),
    clearSeat: document.getElementById('clear-seat'),
    searchInput: document.getElementById('search-input'),
    searchResults: document.getElementById('search-results'),
    showSeatId: document.getElementById('show-seat-id'),
    showAssignee: document.getElementById('show-assignee'),
    zoomOut: document.getElementById('zoom-out'),
    zoomIn: document.getElementById('zoom-in'),
    zoomFit: document.getElementById('zoom-fit'),
    zoomValue: document.getElementById('zoom-value'),
    exportButton: document.getElementById('export-button'),
    importButton: document.getElementById('import-button'),
    importFile: document.getElementById('import-file'),
    printButton: document.getElementById('print-button'),
    resetButton: document.getElementById('reset-button'),
    toast: document.getElementById('toast')
  };

  function createEmptyState() {
    return {
      schema: SCHEMA,
      version: 2,
      event: { name: '', date: '' },
      assignments: {},
      participants: [],
      layoutSettings: {},
      updatedAt: new Date().toISOString()
    };
  }

  function svgNode(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function drawStaticMap() {
    const stage = svgNode('a', {
      class: 'stage stage-link',
      href: 'https://erakeun.github.io/conference-hall-led-maker/',
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': '중강당 LED 현수막 제작기 열기'
    });
    stage.append(
      svgNode('rect', { class: 'stage-shell', x: 520, y: 28, width: 560, height: 92, rx: 14 }),
      svgNode('rect', { class: 'stage-accent', x: 520, y: 28, width: 560, height: 8, rx: 4 }),
      svgNode('text', { class: 'stage-title', x: 800, y: 72 }, '스크린 · 무대'),
      svgNode('text', { class: 'stage-subtitle', x: 800, y: 98 }, 'SCREEN / STAGE · 화면 위쪽'),
      svgNode('path', { d: 'M 700 133 Q 800 152 900 133', fill: 'none', stroke: '#96aebb', 'stroke-width': 2 }),
      svgNode('text', { class: 'orientation-note', x: 800, y: 158 }, 'A열  ─  무대에 가장 가까운 열')
    );
    els.mapStatic.append(stage);

    const labels = [
      { x: 205, y: 760, id: 'L1', name: '왼쪽 외측', count: 60 },
      { x: 517, y: 190, id: 'L2', name: '왼쪽 내측', count: 82 },
      { x: 800, y: 190, id: 'C', name: '중앙', count: 126 },
      { x: 1083, y: 190, id: 'R2', name: '오른쪽 내측', count: 79 },
      { x: 1395, y: 760, id: 'R1', name: '오른쪽 외측', count: 59 }
    ];
    labels.forEach((label) => {
      els.mapStatic.append(
        svgNode('text', { class: 'zone-label', x: label.x, y: label.y }, `${label.id} · ${label.name}`),
        svgNode('text', { class: 'zone-count', x: label.x, y: label.y + 19 }, `${label.count}석`)
      );
    });

    const leftOuterAisle = outerAisleGeometry('left');
    const rightOuterAisle = outerAisleGeometry('right');
    const firstRowCenter = rowY(0) + SEAT_HEIGHT / 2;
    const lastRowCenter = rowY(13) + SEAT_HEIGHT / 2;
    const aisles = [
      leftOuterAisle,
      { labelX: 611, labelY: 222, d: `M 611 ${firstRowCenter - 34} L 611 ${lastRowCenter + 34}` },
      { labelX: 989, labelY: 222, d: `M 989 ${firstRowCenter - 34} L 989 ${lastRowCenter + 34}` },
      rightOuterAisle
    ];
    aisles.forEach((aisle) => {
      els.mapStatic.append(svgNode('path', { class: 'aisle-line', d: aisle.d }));
      els.mapStatic.append(svgNode('text', { class: 'aisle-label', x: aisle.labelX, y: aisle.labelY }, '통로'));
    });

    blueprint.rows.forEach((row, rowIndex) => {
      const y = rowY(rowIndex) + 17;
      els.mapStatic.append(
        svgNode('text', { class: 'row-label', x: 621, y }, row),
        svgNode('text', { class: 'row-label', x: 979, y }, row)
      );
    });

    [650, 800, 950].forEach((x) => {
      const door = svgNode('g', { class: 'entrance', transform: `translate(${x} 952)`, 'aria-label': '객석 뒤쪽 출입문' });
      door.append(
        svgNode('path', { class: 'entrance-wall', d: 'M -36 0 H -18 M 18 0 H 36' }),
        svgNode('path', { class: 'entrance-leaf', d: 'M -18 0 V -24 A 24 24 0 0 1 6 0 M 18 0 V -24 A 24 24 0 0 0 -6 0' }),
        svgNode('text', { class: 'entrance-label', x: 0, y: 25 }, '출입문')
      );
      els.mapStatic.append(door);
    });
  }

  function rowY(rowIndex) {
    return 230 + rowIndex * 51.5;
  }

  function rowWidth(count) {
    return count * SEAT_WIDTH + (count - 1) * SEAT_GAP;
  }

  function innerRowEdges(zoneId, rowIndex, count) {
    const width = rowWidth(count);
    if (zoneId === 'L2') return { left: 590 - width, right: 590 };
    if (zoneId === 'R2') return { left: 1010, right: 1010 + width };
    return { left: 800 - width / 2, right: 800 + width / 2 };
  }

  function seatPosition(seat) {
    const row = seat.rowIndex;
    const centerY = rowY(row) + SEAT_HEIGHT / 2;
    let seatCenterX;
    let seatCenterY = centerY;
    let rotation = 0;

    if (seat.zoneId === 'C') {
      const edges = innerRowEdges('C', row, seat.rowCount);
      seatCenterX = edges.left + SEAT_WIDTH / 2 + (seat.number - 1) * SEAT_PITCH;
    } else if (seat.zoneId === 'L2') {
      const edges = innerRowEdges('L2', row, seat.rowCount);
      seatCenterX = edges.left + SEAT_WIDTH / 2 + (seat.number - 1) * SEAT_PITCH;
    } else if (seat.zoneId === 'R2') {
      const edges = innerRowEdges('R2', row, seat.rowCount);
      seatCenterX = edges.left + SEAT_WIDTH / 2 + (seat.number - 1) * SEAT_PITCH;
    } else if (seat.zoneId === 'L1') {
      const innerCount = blueprint.zones.find((zone) => zone.id === 'L2').counts[row];
      const innerEdges = innerRowEdges('L2', row, innerCount);
      const anchorX = innerEdges.left + SEAT_WIDTH / 2 - OUTER_AISLE_CENTER_GAP;
      const outwardSteps = seat.rowCount - seat.number;
      seatCenterX = anchorX - outwardSteps * DIAGONAL_STEP;
      seatCenterY = centerY - outwardSteps * DIAGONAL_STEP;
      rotation = 45;
    } else {
      const innerCount = blueprint.zones.find((zone) => zone.id === 'R2').counts[row];
      const innerEdges = innerRowEdges('R2', row, innerCount);
      const anchorX = innerEdges.right - SEAT_WIDTH / 2 + OUTER_AISLE_CENTER_GAP;
      const outwardSteps = seat.number - 1;
      seatCenterX = anchorX + outwardSteps * DIAGONAL_STEP;
      seatCenterY = centerY - outwardSteps * DIAGONAL_STEP;
      rotation = -45;
    }

    return {
      x: seatCenterX - SEAT_WIDTH / 2,
      y: seatCenterY - SEAT_HEIGHT / 2,
      width: SEAT_WIDTH,
      height: SEAT_HEIGHT,
      rotation,
      centerX: seatCenterX,
      centerY: seatCenterY
    };
  }

  function outerAisleGeometry(side) {
    const outerZoneId = side === 'left' ? 'L1' : 'R1';
    const innerZoneId = side === 'left' ? 'L2' : 'R2';
    const points = [];
    for (let rowIndex = 0; rowIndex < 9; rowIndex += 1) {
      const outerCount = blueprint.zones.find((zone) => zone.id === outerZoneId).counts[rowIndex];
      const innerCount = blueprint.zones.find((zone) => zone.id === innerZoneId).counts[rowIndex];
      const outerNumber = side === 'left' ? outerCount : 1;
      const innerNumber = side === 'left' ? 1 : innerCount;
      const outerSeat = seatById.get(`${outerZoneId}-${blueprint.rows[rowIndex]}-${String(outerNumber).padStart(2, '0')}`);
      const innerSeat = seatById.get(`${innerZoneId}-${blueprint.rows[rowIndex]}-${String(innerNumber).padStart(2, '0')}`);
      const outerPos = seatPosition(outerSeat);
      const innerPos = seatPosition(innerSeat);
      points.push({
        x: (outerPos.centerX + innerPos.centerX) / 2,
        y: (outerPos.centerY + innerPos.centerY) / 2
      });
    }
    const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`];
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const middleY = (previous.y + current.y) / 2;
      commands.push(
        `L ${previous.x.toFixed(2)} ${middleY.toFixed(2)}`,
        `L ${current.x.toFixed(2)} ${middleY.toFixed(2)}`,
        `L ${current.x.toFixed(2)} ${current.y.toFixed(2)}`
      );
    }
    return {
      labelX: points[0].x,
      labelY: points[0].y - 14,
      d: commands.join(' ')
    };
  }

  function drawSeats() {
    blueprint.seats.forEach((seat) => {
      const pos = seatPosition(seat);
      const group = svgNode('g', {
        class: 'seat status-empty',
        'data-seat-id': seat.id,
        role: 'button',
        tabindex: '0',
        'aria-label': `${seat.id}, 빈 좌석`
      });
      const icon = svgNode('g', {
        class: 'seat-icon',
        transform: `rotate(${pos.rotation} ${pos.centerX} ${pos.centerY})`
      });
      const rect = svgNode('rect', { x: pos.x, y: pos.y, width: pos.width, height: pos.height, rx: 6 });
      const backrest = svgNode('path', {
        class: 'seat-back',
        d: `M ${pos.x + 6} ${pos.y + 5} L ${pos.x + pos.width - 6} ${pos.y + 5}`
      });
      const text = svgNode('text', { x: pos.centerX, y: pos.centerY + .5 }, `${seat.number}`);
      icon.append(rect, backrest);
      group.append(icon, text);
      group.addEventListener('click', () => selectSeat(seat.id));
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectSeat(seat.id);
        }
      });
      els.mapSeats.append(group);
      seatElements.set(seat.id, { group, text });
    });
  }

  function getRecord(id) {
    return state.assignments[id] || EMPTY_RECORD;
  }

  function normalizeRecord(record) {
    const status = ['empty', 'assigned', 'unavailable'].includes(record.status) ? record.status : 'empty';
    return {
      status,
      name: String(record.name || '').slice(0, 40),
      org: String(record.org || '').slice(0, 80),
      note: String(record.note || '').slice(0, 240),
      color: COLORS.includes(record.color) ? record.color : COLORS[0],
      participantId: String(record.participantId || '').slice(0, 80),
      fixed: Boolean(record.fixed)
    };
  }

  function validateImportedData(data) {
    if (!data || typeof data !== 'object' || data.schema !== SCHEMA || ![1, 2].includes(data.version)) {
      throw new Error('이 도구에서 저장한 JSON 파일이 아닙니다.');
    }
    if (!data.event || typeof data.event !== 'object' || !data.assignments || typeof data.assignments !== 'object' || Array.isArray(data.assignments)) {
      throw new Error('파일 구조가 올바르지 않습니다.');
    }
    const next = createEmptyState();
    next.event.name = String(data.event.name || '').slice(0, 80);
    next.event.date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.event.date || '')) ? String(data.event.date) : '';
    Object.entries(data.assignments).forEach(([id, record]) => {
      if (!seatById.has(id) || !record || typeof record !== 'object') throw new Error(`알 수 없는 좌석 정보가 있습니다: ${id}`);
      const normalized = normalizeRecord(record);
      if (normalized.status !== 'empty' || normalized.name || normalized.org || normalized.note) next.assignments[id] = normalized;
    });
    if (data.version >= 2 && Array.isArray(data.participants)) {
      const ids = new Set();
      next.participants = data.participants.map((person, index) => {
        if (!person || typeof person !== 'object') throw new Error(`명단 ${index + 1}행이 올바르지 않습니다.`);
        const normalized = window.ROSTER_ENGINE.participant(person, index, person.mode, (position) => `P-${String(position + 1).padStart(6, '0')}`);
        if (!normalized.name || ids.has(normalized.id)) throw new Error(`명단 ${index + 1}행의 이름 또는 참가자 ID를 확인하세요.`);
        ids.add(normalized.id);
        return normalized;
      });
      next.layoutSettings = data.layoutSettings && typeof data.layoutSettings === 'object' ? { ...data.layoutSettings } : {};
    }
    next.updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();
    return next;
  }

  function truncateLabel(value, limit) {
    const text = String(value || '').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(1, limit - 1))}…`;
  }

  function renderSeat(id) {
    const seat = seatById.get(id);
    const record = getRecord(id);
    const entry = seatElements.get(id);
    entry.group.setAttribute('class', `seat status-${record.status}${selectedSeatId === id ? ' is-selected' : ''}`);
    entry.group.style.setProperty('--seat-color', record.color || COLORS[0]);
    const showingName = labelMode === 'name' && record.status === 'assigned' && record.name;
    const label = showingName
      ? truncateLabel(record.name, 5)
      : String(seat.number);
    entry.text.textContent = label;
    if (showingName && label.length >= 4) {
      entry.text.setAttribute('textLength', '26');
      entry.text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
    } else {
      entry.text.removeAttribute('textLength');
      entry.text.removeAttribute('lengthAdjust');
    }
    const readableStatus = record.status === 'assigned' ? `배정 완료, ${record.name || '이름 없음'}` : record.status === 'unavailable' ? '사용 불가' : '빈 좌석';
    entry.group.setAttribute('aria-label', `${id}, ${readableStatus}`);
  }

  function renderAll() {
    blueprint.seats.forEach((seat) => renderSeat(seat.id));
    renderSummary();
    updateEventText();
  }

  function renderSummary() {
    let assigned = 0;
    let unavailable = 0;
    blueprint.seats.forEach((seat) => {
      const status = getRecord(seat.id).status;
      if (status === 'assigned') assigned += 1;
      if (status === 'unavailable') unavailable += 1;
    });
    els.countAssigned.textContent = String(assigned);
    els.countUnavailable.textContent = String(unavailable);
    els.countEmpty.textContent = String(blueprint.total - assigned - unavailable);
  }

  function formatDate(value) {
    if (!value) return '행사일 미지정';
    const [year, month, day] = value.split('-');
    return `${year}. ${Number(month)}. ${Number(day)}.`;
  }

  function updateEventText() {
    const name = state.event.name.trim() || '행사명을 입력하세요';
    const printName = state.event.name.trim() || '3층 좌석 배치';
    const date = formatDate(state.event.date);
    els.summaryEventName.textContent = name;
    els.summaryEventDate.textContent = date;
    els.printEventName.textContent = printName;
    els.printEventDate.textContent = date;
  }

  function selectSeat(id, options) {
    if (!seatById.has(id)) return;
    const previous = selectedSeatId;
    selectedSeatId = id;
    if (previous && seatElements.has(previous)) renderSeat(previous);
    renderSeat(id);
    populateEditor(id);
    openEditor();
    if (options && options.focusMap) {
      focusSeatOnMap(id);
      const group = seatElements.get(id).group;
      group.classList.add('is-search-hit');
      window.setTimeout(() => group.classList.remove('is-search-hit'), 2400);
    }
  }

  function populateEditor(id) {
    const record = getRecord(id);
    els.editorTitle.textContent = id;
    const statusInput = els.seatForm.querySelector(`input[name="seat-status"][value="${record.status}"]`);
    if (statusInput) statusInput.checked = true;
    els.personName.value = record.name;
    els.personOrg.value = record.org;
    els.personNote.value = record.note;
    els.seatFixed.checked = Boolean(record.fixed);
    activeColor = record.color || COLORS[0];
    updateColorButtons();
    updateFormDisabledState();
  }

  function openEditor() {
    els.editorPanel.classList.add('is-open');
    els.editorPanel.setAttribute('aria-hidden', 'false');
    els.panelScrim.classList.add('is-open');
    window.requestAnimationFrame(recalculateView);
  }

  function closeEditor() {
    els.editorPanel.classList.remove('is-open');
    els.editorPanel.setAttribute('aria-hidden', 'true');
    els.panelScrim.classList.remove('is-open');
    window.requestAnimationFrame(recalculateView);
  }

  function createColorOptions() {
    COLORS.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'color-choice';
      button.style.setProperty('--choice-color', color);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', `색상 ${index + 1}`);
      const dot = document.createElement('i');
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
      button.addEventListener('click', () => {
        activeColor = color;
        updateColorButtons();
      });
      els.colorOptions.append(button);
    });
    updateColorButtons();
  }

  function updateColorButtons() {
    Array.from(els.colorOptions.children).forEach((button, index) => {
      const active = COLORS[index] === activeColor;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
  }

  function updateFormDisabledState() {
    const status = new FormData(els.seatForm).get('seat-status');
    const disabled = status === 'unavailable';
    [els.personName, els.personOrg, els.personNote].forEach((input) => {
      input.disabled = disabled;
    });
    els.seatFixed.disabled = disabled;
    if (disabled) els.seatFixed.checked = false;
    els.colorOptions.setAttribute('aria-disabled', String(disabled));
    Array.from(els.colorOptions.children).forEach((button) => { button.disabled = disabled; });
  }

  function saveSeatFromForm(event) {
    event.preventDefault();
    if (!selectedSeatId) return;
    const status = String(new FormData(els.seatForm).get('seat-status') || 'empty');
    const previousRecord = getRecord(selectedSeatId);
    const record = normalizeRecord({
      status,
      name: status === 'unavailable' ? '' : els.personName.value,
      org: status === 'unavailable' ? '' : els.personOrg.value,
      note: status === 'unavailable' ? '' : els.personNote.value,
      color: activeColor,
      participantId: status === 'assigned' ? previousRecord.participantId : '',
      fixed: status === 'assigned' && els.seatFixed.checked
    });
    if (status === 'empty' && (record.name || record.org || record.note)) record.status = 'assigned';
    if (record.status === 'empty') delete state.assignments[selectedSeatId];
    else state.assignments[selectedSeatId] = record;
    renderSeat(selectedSeatId);
    renderSummary();
    queueSave();
    closeEditor();
    showToast(`${selectedSeatId} 좌석 정보를 저장했습니다.`);
  }

  function clearSelectedSeat() {
    if (!selectedSeatId) return;
    delete state.assignments[selectedSeatId];
    renderSeat(selectedSeatId);
    renderSummary();
    populateEditor(selectedSeatId);
    queueSave();
    showToast(`${selectedSeatId} 배정을 해제했습니다.`);
  }

  function hasContent() {
    return Boolean(state.event.name || state.event.date || Object.keys(state.assignments).length || state.participants.length);
  }

  function setSaveStatus(saving) {
    els.saveStatus.classList.toggle('is-saving', saving);
    els.saveStatus.lastElementChild.textContent = saving ? '저장 중…' : '브라우저에 저장됨';
  }

  function queueSave() {
    window.clearTimeout(saveTimer);
    setSaveStatus(true);
    saveTimer = window.setTimeout(() => {
      state.updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setSaveStatus(false);
      } catch (error) {
        els.saveStatus.lastElementChild.textContent = '자동저장 실패';
        showToast('브라우저 자동저장에 실패했습니다. JSON 파일로 저장해 주세요.');
      }
    }, 280);
  }

  function loadAutoSave() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      state = validateImportedData(JSON.parse(raw));
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
      showToast('손상된 자동저장 데이터는 불러오지 않았습니다.');
    }
  }

  function exportJson() {
    state.updatedAt = new Date().toISOString();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (state.event.name.trim() || 'ERICA-3층-좌석배치').replace(/[\\/:*?"<>|]/g, '-').slice(0, 50);
    link.href = url;
    link.download = `${safeName}${state.event.date ? `-${state.event.date}` : ''}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('전체 배정 정보를 JSON 파일로 저장했습니다.');
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const raw = await file.text();
      const candidate = validateImportedData(JSON.parse(raw));
      if (hasContent() && !window.confirm('현재 행사와 배정 내용을 불러온 파일로 덮어쓸까요?')) return;
      state = candidate;
      selectedSeatId = null;
      syncEventFields();
      closeEditor();
      renderAll();
      queueSave();
      showToast('JSON 파일에서 행사와 배정 정보를 복원했습니다.');
    } catch (error) {
      showToast(`파일을 불러오지 않았습니다. ${error.message || 'JSON 형식을 확인해 주세요.'}`);
    } finally {
      els.importFile.value = '';
    }
  }

  function resetAll() {
    if (hasContent() && !window.confirm('행사 정보, 참가자 명단, 406석의 배정 내용을 모두 초기화할까요?')) return;
    state = createEmptyState();
    selectedSeatId = null;
    syncEventFields();
    closeEditor();
    renderAll();
    queueSave();
    showToast('전체 내용을 초기화했습니다.');
  }

  function syncEventFields() {
    els.eventName.value = state.event.name;
    els.eventDate.value = state.event.date;
  }

  function updateEventFromInputs() {
    state.event.name = els.eventName.value.slice(0, 80);
    state.event.date = els.eventDate.value;
    updateEventText();
    queueSave();
  }

  function renderSearchResults(query) {
    while (els.searchResults.firstChild) els.searchResults.firstChild.remove();
    const normalized = query.trim().toLocaleLowerCase('ko-KR');
    if (!normalized) {
      els.searchResults.hidden = true;
      return;
    }
    const results = blueprint.seats.filter((seat) => {
      const record = getRecord(seat.id);
      const person = record.participantId ? state.participants.find((item) => item.id === record.participantId) : null;
      return seat.id.toLowerCase().includes(normalized)
        || record.name.toLocaleLowerCase('ko-KR').includes(normalized)
        || record.org.toLocaleLowerCase('ko-KR').includes(normalized)
        || Boolean(person && person.identifier.toLocaleLowerCase('ko-KR').includes(normalized));
    }).slice(0, 40);
    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = '일치하는 좌석이 없습니다.';
      els.searchResults.append(empty);
    } else {
      results.forEach((seat) => {
        const record = getRecord(seat.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-result';
        const title = document.createElement('strong');
        title.textContent = record.name ? `${record.name} · ${seat.id}` : seat.id;
        const meta = document.createElement('span');
        const person = record.participantId ? state.participants.find((item) => item.id === record.participantId) : null;
        meta.textContent = [seat.zoneName, `${seat.row}열`, record.org, person && person.identifier].filter(Boolean).join(' · ');
        button.append(title, meta);
        button.addEventListener('click', () => {
          selectSeat(seat.id, { focusMap: true });
          els.searchResults.hidden = true;
          els.searchInput.value = '';
        });
        els.searchResults.append(button);
      });
    }
    els.searchResults.hidden = false;
  }

  function setLabelMode(mode) {
    labelMode = mode;
    els.showSeatId.classList.toggle('is-active', mode === 'id');
    els.showAssignee.classList.toggle('is-active', mode === 'name');
    els.showSeatId.setAttribute('aria-pressed', String(mode === 'id'));
    els.showAssignee.setAttribute('aria-pressed', String(mode === 'name'));
    blueprint.seats.forEach((seat) => renderSeat(seat.id));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function applyTransform() {
    constrainPan();
    els.seatMap.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
    els.zoomValue.value = `${Math.round(transform.scale * 100)}%`;
    els.zoomValue.textContent = `${Math.round(transform.scale * 100)}%`;
    els.zoomOut.disabled = transform.scale <= fitScale + .0001;
    els.zoomIn.disabled = transform.scale >= MAX_SCALE - .0001;
  }

  function calculateFitScale() {
    const width = els.mapViewport.clientWidth;
    const height = els.mapViewport.clientHeight;
    if (!width || !height) return fitScale;
    const padding = width < 700 ? 20 : 34;
    const contentWidth = CONTENT_BOUNDS.right - CONTENT_BOUNDS.left;
    const contentHeight = CONTENT_BOUNDS.bottom - CONTENT_BOUNDS.top;
    return clamp(Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight), .2, 1.35);
  }

  function centerContent() {
    const width = els.mapViewport.clientWidth;
    const height = els.mapViewport.clientHeight;
    transform.x = width / 2 - ((CONTENT_BOUNDS.left + CONTENT_BOUNDS.right) / 2) * transform.scale;
    transform.y = height / 2 - ((CONTENT_BOUNDS.top + CONTENT_BOUNDS.bottom) / 2) * transform.scale;
  }

  function constrainPan() {
    const width = els.mapViewport.clientWidth;
    const height = els.mapViewport.clientHeight;
    if (!width || !height) return;
    const margin = width < 700 ? 18 : 28;
    const contentWidth = (CONTENT_BOUNDS.right - CONTENT_BOUNDS.left) * transform.scale;
    const contentHeight = (CONTENT_BOUNDS.bottom - CONTENT_BOUNDS.top) * transform.scale;
    if (contentWidth <= width - margin * 2) transform.x = (width - contentWidth) / 2 - CONTENT_BOUNDS.left * transform.scale;
    else transform.x = clamp(transform.x, width - margin - CONTENT_BOUNDS.right * transform.scale, margin - CONTENT_BOUNDS.left * transform.scale);
    if (contentHeight <= height - margin * 2) transform.y = (height - contentHeight) / 2 - CONTENT_BOUNDS.top * transform.scale;
    else transform.y = clamp(transform.y, height - margin - CONTENT_BOUNDS.bottom * transform.scale, margin - CONTENT_BOUNDS.top * transform.scale);
  }

  function fitMap() {
    fitScale = calculateFitScale();
    transform.scale = fitScale;
    centerContent();
    isFitView = true;
    applyTransform();
  }

  function setInitialView() {
    fitMap();
  }

  function zoomAt(factor, clientX, clientY) {
    const rect = els.mapViewport.getBoundingClientRect();
    const px = typeof clientX === 'number' ? clientX - rect.left : rect.width / 2;
    const py = typeof clientY === 'number' ? clientY - rect.top : rect.height / 2;
    const oldScale = transform.scale;
    fitScale = calculateFitScale();
    const nextScale = clamp(oldScale * factor, fitScale, MAX_SCALE);
    if (Math.abs(nextScale - oldScale) < .00001) return;
    const mapX = (px - transform.x) / oldScale;
    const mapY = (py - transform.y) / oldScale;
    transform.scale = nextScale;
    transform.x = px - mapX * nextScale;
    transform.y = py - mapY * nextScale;
    isFitView = nextScale <= fitScale + .0001;
    applyTransform();
  }

  function recalculateView() {
    const wasFit = isFitView;
    const previousFit = fitScale;
    fitScale = calculateFitScale();
    if (wasFit || transform.scale <= previousFit + .0001 || transform.scale < fitScale) {
      transform.scale = fitScale;
      centerContent();
      isFitView = true;
    }
    applyTransform();
  }

  function focusSeatOnMap(id) {
    const seat = seatById.get(id);
    const pos = seatPosition(seat);
    const width = els.mapViewport.clientWidth;
    const height = els.mapViewport.clientHeight;
    const nextScale = Math.max(transform.scale, Math.min(MAX_SCALE, Math.max(fitScale, .78)));
    transform.scale = nextScale;
    transform.x = width / 2 - (pos.x + pos.width / 2) * nextScale;
    transform.y = height / 2 - (pos.y + pos.height / 2) * nextScale;
    isFitView = false;
    applyTransform();
  }

  function onPointerDown(event) {
    if (event.button !== 0 || event.target.closest('.seat')) return;
    pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointerPositions.size === 2) {
      const points = Array.from(pointerPositions.values());
      const centerX = (points[0].x + points[1].x) / 2;
      const centerY = (points[0].y + points[1].y) / 2;
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const rect = els.mapViewport.getBoundingClientRect();
      pinchState = { distance, scale: transform.scale, mapX: (centerX - rect.left - transform.x) / transform.scale, mapY: (centerY - rect.top - transform.y) / transform.scale };
      dragState = null;
    } else {
      dragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y };
    }
    els.mapViewport.setPointerCapture(event.pointerId);
    els.mapViewport.classList.add('is-panning');
  }

  function onPointerMove(event) {
    if (!pointerPositions.has(event.pointerId)) return;
    pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinchState && pointerPositions.size >= 2) {
      const points = Array.from(pointerPositions.values()).slice(0, 2);
      const centerX = (points[0].x + points[1].x) / 2;
      const centerY = (points[0].y + points[1].y) / 2;
      const rect = els.mapViewport.getBoundingClientRect();
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      fitScale = calculateFitScale();
      transform.scale = clamp(pinchState.scale * (distance / Math.max(1, pinchState.distance)), fitScale, MAX_SCALE);
      transform.x = centerX - rect.left - pinchState.mapX * transform.scale;
      transform.y = centerY - rect.top - pinchState.mapY * transform.scale;
      isFitView = transform.scale <= fitScale + .0001;
      applyTransform();
      return;
    }
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    transform.x = dragState.originX + event.clientX - dragState.startX;
    transform.y = dragState.originY + event.clientY - dragState.startY;
    isFitView = false;
    applyTransform();
  }

  function endPointer(event) {
    pointerPositions.delete(event.pointerId);
    pinchState = null;
    if (dragState && dragState.pointerId === event.pointerId) dragState = null;
    els.mapViewport.classList.remove('is-panning');
  }

  function onWheel(event) {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? els.mapViewport.clientHeight : 1;
    wheelDelta += clamp(event.deltaY * unit, -120, 120);
    wheelPoint = { x: event.clientX, y: event.clientY };
    if (wheelFrame) return;
    wheelFrame = window.requestAnimationFrame(() => {
      const delta = clamp(wheelDelta, -160, 160);
      const factor = clamp(Math.exp(-delta * .0015), .82, 1.22);
      wheelDelta = 0;
      wheelFrame = null;
      zoomAt(factor, wheelPoint.x, wheelPoint.y);
    });
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 3600);
  }

  function bindEvents() {
    els.eventName.addEventListener('input', updateEventFromInputs);
    els.eventDate.addEventListener('change', updateEventFromInputs);
    els.closeEditor.addEventListener('click', closeEditor);
    els.panelScrim.addEventListener('click', closeEditor);
    els.seatForm.addEventListener('submit', saveSeatFromForm);
    els.clearSeat.addEventListener('click', clearSelectedSeat);
    els.seatForm.addEventListener('change', (event) => {
      if (event.target.name === 'seat-status') updateFormDisabledState();
    });
    els.searchInput.addEventListener('input', () => renderSearchResults(els.searchInput.value));
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.search-wrap')) els.searchResults.hidden = true;
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeEditor();
        els.searchResults.hidden = true;
      }
    });
    els.showSeatId.addEventListener('click', () => setLabelMode('id'));
    els.showAssignee.addEventListener('click', () => setLabelMode('name'));
    els.zoomOut.addEventListener('click', () => zoomAt(1 / 1.14));
    els.zoomIn.addEventListener('click', () => zoomAt(1.14));
    els.zoomFit.addEventListener('click', fitMap);
    els.mapViewport.addEventListener('wheel', onWheel, { passive: false });
    els.mapViewport.addEventListener('pointerdown', onPointerDown);
    els.mapViewport.addEventListener('pointermove', onPointerMove);
    els.mapViewport.addEventListener('pointerup', endPointer);
    els.mapViewport.addEventListener('pointercancel', endPointer);
    els.exportButton.addEventListener('click', exportJson);
    els.importButton.addEventListener('click', () => els.importFile.click());
    els.importFile.addEventListener('change', () => importJson(els.importFile.files[0]));
    els.resetButton.addEventListener('click', resetAll);
    els.printButton.addEventListener('click', () => window.print());
    window.addEventListener('resize', recalculateView);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', recalculateView);
    window.addEventListener('beforeprint', () => {
      restoreLabelMode = labelMode;
      setLabelMode('name');
      closeEditor();
    });
    window.addEventListener('afterprint', () => {
      if (restoreLabelMode) setLabelMode(restoreLabelMode);
      restoreLabelMode = null;
    });
  }

  function runBlueprintChecks() {
    const expected = { L1: 60, L2: 82, C: 126, R2: 79, R1: 59 };
    const seen = new Set();
    const totals = {};
    blueprint.seats.forEach((seat) => {
      if (seen.has(seat.id)) throw new Error(`중복 좌석 ID: ${seat.id}`);
      seen.add(seat.id);
      totals[seat.zoneId] = (totals[seat.zoneId] || 0) + 1;
    });
    if (blueprint.total !== 406) throw new Error(`총 좌석 수 오류: ${blueprint.total}`);
    Object.entries(expected).forEach(([zone, count]) => {
      if (totals[zone] !== count) throw new Error(`${zone} 좌석 수 오류: ${totals[zone]}`);
    });
  }

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== 'function') return;

    const register = (tool) => {
      try {
        Promise.resolve(context.registerTool(tool)).catch(() => {});
      } catch (error) {
        // 지원 브라우저가 아닌 경우에도 일반 화면 기능은 그대로 사용한다.
      }
    };

    register({
      name: 'get_seating_summary',
      title: '좌석 현황 확인',
      description: '현재 행사 정보와 빈 좌석, 배정 완료, 사용 불가 좌석 수를 확인합니다.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        let assigned = 0;
        let unavailable = 0;
        blueprint.seats.forEach((seat) => {
          const status = getRecord(seat.id).status;
          if (status === 'assigned') assigned += 1;
          if (status === 'unavailable') unavailable += 1;
        });
        return {
          event: { name: state.event.name, date: state.event.date },
          total: blueprint.total,
          assigned,
          empty: blueprint.total - assigned - unavailable,
          unavailable
        };
      }
    });

    register({
      name: 'assign_seats',
      title: '좌석 일괄 배정',
      description: '하나 이상의 좌석을 배정 완료 또는 사용 불가로 설정하고 화면과 자동저장 상태를 갱신합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          seats: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'object',
              properties: {
                seatId: { type: 'string' },
                status: { type: 'string', enum: ['assigned', 'unavailable'] },
                name: { type: 'string', maxLength: 40 },
                org: { type: 'string', maxLength: 80 },
                note: { type: 'string', maxLength: 240 },
                color: { type: 'string', enum: COLORS }
              },
              required: ['seatId', 'status'],
              additionalProperties: false
            }
          }
        },
        required: ['seats'],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !Array.isArray(input.seats) || input.seats.length < 1 || input.seats.length > 100) {
          throw new Error('seats에는 1개 이상 100개 이하의 좌석이 필요합니다.');
        }
        const updates = input.seats.map((item) => {
          if (!item || typeof item !== 'object' || !seatById.has(item.seatId)) throw new Error(`알 수 없는 좌석 ID: ${item && item.seatId ? item.seatId : ''}`);
          if (!['assigned', 'unavailable'].includes(item.status)) throw new Error(`지원하지 않는 좌석 상태: ${item.status}`);
          return {
            id: item.seatId,
            record: normalizeRecord({
              status: item.status,
              name: item.status === 'assigned' ? item.name : '',
              org: item.status === 'assigned' ? item.org : '',
              note: item.status === 'assigned' ? item.note : '',
              color: item.color || COLORS[0]
            })
          };
        });
        updates.forEach(({ id, record }) => { state.assignments[id] = record; });
        updates.forEach(({ id }) => renderSeat(id));
        renderSummary();
        queueSave();
        return { updated: updates.map(({ id }) => id), count: updates.length };
      }
    });
  }

  window.SEAT_APP = {
    blueprint,
    colors: COLORS,
    getState: () => state,
    getRecord,
    selectSeat,
    validateImportedData,
    notifyStateChanged(message) {
      renderAll();
      queueSave();
      if (message) showToast(message);
    },
    replaceAssignments(assignments, message) {
      const next = {};
      Object.entries(assignments || {}).forEach(([id, record]) => {
        if (seatById.has(id)) next[id] = normalizeRecord(record);
      });
      state.assignments = next;
      this.notifyStateChanged(message);
    },
    showToast,
    recalculateView,
    closeEditor
  };

  function init() {
    runBlueprintChecks();
    drawStaticMap();
    drawSeats();
    createColorOptions();
    bindEvents();
    loadAutoSave();
    syncEventFields();
    renderAll();
    registerWebMcpTools();
    if (typeof ResizeObserver === 'function') new ResizeObserver(recalculateView).observe(els.mapViewport);
    window.requestAnimationFrame(setInitialView);
  }

  init();
})();
