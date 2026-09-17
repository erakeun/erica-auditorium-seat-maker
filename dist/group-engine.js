(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GROUP_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function normalize(data, blueprint) {
    const seats = new Set(blueprint.seats.map(s => s.id));
    const groups = data.groups === undefined ? [] : data.groups;
    if (!Array.isArray(groups) || groups.length > 406) throw new Error('그룹 목록 형식이 올바르지 않습니다.');
    const ids = new Set();
    const normalized = groups.map(g => {
      if (!g || typeof g.id !== 'string' || !/^[\w-]{1,80}$/.test(g.id) || ids.has(g.id) || !String(g.name || '').trim() || !/^#[\da-f]{6}$/i.test(g.color)) throw new Error('그룹 ID·이름·색을 확인하세요.');
      ids.add(g.id); return { id:g.id, name:String(g.name).trim().slice(0,60), color:g.color };
    });
    const seatGroups = {}, heldSeats = {};
    for (const key of ['seatGroups','heldSeats']) {
      const source = data[key] === undefined ? {} : data[key];
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('좌석 그룹/비워두기 형식 오류');
      Object.entries(source).forEach(([id,value]) => {
        if (!seats.has(id)) throw new Error(`알 수 없는 좌석: ${id}`);
        if (key === 'seatGroups') {
          if (!ids.has(value)) throw new Error(`없는 그룹 참조: ${id}`);
          seatGroups[id] = value;
        } else {
          if (value !== true) throw new Error('비워두기는 true 값이어야 합니다.');
          if (data.assignments?.[id]?.status === 'assigned') throw new Error(`${id}: 개인 배정과 비워두기가 동시에 저장되어 있습니다.`);
          heldSeats[id] = true;
        }
      });
    }
    const links = data.groupLinks === undefined ? [] : data.groupLinks;
    if (!Array.isArray(links)) throw new Error('명단 그룹 연결 형식 오류');
    const sources = new Set();
    const groupLinks = links.map(link => {
      if (!link || typeof link.source !== 'string' || link.source.length > 60 || sources.has(link.source) || !ids.has(link.target)) throw new Error('명단 그룹 연결 대상/중복 오류');
      sources.add(link.source); return {source:link.source,target:link.target};
    });
    return {groups:normalized,seatGroups,heldSeats,groupLinks};
  }
  function targetFor(state, person) { return (state.groupLinks || []).find(link => link.source === (person?.group || ''))?.target || ''; }
  function allowed(state, person, seatId, options = {}) {
    if (state.heldSeats?.[seatId] || state.assignments?.[seatId]?.status === 'unavailable') return false;
    if (options.ignoreGroups) return true;
    const target = targetFor(state,person), owner = state.seatGroups?.[seatId] || '';
    if (options.groupOnly && !target) return false;
    return target ? owner === target : !owner;
  }
  function stats(state, blueprint, groupId) {
    const ids = blueprint.seats.filter(s => !groupId || state.seatGroups?.[s.id] === groupId).map(s=>s.id);
    const result = {total:ids.length,held:0,unavailable:0,assigned:0,available:0,capacity:0};
    ids.forEach(id => {
      const r = state.assignments[id];
      // Unavailable takes precedence; a held+unavailable seat is counted once.
      if (r?.status === 'unavailable') result.unavailable++;
      else if (state.heldSeats?.[id]) result.held++;
      else if (r?.status === 'assigned') result.assigned++;
      else result.available++;
    });
    result.capacity = result.assigned + result.available;
    return result;
  }
  function plan(state, ids, action) {
    const next = clone(state), affected = [], moved = [], locked = [];
    const selection = [...new Set(ids)];
    if (action.type === 'assign' && !next.groups.some(g=>g.id === action.groupId)) {
      if (!action.name?.trim() || !/^#[\da-f]{6}$/i.test(action.color)) throw new Error('그룹 이름과 색을 입력하세요.');
      next.groups.push({id:action.groupId,name:action.name.trim().slice(0,60),color:action.color});
    }
    selection.forEach(id => {
      const record = next.assignments[id];
      if (record?.status === 'assigned') affected.push({id,name:record.name,fixed:!!record.fixed});
      if (action.type === 'assign') {
        if (next.seatGroups[id] && next.seatGroups[id] !== action.groupId) moved.push(id);
        next.seatGroups[id] = action.groupId;
      } else if (action.type === 'remove') {
        if (!action.groupId || next.seatGroups[id] === action.groupId) delete next.seatGroups[id];
      } else if (action.type === 'hold') {
        if (record?.fixed && record.status === 'assigned') locked.push(id);
        else {
          if (record?.status === 'assigned') {
            // Manual seat entries may not have a roster record yet. Preserve
            // the person as unassigned instead of losing their entered details.
            if (!next.participants.some(p=>p.id===record.participantId)) {
              next.participants.push({id:record.participantId || `P-HOLD-${id}-${Date.now().toString(36)}-${next.participants.length}`,mode:'event',name:record.name||'이름 미입력',identifier:'',org:record.org||'',title:'',priority:null,group:'',requestedSeat:'',note:record.note||'',color:record.color||'#0d5c8f',order:next.participants.length});
            }
            delete next.assignments[id];
          }
          next.heldSeats[id] = true;
        }
      } else if (action.type === 'unhold') delete next.heldSeats[id];
    });
    return {next,affected,moved,locked,selection};
  }
  function selectedInRect(seats, rectangle, position) {
    const left=Math.min(rectangle.x1,rectangle.x2),right=Math.max(rectangle.x1,rectangle.x2),top=Math.min(rectangle.y1,rectangle.y2),bottom=Math.max(rectangle.y1,rectangle.y2);
    return seats.filter(s=>{ const p=position(s); return p.centerX>=left&&p.centerX<=right&&p.centerY>=top&&p.centerY<=bottom; }).map(s=>s.id);
  }
  return {clone,normalize,targetFor,allowed,stats,plan,selectedInRect};
});
