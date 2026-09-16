(function (root, factory) {
  const layout = factory();
  if (typeof module === 'object' && module.exports) module.exports = layout;
  else root.SEAT_LAYOUT = layout;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Display coordinates only; these are not measured dimensions or seat numbers.
  const width = 32;
  const height = 34;
  const pitch = 38;
  const centerX = 900;
  const aisleCenters = [680, 1120];
  const doorY = 1260;
  const rowY = (index) => 403 + index * 56;
  const rowWidth = (count) => count * width + (count - 1) * (pitch - width);
  function innerRowEdges(zoneId, count) {
    const span = rowWidth(count);
    if (zoneId === 'L2') return { left: 628 - span, right: 628 };
    if (zoneId === 'R2') return { left: 1172, right: 1172 + span };
    return { left: centerX - span / 2, right: centerX + span / 2 };
  }
  function seatPosition(seat, blueprint) {
    let x;
    let y = rowY(seat.rowIndex) + height / 2;
    let rotation = 0;
    if (['L2', 'C', 'R2'].includes(seat.zoneId)) {
      x = innerRowEdges(seat.zoneId, seat.rowCount).left + width / 2 + (seat.number - 1) * pitch;
    } else {
      const left = seat.zoneId === 'L1';
      const innerId = left ? 'L2' : 'R2';
      const count = blueprint.zones.find((zone) => zone.id === innerId).counts[seat.rowIndex];
      const edges = innerRowEdges(innerId, count);
      const anchorX = left ? edges.left + width / 2 - 190 : edges.right - width / 2 + 190;
      const steps = left ? seat.rowCount - seat.number : seat.number - 1;
      x = anchorX + (left ? -1 : 1) * steps * pitch / Math.sqrt(2);
      y -= steps * pitch / Math.sqrt(2);
      rotation = left ? 45 : -45;
    }
    return { x: x - width / 2, y: y - height / 2, width, height, centerX: x, centerY: y, rotation };
  }
  function corners(position) {
    const angle = position.rotation * Math.PI / 180;
    return [[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]].map(([x, y]) => ({
      x: position.centerX + x * Math.cos(angle) - y * Math.sin(angle),
      y: position.centerY + x * Math.sin(angle) + y * Math.cos(angle)
    }));
  }
  function outerAisleGeometry(side, blueprint) {
    const left = side === 'left';
    const outerId = left ? 'L1' : 'R1';
    const innerId = left ? 'L2' : 'R2';
    // Trace the actual free corridor, including neighboring rows at each bend.
    const boxes = blueprint.seats.filter((seat) => [outerId, innerId].includes(seat.zoneId)).map((seat) => {
      const points = corners(seatPosition(seat, blueprint));
      return { zone: seat.zoneId, left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) };
    });
    const points = [];
    for (let y = rowY(0) - 16; y <= rowY(8) + height + 16; y += 4) {
      const nearby = boxes.filter((box) => box.top <= y + 28 && box.bottom >= y - 28);
      const inner = nearby.filter((box) => box.zone === innerId);
      const outer = nearby.filter((box) => box.zone === outerId);
      if (!inner.length || !outer.length) continue;
      const a = left ? Math.max(...outer.map((box) => box.right)) : Math.max(...inner.map((box) => box.right));
      const b = left ? Math.min(...inner.map((box) => box.left)) : Math.min(...outer.map((box) => box.left));
      points.push({ x: (a + b) / 2, y });
    }
    return { points, labelX: points[0].x, labelY: points[0].y - 15, d: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') };
  }
  return { width, height, centerX, aisleCenters, doorY, rowY, seatPosition, corners, outerAisleGeometry };
});
