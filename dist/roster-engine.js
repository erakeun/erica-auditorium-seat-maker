(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./group-engine.js') : root.GROUP_ENGINE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ROSTER_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (groups) {
  'use strict';

  const COLORS = ['#0d5c8f', '#169873', '#d36b2c', '#7457b8', '#c1456f', '#198fa4', '#586b7a'];
  const ZONE_ORDER = ['C', 'L2', 'R2', 'L1', 'R1'];
  const ROWS = 'ABCDEFGHIJKLMN'.split('');

  function clean(value, limit = 120) { return String(value == null ? '' : value).trim().slice(0, limit); }
  function safeSpreadsheetText(value) {
    const text = String(value == null ? '' : value);
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  }
  function priorityValue(value) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  function participant(input, index, mode, makeId) {
    return {
      id: clean(input.id, 80) || makeId(index),
      mode: mode === 'class' ? 'class' : 'event',
      name: clean(input.name, 40),
      identifier: clean(input.identifier, 60),
      org: clean(input.org, 80),
      title: clean(input.title, 60),
      priority: priorityValue(input.priority),
      group: clean(input.group, 60),
      requestedSeat: clean(input.requestedSeat, 20).toUpperCase(),
      note: clean(input.note, 240),
      color: COLORS.includes(input.color) ? input.color : COLORS[index % COLORS.length],
      order: Number.isInteger(input.order) ? input.order : index
    };
  }

  function validateRoster(participants, blueprint, assignments, groupState = {}) {
    const seatIds = new Set(blueprint.seats.map((seat) => seat.id));
    const unavailable = new Set(Object.entries(assignments || {}).filter(([, record]) => record.status === 'unavailable').map(([id]) => id));
    Object.keys(groupState.heldSeats || {}).forEach(id=>unavailable.add(id));
    const issues = [];
    const identifiers = new Map();
    const requested = new Map();
    const names = new Map();
    participants.forEach((person, index) => {
      if (!clean(person.name)) issues.push({ level: 'error', index, code: 'missing-name', message: '이름이 없습니다.' });
      if (person.identifier) {
        if (identifiers.has(person.identifier)) issues.push({ level: 'error', index, code: 'duplicate-identifier', message: `식별번호가 ${identifiers.get(person.identifier) + 1}행과 중복됩니다.` });
        else identifiers.set(person.identifier, index);
      }
      const nameKey = clean(person.name).toLocaleLowerCase('ko-KR');
      if (nameKey) {
        if (names.has(nameKey) && !person.identifier) issues.push({ level: 'warning', index, code: 'same-name', message: `식별번호 없는 동명이인이 ${names.get(nameKey) + 1}행에도 있습니다. 삭제하지 않고 유지합니다.` });
        else names.set(nameKey, index);
      }
      if (person.requestedSeat) {
        if (!seatIds.has(person.requestedSeat)) issues.push({ level: 'error', index, code: 'invalid-seat', message: `지정좌석 ${person.requestedSeat}이 존재하지 않습니다.` });
        else if (unavailable.has(person.requestedSeat)) issues.push({ level: 'warning', index, code: 'unavailable-seat', message: `지정좌석 ${person.requestedSeat}은 사용 불가 또는 비워두기입니다. 배치 전 대체 좌석을 선택하세요.` });
        if (requested.has(person.requestedSeat)) issues.push({ level: 'error', index, code: 'duplicate-seat', message: `지정좌석 ${person.requestedSeat}이 ${requested.get(person.requestedSeat) + 1}행과 중복됩니다.` });
        else requested.set(person.requestedSeat, index);
      }
    });
    const unavailableCount = unavailable.size;
    const rosterIds = new Set(participants.map((person) => person.id));
    const externallyOccupied = Object.values(assignments || {}).filter((record) => record.status === 'assigned' && (!record.participantId || !rosterIds.has(record.participantId))).length;
    const available = blueprint.total - unavailableCount - externallyOccupied;
    if (participants.length > available) issues.push({ level: 'warning', index: -1, code: 'capacity', message: `명단 ${participants.length}명 중 ${available}명만 배치할 수 있어 ${participants.length - available}명이 초과됩니다. 초과 인원은 미배정으로 남습니다.` });
    return { issues, available, errors: issues.filter((issue) => issue.level === 'error').length, warnings: issues.filter((issue) => issue.level === 'warning').length };
  }

  function fisherYates(values, random = Math.random) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function middleOrder(count, reverse) {
    const middle = Math.ceil(count / 2);
    const result = [middle];
    for (let offset = 1; result.length < count; offset += 1) {
      const first = reverse ? middle + offset : middle - offset;
      const second = reverse ? middle - offset : middle + offset;
      if (first >= 1 && first <= count) result.push(first);
      if (second >= 1 && second <= count) result.push(second);
    }
    return result;
  }

  function seatsInArea(blueprint, area, eventCenterOrder) {
    const zones = new Set(area.zones || ZONE_ORDER);
    const start = Math.max(0, ROWS.indexOf(area.startRow || 'A'));
    const rawEnd = ROWS.indexOf(area.endRow || 'N');
    const end = rawEnd < start ? start : rawEnd;
    const byKey = new Map(blueprint.seats.map((seat) => [`${seat.zoneId}-${seat.row}`, []]));
    blueprint.seats.forEach((seat) => byKey.get(`${seat.zoneId}-${seat.row}`).push(seat));
    const result = [];
    for (let rowIndex = start; rowIndex <= end; rowIndex += 1) {
      const row = ROWS[rowIndex];
      for (const zoneId of ZONE_ORDER) {
        if (!zones.has(zoneId)) continue;
        let rowSeats = (byKey.get(`${zoneId}-${row}`) || []).slice().sort((a, b) => a.number - b.number);
        if (eventCenterOrder && zoneId === 'C') {
          const order = middleOrder(rowSeats.length, eventCenterOrder === 'right');
          const index = new Map(order.map((number, position) => [number, position]));
          rowSeats.sort((a, b) => index.get(a.number) - index.get(b.number));
        }
        result.push(...rowSeats.map((seat) => seat.id));
      }
    }
    return result;
  }

  function createAssignment(person) {
    return {
      status: 'assigned',
      name: person.name,
      org: [person.org, person.title].filter(Boolean).join(' · ').slice(0, 80),
      note: person.note,
      color: person.color || COLORS[0],
      participantId: person.id,
      fixed: false
    };
  }

  function buildPreview(input) {
    const { blueprint, participants, assignments } = input;
    const mode = input.mode === 'class' ? 'class' : 'event';
    const options = input.options || {};
    const preview = {};
    const occupied = new Set();
    const assignedPeople = new Set();
    const conflicts = [];
    const scopeAll = options.scope === 'all';
    const groupState = {assignments,...(input.groupState || {})};
    const canPlace = (person,id) => groups.allowed(groupState,person,id,options);
    const rosterIds = new Set(participants.map(p=>p.id));

    Object.entries(assignments || {}).forEach(([seatId, record]) => {
      const preserve = record.status === 'unavailable' || record.fixed || !record.participantId || !rosterIds.has(record.participantId) || !scopeAll;
      if (preserve) {
        preview[seatId] = { ...record };
        if(record.status !== 'empty')occupied.add(seatId);
        if (record.status === 'assigned' && record.participantId) assignedPeople.add(record.participantId);
        const person = participants.find(p=>p.id===record.participantId) || groupState.participants?.find(p=>p.id===record.participantId);
        if (record.status === 'assigned' && person && !canPlace(person,seatId)) conflicts.push({participantId:person.id,blocking:true,message:`${person.name}: 보존/고정 좌석 ${seatId}이 그룹 또는 비워두기 조건과 충돌합니다. 기존 배정은 유지하므로 먼저 조정하세요.`});
      }
    });

    const ordered = participants.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const pending = ordered.filter((person) => !assignedPeople.has(person.id));
    const stopped = new Set();
    const place = (person, seatId) => {
      if (!seatId || occupied.has(seatId) || assignedPeople.has(person.id) || !canPlace(person,seatId)) return false;
      preview[seatId] = createAssignment(person);
      occupied.add(seatId);
      assignedPeople.add(person.id);
      return true;
    };

    pending.forEach((person) => {
      if (!person.requestedSeat) return;
      if (!blueprint.seats.some((seat) => seat.id === person.requestedSeat)) {
        conflicts.push({ participantId: person.id, message: `${person.name}: 지정좌석 ${person.requestedSeat}이 존재하지 않습니다.` });
        stopped.add(person.id);
      } else if (!place(person, person.requestedSeat)) {
        conflicts.push({ participantId: person.id, message: `${person.name}: 지정좌석 ${person.requestedSeat}이 사용 불가·비워두기·그룹 제한 또는 다른 고정 배정과 충돌합니다.` });
        stopped.add(person.id);
      }
    });

    const freeFrom = (ids) => ids.filter((id) => !occupied.has(id) && !groupState.heldSeats?.[id]);
    const take = (person, ids) => ids.find(id => !occupied.has(id) && canPlace(person,id));
    if (mode === 'event') {
      const reverse = options.centerDirection === 'right';
      const ranked = pending.filter((person) => person.priority != null && !assignedPeople.has(person.id) && !stopped.has(person.id))
        .sort((a, b) => a.priority - b.priority || a.order - b.order);
      let vipSeats = freeFrom(seatsInArea(blueprint, options.vipArea || { zones: ['C'], startRow: 'A', endRow: 'C' }, reverse ? 'right' : 'left'));
      ranked.forEach((person) => {
        if (person.priority === 1) {
          const area = options.vipArea || { zones: ['C'], startRow: 'A', endRow: 'C' };
          const includesBest = area.zones.includes('C') && ROWS.indexOf(area.startRow) <= 0 && ROWS.indexOf(area.endRow) >= 0;
          if (includesBest && !occupied.has('C-A-05') && canPlace(person,'C-A-05')) {
            place(person, 'C-A-05');
            vipSeats = vipSeats.filter((id) => id !== 'C-A-05');
            return;
          }
          if (includesBest) {
            conflicts.push({ participantId: person.id, message: `${person.name}: 최우선석 C-A-05가 비워두기·사용 불가·그룹 제한 또는 고정 배정과 충돌합니다. 지정좌석/내빈 영역에서 대체 좌석을 선택하세요.` });
            stopped.add(person.id);
            return;
          }
        }
        const seatId = take(person,vipSeats);
        if (!place(person, seatId)) {
          conflicts.push({ participantId: person.id, message: `${person.name}: 내빈 배치 영역이 부족합니다.` });
          stopped.add(person.id);
        }
      });
      const general = pending.filter((person) => person.priority == null && !assignedPeople.has(person.id) && !stopped.has(person.id));
      const generalSeats = freeFrom(seatsInArea(blueprint, options.generalArea || { zones: ZONE_ORDER, startRow: 'A', endRow: 'N' }, null));
      general.forEach((person) => place(person, take(person,generalSeats)));
    } else {
      const people = pending.filter((person) => !assignedPeople.has(person.id) && !stopped.has(person.id));
      const candidates = freeFrom(seatsInArea(blueprint, options.classArea || { zones: ZONE_ORDER, startRow: 'A', endRow: 'N' }, null));
      const random = typeof input.random === 'function' ? input.random : Math.random;
      if (options.classPattern === 'front') {
        fisherYates(people, random).forEach((person) => place(person, take(person,candidates)));
      } else {
        const shuffledSeats = fisherYates(candidates, random);
        fisherYates(people, random).forEach((person) => place(person, take(person,shuffledSeats)));
      }
    }

    const unassigned = ordered.filter((person) => !assignedPeople.has(person.id));
    const mappings = Object.entries(preview).filter(([, record]) => record.participantId).map(([seatId, record]) => ({ participantId: record.participantId, seatId }));
    return { assignments: preview, mappings, unassigned, conflicts, assignedCount: mappings.length, availableSeats: groups.stats({...groupState,assignments:preview},blueprint).capacity };
  }

  return { COLORS, ZONE_ORDER, ROWS, participant, validateRoster, fisherYates, middleOrder, seatsInArea, buildPreview, safeSpreadsheetText };
});
