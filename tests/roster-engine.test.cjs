const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../dist/roster-engine.js');
const XLSX = require('../dist/vendor/xlsx.full.min.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('dist/seat-data.js', 'utf8'), sandbox);
const blueprint = sandbox.window.SEAT_BLUEPRINT;
const makePeople = (count, mode = 'class') => Array.from({ length: count }, (_, index) => engine.participant({ name: `가상참가자${String(index + 1).padStart(3, '0')}`, identifier: `T${String(index + 1).padStart(4, '0')}` }, index, mode, () => `P-${index + 1}`));
const random = (() => { let seed = 1729; return () => ((seed = (seed * 48271) % 2147483647) - 1) / 2147483646; })();
const defaults = { scope: 'all', classPattern: 'random', classArea: { zones: engine.ZONE_ORDER, startRow: 'A', endRow: 'N' } };

for (const [count, empty, unassigned] of [[400, 6, 0], [406, 0, 0], [407, 0, 1]]) {
  const preview = engine.buildPreview({ blueprint, participants: makePeople(count), assignments: {}, mode: 'class', options: defaults, random });
  const seats = preview.mappings.map((item) => item.seatId);
  const people = preview.mappings.map((item) => item.participantId);
  assert.equal(preview.mappings.length, 406 - empty);
  assert.equal(preview.unassigned.length, unassigned);
  assert.equal(new Set(seats).size, seats.length);
  assert.equal(new Set(people).size, people.length);
}

const unavailable = { 'C-A-01': { status: 'unavailable' }, 'L2-B-01': { status: 'unavailable' } };
const limited = engine.buildPreview({ blueprint, participants: makePeople(406), assignments: unavailable, mode: 'class', options: defaults, random });
assert.equal(limited.mappings.length, 404);
assert.equal(limited.unassigned.length, 2);
const capacityWithExternalSeat = engine.validateRoster(makePeople(406), blueprint, { 'C-A-01': { status: 'assigned', participantId: 'OUTSIDE-ROSTER' } });
assert(capacityWithExternalSeat.issues.some((issue) => issue.code === 'capacity'));

const fixedPerson = engine.participant({ name: '고정참가자' }, 0, 'class', () => 'P-FIXED');
const others = [fixedPerson, ...makePeople(20).map((person, index) => ({ ...person, id: `P-O-${index}` }))];
const fixedAssignment = { 'C-B-02': { status: 'assigned', name: fixedPerson.name, org: '', note: '', color: '#0d5c8f', participantId: fixedPerson.id, fixed: true } };
const fixedPreview = engine.buildPreview({ blueprint, participants: others, assignments: fixedAssignment, mode: 'class', options: defaults, random });
assert.equal(fixedPreview.assignments['C-B-02'].participantId, fixedPerson.id);
assert.equal(fixedPreview.assignments['C-B-02'].fixed, true);

const duplicates = [
  engine.participant({ name: '동명이인', identifier: '001' }, 0, 'class', () => 'P-A'),
  engine.participant({ name: '동명이인', identifier: '001' }, 1, 'class', () => 'P-B'),
  engine.participant({ name: '동명이인', requestedSeat: 'C-A-01' }, 2, 'class', () => 'P-C'),
  engine.participant({ name: '동명이인', requestedSeat: 'C-A-01' }, 3, 'class', () => 'P-D')
];
const duplicateValidation = engine.validateRoster(duplicates, blueprint, {});
assert(duplicateValidation.issues.some((issue) => issue.code === 'duplicate-identifier'));
assert(duplicateValidation.issues.some((issue) => issue.code === 'duplicate-seat'));
assert.equal(duplicates.length, 4);

const vip = [
  engine.participant({ name: '1순위', priority: 1 }, 0, 'event', () => 'VIP-1'),
  engine.participant({ name: '2순위', priority: 2 }, 1, 'event', () => 'VIP-2'),
  engine.participant({ name: '일반', priority: '' }, 2, 'event', () => 'GENERAL-1')
];
const eventOptions = { scope: 'all', centerDirection: 'left', vipArea: { zones: ['C'], startRow: 'A', endRow: 'C' }, generalArea: { zones: engine.ZONE_ORDER, startRow: 'A', endRow: 'N' } };
const vipPreview = engine.buildPreview({ blueprint, participants: vip, assignments: {}, mode: 'event', options: eventOptions });
assert.equal(vipPreview.assignments['C-A-05'].participantId, 'VIP-1');
assert.deepEqual(engine.middleOrder(9, false), [5, 4, 6, 3, 7, 2, 8, 1, 9]);
assert.deepEqual(engine.middleOrder(9, true), [5, 6, 4, 7, 3, 8, 2, 9, 1]);

const tooManyVip = makePeople(28, 'event').map((person, index) => ({ ...person, priority: index + 1 }));
const vipOverflow = engine.buildPreview({ blueprint, participants: tooManyVip, assignments: {}, mode: 'event', options: eventOptions });
assert.equal(vipOverflow.unassigned.length, 1);
assert(vipOverflow.conflicts.some((item) => item.message.includes('내빈 배치 영역')));

const conflict = engine.buildPreview({ blueprint, participants: [vip[0]], assignments: { 'C-A-05': { status: 'assigned', participantId: 'OTHER', fixed: true } }, mode: 'event', options: eventOptions });
assert.equal(conflict.unassigned.length, 1);
assert(conflict.conflicts.some((item) => item.message.includes('C-A-05')));
const repeatedPerson = makePeople(1)[0];
const repeatedPreview = engine.buildPreview({ blueprint, participants: [repeatedPerson, { ...repeatedPerson }], assignments: {}, mode: 'class', options: defaults, random });
assert.equal(repeatedPreview.mappings.filter((item) => item.participantId === repeatedPerson.id).length, 1);
assert.equal(engine.safeSpreadsheetText('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
assert.equal(engine.safeSpreadsheetText('001234'), '001234');
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['식별번호', '이름'], ['001234', engine.safeSpreadsheetText('=1+1')]]), '명단');
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['이름'], ['두번째 시트 가상참가자']]), '추가시트');
const roundTrip = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellFormula: false });
assert.deepEqual(roundTrip.SheetNames, ['명단', '추가시트']);
assert.equal(roundTrip.Sheets['명단'].A2.v, '001234');
assert.equal(roundTrip.Sheets['명단'].B2.v, "'=1+1");

console.log('명단·자동 배치 검증 완료: 400/406/407명, 사용 불가, 고정, 중복, 의전순위, 내빈 영역');
