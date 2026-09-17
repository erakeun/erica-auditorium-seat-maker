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

// Check the real rotated seat corners, not just unrotated bounding boxes.
const boundary = layout.roomBoundary;
function insideRoom(point) {
  return boundary.every((a, i) => {
    const b = boundary[(i + 1) % boundary.length];
    return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) > 0;
  });
}
let wallClearance = Infinity;
polygons.forEach((polygon, index) => polygon.forEach((point) => {
  assert(insideRoom(point), `${placed[index].seat.id} crosses the room boundary`);
  boundary.forEach((a, i) => { wallClearance = Math.min(wallClearance, pointDistance(point, a, boundary[(i + 1) % boundary.length])); });
}));
assert(wallClearance >= 35, `wall is too close: ${wallClearance}`);
// All four stage-floor corners and both sides of each corridor stay inside.
[[580,75],[1220,75],[1290,220],[510,220]].forEach(([x,y]) => assert(insideRoom({x,y})));
for (const x of layout.aisleCenters) for (const y of [403,1165,1216]) {
  assert(insideRoom({x:x-50,y})); assert(insideRoom({x:x+50,y}));
}
const room = layout.roomGeometry();
assert.equal(room.gaps.length, 2);
assert.deepEqual(room.gaps.map((gap) => (gap.left + gap.right) / 2), layout.aisleCenters);
assert(room.gaps.every((gap) => gap.right-gap.left === 56 && gap.y === layout.doorY));
const wallSegments = room.wallPaths.flatMap((d) => {
  assert(!d.includes('Z'), 'wall must not close across the doors');
  const coordinates = [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({x:Number(match[1]),y:Number(match[2])}));
  return coordinates.slice(1).map((point,i) => [coordinates[i],point]);
});
room.gaps.forEach((gap) => {
  for (let x = gap.left+1; x < gap.right; x++) {
    assert(wallSegments.every(([a,b]) => pointDistance({x,y:gap.y},a,b) > .5), 'a wall blocks a doorway');
  }
  for (const x of [gap.left,gap.right]) assert(wallSegments.some((segment) => segment.some((p) => p.x === x && p.y === gap.y)), 'door jamb must meet wall endpoint');
});
const app = fs.readFileSync('dist/app.js','utf8');
assert(!app.includes("const stage = svgNode('a'"), 'stage floor must not be a link');
const links = fs.readFileSync('dist/stage-links.js','utf8');
assert(!/localStorage|assignments|participants|URLSearchParams/.test(links), 'external links must not access assignment data');
console.log(`벽 검증: 회전 좌석 406석·무대 내부 포함, 벽과 좌석 최소 여유 ${wallClearance.toFixed(1)}, 후면 개구부 정확히 2곳, 문틀·벽 끝점 일치 (화면 좌표)`);
