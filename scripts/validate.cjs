const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('dist/seat-data.js', 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: 'dist/seat-data.js' });

const blueprint = sandbox.window.SEAT_BLUEPRINT;
if (!blueprint) throw new Error('좌석 원본 데이터를 읽지 못했습니다.');

const expected = { L1: 60, L2: 82, C: 126, R2: 79, R1: 59 };
const actual = Object.fromEntries(Object.keys(expected).map((zoneId) => [zoneId, 0]));

for (const seat of blueprint.seats) {
  if (!(seat.zoneId in actual)) throw new Error(`알 수 없는 구역: ${seat.zoneId}`);
  actual[seat.zoneId] += 1;
}

if (blueprint.total !== 406 || blueprint.seats.length !== 406) {
  throw new Error(`총 좌석 수 불일치: ${blueprint.seats.length}`);
}

for (const [zoneId, count] of Object.entries(expected)) {
  if (actual[zoneId] !== count) {
    throw new Error(`${zoneId} 좌석 수 불일치: ${actual[zoneId]}`);
  }
}

const ids = new Set(blueprint.seats.map((seat) => seat.id));
if (ids.size !== blueprint.seats.length) {
  throw new Error('중복 좌석 ID가 있습니다.');
}

const outerRows = blueprint.seats.filter((seat) => seat.zoneId === 'L1' || seat.zoneId === 'R1');
if (outerRows.some((seat) => seat.rowIndex > 8)) {
  throw new Error('외측 구역에 I열 뒤 좌석이 있습니다.');
}

console.log('검증 완료: 총 406석 / L1 60 / L2 82 / C 126 / R2 79 / R1 59 / ID 406개 고유');

