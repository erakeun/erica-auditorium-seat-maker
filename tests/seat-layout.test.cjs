const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const layout = require('../dist/seat-layout.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('dist/seat-data.js', 'utf8'), sandbox);
const blueprint = sandbox.window.SEAT_BLUEPRINT;
const placed = blueprint.seats.map((seat) => ({ seat, pos: layout.seatPosition(seat, blueprint) }));
const polygons = placed.map(({ pos }) => layout.corners(pos));
function pointDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function intersects(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const axis = { x: q.y - p.y, y: p.x - q.x };
    const aa = a.map((v) => v.x * axis.x + v.y * axis.y), bb = b.map((v) => v.x * axis.x + v.y * axis.y);
    if (Math.max(...aa) <= Math.min(...bb) || Math.max(...bb) <= Math.min(...aa)) return false;
  }
  return true;
}
function polygonGap(a, b) {
  let result = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    result = Math.min(result, pointDistance(a[i], b[j], b[(j + 1) % 4]), pointDistance(b[j], a[i], a[(i + 1) % 4]));
  }
  return result;
}
let closestSeats = Infinity;
for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
  assert(!intersects(polygons[i], polygons[j]), `${placed[i].seat.id} overlaps ${placed[j].seat.id}`);
  closestSeats = Math.min(closestSeats, polygonGap(polygons[i], polygons[j]));
}
assert(closestSeats >= 5);
for (const row of blueprint.rows) {
  const inner = placed.filter(({ seat }) => seat.row === row && ['L2', 'C', 'R2'].includes(seat.zoneId));
  assert.equal(new Set(inner.map(({ pos }) => pos.centerY)).size, 1);
  assert(inner.every(({ pos }) => pos.rotation === 0));
}
for (const zone of ['L1', 'R1']) for (const row of blueprint.rows.slice(0, 9)) {
  const seats = placed.filter(({ seat }) => seat.zoneId === zone && seat.row === row);
  assert(seats.every(({ pos }) => pos.rotation === (zone === 'L1' ? 45 : -45)));
  for (let i = 1; i < seats.length; i++) {
    const a = seats[i - 1].pos, b = seats[i].pos;
    assert(Math.abs(Math.abs(a.centerX - b.centerX) - Math.abs(a.centerY - b.centerY)) < 1e-8);
    assert(Math.abs(Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY) - 38) < 1e-8);
  }
}
let aisleClearance = Infinity;
for (const side of ['left', 'right']) {
  const aisle = layout.outerAisleGeometry(side, blueprint);
  // A swept square around every segment sample is a conservative clearance check.
  for (let i = 1; i < aisle.points.length; i++) {
    const a = aisle.points[i - 1], b = aisle.points[i];
    for (let step = 0; step <= 10; step++) {
      const p = { x: a.x + (b.x - a.x) * step / 10, y: a.y + (b.y - a.y) * step / 10 };
      const sweep = [{ x:p.x-25,y:p.y-25 },{ x:p.x+25,y:p.y-25 },{ x:p.x+25,y:p.y+25 },{ x:p.x-25,y:p.y+25 }];
      for (const polygon of polygons) {
        assert(!intersects(sweep, polygon), `${side} aisle narrows at ${JSON.stringify(p)}`);
        for (let j = 0; j < 4; j++) aisleClearance = Math.min(aisleClearance, pointDistance(p, polygon[j], polygon[(j + 1) % 4]));
      }
    }
  }
}
for (const x of layout.aisleCenters) {
  assert(placed.filter(({seat}) => ['L2','C','R2'].includes(seat.zoneId)).every(({pos}) => Math.abs(pos.centerX - x) - pos.width / 2 >= 52));
}
assert.equal(layout.aisleCenters.length, 2);
const lastSeatBottom = Math.max(...polygons.flat().map((p) => p.y));
assert(layout.doorY - 29.5 - lastSeatBottom >= 60);
assert(placed.every(({pos}) => pos.y > 58));
console.log(`공간 검증: 406석 겹침 0, 좌석 외곽 최소 간격 ${closestSeats.toFixed(1)}, 중앙 통로 폭 104, 외측 통로 중심 최소 여유 ${aisleClearance.toFixed(1)}, 두 문 앞 여유 ${(layout.doorY-29.5-lastSeatBottom).toFixed(1)} (화면 좌표)`);
