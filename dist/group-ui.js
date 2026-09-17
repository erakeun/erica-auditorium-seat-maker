(function () {
  'use strict';
  const app=window.SEAT_APP, engine=window.GROUP_ENGINE, $=id=>document.getElementById(id);
  const svg=$('seat-svg'), viewport=$('map-viewport'), selected=new Set();
  const ns='http://www.w3.org/2000/svg';
  let selecting=false, operation='replace', gesture=null, pending=null;
  const make=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs||{}).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e;};
  const legend=make('g',{id:'group-map-legend','pointer-events':'none'}); $('map-static').append(legend);
  const zoneNames=make('g',{'pointer-events':'none'}); $('map-static').append(zoneNames);
  const box=make('rect',{class:'selection-box',visibility:'hidden'}); svg.append(box);
  const pattern=make('pattern',{id:'held-pattern',width:8,height:8,patternUnits:'userSpaceOnUse'});
  pattern.append(make('rect',{width:8,height:8,fill:'#fff3d6'}),make('path',{d:'M -2 2 L 2 -2 M 0 8 L 8 0 M 6 10 L 10 6',stroke:'#dfb666','stroke-width':2})); svg.querySelector('defs').append(pattern);
  function mode(value) {
    selecting=value; $('group-panel').hidden=!value; viewport.classList.toggle('selecting',value);
    $('mode-move').setAttribute('aria-pressed',!value); $('mode-select').setAttribute('aria-pressed',value);
    if(value) app.closeEditor(); else selected.clear();
    render(); window.requestAnimationFrame(app.recalculateView);
  }
  function toggle(id) { if(operation==='subtract') selected.delete(id); else if(operation==='add')selected.add(id);else if(selected.has(id))selected.delete(id);else selected.add(id); paintSelection(); }
  function choose(ids,op=operation) { if(op==='replace')selected.clear();ids.forEach(id=>op==='subtract'?selected.delete(id):selected.add(id));paintSelection(); }
  function paintSelection() {
    document.querySelectorAll('.seat').forEach(e=>e.classList.toggle('is-multi-selected',selected.has(e.dataset.seatId)));
    $('selection-count').textContent=`선택 ${selected.size}석`;
  }
  function toMap(event) { const p=new DOMPoint(event.clientX,event.clientY);return p.matrixTransform(svg.getScreenCTM().inverse()); }
  // Capture all selection gestures before pan handlers or SVG links can run.
  viewport.addEventListener('pointerdown',e=>{
    if(!selecting || e.button!==0)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(gesture){gesture=null;box.setAttribute('visibility','hidden');return;}
    const p=toMap(e);gesture={pointerId:e.pointerId,start:p,end:p,sx:e.clientX,sy:e.clientY,moved:false,seat:e.target.closest('.seat')?.dataset.seatId,zone:e.target.closest('[data-zone-id]')?.dataset.zoneId,op:e.altKey?'subtract':e.shiftKey?'add':operation};
    viewport.setPointerCapture(e.pointerId);
  },true);
  viewport.addEventListener('pointermove',e=>{
    if(!selecting||!gesture||gesture.pointerId!==e.pointerId)return;
    e.stopImmediatePropagation();gesture.end=toMap(e);gesture.moved ||= Math.hypot(e.clientX-gesture.sx,e.clientY-gesture.sy)>5;
    if(gesture.moved){const a=gesture.start,b=gesture.end;Object.entries({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y),visibility:'visible'}).forEach(([k,v])=>box.setAttribute(k,v));}
  },true);
  viewport.addEventListener('pointerup',e=>{
    if(!selecting)return;e.stopImmediatePropagation();
    if(gesture?.pointerId===e.pointerId){const g=gesture;
      if(g.moved) choose(engine.selectedInRect(app.blueprint.seats,{x1:g.start.x,y1:g.start.y,x2:g.end.x,y2:g.end.y},app.seatPosition),g.op);
      else if(g.zone)choose(app.blueprint.seats.filter(s=>s.zoneId===g.zone).map(s=>s.id),g.op);
      else if(g.seat){if(g.op==='subtract')selected.delete(g.seat);else if(g.op==='add')selected.add(g.seat);else toggle(g.seat);paintSelection();}
    }
    gesture=null;box.setAttribute('visibility','hidden');
    if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);
  },true);
  viewport.addEventListener('pointercancel',()=>{gesture=null;box.setAttribute('visibility','hidden');},true);
  viewport.addEventListener('wheel',e=>{if(gesture){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,passive:false});
  viewport.addEventListener('click',e=>{if(selecting){e.preventDefault();e.stopImmediatePropagation();}},true);
  viewport.addEventListener('keydown',e=>{
    const zone=e.target.closest('[data-zone-id]');
    if(zone&&['Enter',' '].includes(e.key)){e.preventDefault();mode(true);choose(app.blueprint.seats.filter(s=>s.zoneId===zone.dataset.zoneId).map(s=>s.id));}
    if(selecting&&e.target.closest('.stage-link')&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  document.querySelectorAll('[data-zone-id]').forEach(e=>e.addEventListener('click',()=>{mode(true);choose(app.blueprint.seats.filter(s=>s.zoneId===e.dataset.zoneId).map(s=>s.id));}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){selected.clear();gesture=null;box.setAttribute('visibility','hidden');paintSelection();}});
  function present(plan,description) {
    pending={...plan,revision:app.getRevision()};$('group-impact').replaceChildren();
    const p=document.createElement('p');p.textContent=description;$('group-impact').append(p);
    const lines=[`선택 ${plan.selection?.length||0}석 · 다른 그룹에서 이동 ${plan.moved?.length||0}석`,...(plan.affected||[]).map(a=>`${a.id} · ${a.name||'이름 없음'}${a.fixed?' (고정)':''}`)];
    const prior=app.getState();prior.groups.forEach(g=>{const count=(plan.selection||[]).filter(id=>prior.seatGroups[id]===g.id && plan.next.seatGroups[id]!==g.id).length;if(count)lines.push(`${g.name}: 구성 좌석 ${count}석 해제/이동`);});
    if(plan.locked?.length)lines.push(`고정 배정 ${plan.locked.join(', ')}: 이번 변경 전체를 적용할 수 없습니다. 먼저 개인 편집에서 고정을 해제하세요.`);
    lines.forEach(line=>{const p=document.createElement('p');p.textContent=line;$('group-impact').append(p);});
    $('confirm-group-change').disabled=!!plan.locked?.length;$('group-confirm').showModal();
  }
  function change(type) {
    if(!selected.size){app.showToast('좌석을 먼저 선택하세요.');return;}
    try {
      const id=$('group-target').value || `G-${crypto.randomUUID()}`;
      const plan=engine.plan(app.getState(),[...selected],{type,groupId:type==='remove'?$('group-target').value:id,name:$('group-name').value,color:$('group-color').value});
      present(plan,type==='hold'?'비워두기를 적용합니다. 아래 개인 배정은 해제되고 명단에는 미배정으로 남습니다. 그룹 소속은 유지합니다.':type==='unhold'?'비워두기만 해제합니다. 사람을 자동 배정하지 않습니다.':'그룹 소속만 변경합니다. 아래 개인 배정은 삭제하거나 이동하지 않으며, 연결 그룹과 다를 경우 자동 배치에서 충돌로 표시됩니다.');
    }catch(error){app.showToast(error.message);}
  }
  function targetGroup(){return app.getState().groups.find(g=>g.id===$('group-target').value);}
  function groupFields(){const g=targetGroup();$('group-name').value=g?.name||'';$('group-color').value=g?.color||'#0d5c8f';}
  function render() {
    const state=app.getState(), groupView=app.getLabelMode()==='group' || (app.isPrinting() && state.groups.length>0);
    svg.classList.toggle('group-view',groupView);$('show-groups').setAttribute('aria-pressed',groupView);
    $('undo-change').disabled=!app.canUndo();
    const total=engine.stats(state,app.blueprint);$('held-summary').textContent=`비워두기 ${total.held} · 배치 가능 ${total.capacity} (추가 ${total.available})`;
    const old=$('group-target').value; $('group-target').replaceChildren(new Option('새 그룹','')); state.groups.forEach(g=>$('group-target').add(new Option(g.name,g.id)));$('group-target').value=state.groups.some(g=>g.id===old)?old:'';
    document.querySelectorAll('.seat').forEach(e=>{
      const id=e.dataset.seatId,r=app.getRecord(id),g=state.groups.find(g=>g.id===state.seatGroups[id]),held=!!state.heldSeats[id];
      e.classList.toggle('has-group',!!g);e.classList.toggle('is-held',held);e.style.setProperty('--group-color',g?.color||'#dae4e9');
      let badge=e.querySelector('.seat-state-marker');if(!badge){const p=app.seatPosition(app.blueprint.seats.find(s=>s.id===id));badge=make('text',{class:'seat-state-marker',x:p.centerX+8,y:p.centerY-7});e.append(badge);}
      badge.textContent=r.status==='unavailable'?'×':held?'비':r.fixed?'◆':r.status==='assigned'?'●':'';
      e.setAttribute('aria-label',`${id}, ${g?g.name+', ':''}${r.status==='assigned'?'배정 완료, '+r.name:r.status==='unavailable'?'사용 불가':held?'비워두기':'빈 좌석'}${r.fixed?', 고정':''}`);
    });
    paintSelection();legend.replaceChildren();zoneNames.replaceChildren();$('group-legend').replaceChildren();$('group-legend').hidden=!state.groups.length;
    const rowHeights=[];
    for(let i=0;i<state.groups.length;i+=4)rowHeights.push(Math.max(...state.groups.slice(i,i+4).map(g=>Math.ceil(Array.from(g.name).length/18)))*24+78);
    state.groups.forEach((g,index)=>{
      const stat=engine.stats(state,app.blueprint,g.id), summary=`지정 ${stat.total} · 비움 ${stat.held} · 불가 ${stat.unavailable} · 배정 ${stat.assigned} · 추가 ${stat.available}`;
      const item=document.createElement('button');item.className='group-legend-item';const swatch=document.createElement('i');swatch.style.background=g.color;const name=document.createElement('strong');name.textContent=g.name;const detail=document.createElement('span');detail.textContent=summary;item.append(swatch,name,detail);item.addEventListener('click',()=>{mode(true);$('group-target').value=g.id;groupFields();choose(Object.keys(state.seatGroups).filter(id=>state.seatGroups[id]===g.id),'replace');});$('group-legend').append(item);
      if(groupView){const row=Math.floor(index/4),x=(index%4)*455,y=1360+rowHeights.slice(0,row).reduce((a,b)=>a+b,0),statsY=y+rowHeights[row]-62;
        legend.append(make('rect',{x,y:y-16,width:18,height:18,fill:g.color}));
        const chunks=Array.from(g.name).join('').match(/.{1,18}/gu)||[''];chunks.forEach((part,line)=>legend.append(make('text',{class:'map-group-name',x:x+27,y:y+line*22},part)));
        legend.append(make('text',{class:'map-group-count',x:x+27,y:statsY},`지정 ${stat.total} / 비움 ${stat.held} / 불가 ${stat.unavailable}`),make('text',{class:'map-group-count',x:x+27,y:statsY+20},`배정 ${stat.assigned} / 추가 ${stat.available}`));
      }
    });
    if(groupView){
      document.querySelectorAll('[data-zone-id]').forEach(label=>{const seats=app.blueprint.seats.filter(s=>s.zoneId===label.dataset.zoneId),id=state.seatGroups[seats[0].id];if(id&&seats.every(s=>state.seatGroups[s.id]===id)){const g=state.groups.find(g=>g.id===id);zoneNames.append(make('text',{class:'zone-group-name',x:label.getAttribute('x'),y:Number(label.getAttribute('y'))-24},`${label.dataset.zoneId} · ${g.name.length>16?g.name.slice(0,15)+'…':g.name}`));}});
      legend.append(make('text',{class:'map-group-count',x:900,y:1360+rowHeights.reduce((a,b)=>a+b,0),'text-anchor':'middle'},'● 개인 배정  ◆ 고정  × 사용 불가  비 + 사선: 비워두기 · 운영 기준 406석'));
    }
    app.updateBounds();
  }
  ['A','B','C','D','E','F','G','H','I','J','K','L','M','N'].forEach(r=>{['select-row-start','select-row-end'].forEach(id=>$(id).add(new Option(r+'열',r)));});$('select-row-end').value='N';
  $('mode-move').onclick=()=>mode(false);$('mode-select').onclick=()=>mode(true);$('show-groups').onclick=()=>{app.setLabelMode('group');$('print-content').value='group';};$('undo-change').onclick=()=>app.undo();
  ['replace','add','subtract'].forEach(op=>$('select-'+op).onclick=()=>{operation=op;['replace','add','subtract'].forEach(v=>$('select-'+v).setAttribute('aria-pressed',v===op));});
  $('clear-selection').onclick=()=>{selected.clear();paintSelection();};
  $('select-range').onclick=()=>{const z=$('select-zone').value,a=$('select-row-start').value,b=$('select-row-end').value;if(a>b){app.showToast('시작열이 끝열보다 뒤입니다.');return;}choose(app.blueprint.seats.filter(s=>(z==='all'||s.zoneId===z)&&s.row>=a&&s.row<=b).map(s=>s.id));};
  $('group-target').onchange=groupFields;
  $('assign-group').onclick=()=>change('assign');$('remove-group').onclick=()=>change('remove');$('hold-seats').onclick=()=>change('hold');$('unhold-seats').onclick=()=>change('unhold');
  $('highlight-group').onclick=()=>{const g=targetGroup();if(g)choose(Object.keys(app.getState().seatGroups).filter(id=>app.getState().seatGroups[id]===g.id),'replace');};
  $('rename-group').onclick=()=>{const g=targetGroup();if(!g||!$('group-name').value.trim()){app.showToast('기존 그룹과 이름을 선택하세요.');return;}const next=engine.clone(app.getState()),target=next.groups.find(x=>x.id===g.id);target.name=$('group-name').value.trim();target.color=$('group-color').value;app.setState(next,'그룹 이름과 색을 수정했습니다.');};
  $('delete-group').onclick=()=>{const g=targetGroup();if(!g)return;const next=engine.clone(app.getState()),ids=Object.keys(next.seatGroups).filter(id=>next.seatGroups[id]===g.id);ids.forEach(id=>delete next.seatGroups[id]);next.groups=next.groups.filter(x=>x.id!==g.id);next.groupLinks=next.groupLinks.filter(x=>x.target!==g.id);present({next,selection:ids},`${g.name} 그룹과 명단 연결을 삭제합니다. 개인 명단·배정·비워두기는 모두 유지합니다.`);};
  $('confirm-group-change').onclick=()=>{if(!pending)return;if(pending.revision!==app.getRevision()){app.showToast('내용이 변경되었습니다. 다시 미리보기를 확인하세요.');$('group-confirm').close();return;}app.setState(pending.next,'그룹/비워두기 변경을 저장했습니다.');pending=null;$('group-confirm').close();app.setLabelMode('group');$('print-content').value='group';};
  $('cancel-group-change').onclick=()=>{pending=null;$('group-confirm').close();};
  $('group-auto').onclick=()=>{$('group-only-layout').checked=true;$('ignore-group-limits').checked=false;$('open-auto-layout').click();};
  window.addEventListener('seating-change',render);
  window.GROUP_UI={render,isSelecting:()=>selecting,toggle};render();
})();
