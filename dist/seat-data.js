(function () {
  'use strict';

  const ROWS = 'ABCDEFGHIJKLMN'.split('');
  const ZONES = [
    { id: 'L1', name: '왼쪽 외측', counts: [9, 10, 9, 8, 7, 5, 5, 4, 3] },
    { id: 'L2', name: '왼쪽 내측', counts: [4, 4, 4, 6, 6, 6, 7, 8, 9, 9, 6, 6, 4, 3] },
    { id: 'C', name: '중앙', counts: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9] },
    { id: 'R2', name: '오른쪽 내측', counts: [4, 4, 4, 5, 6, 6, 6, 8, 9, 9, 6, 6, 4, 2] },
    { id: 'R1', name: '오른쪽 외측', counts: [9, 9, 9, 8, 7, 5, 5, 4, 3] }
  ];

  const SEATS = [];
  ZONES.forEach((zone) => {
    zone.counts.forEach((count, rowIndex) => {
      for (let number = 1; number <= count; number += 1) {
        SEATS.push({
          id: `${zone.id}-${ROWS[rowIndex]}-${String(number).padStart(2, '0')}`,
          zoneId: zone.id,
          zoneName: zone.name,
          row: ROWS[rowIndex],
          rowIndex,
          number,
          rowCount: count
        });
      }
    });
  });

  window.SEAT_BLUEPRINT = Object.freeze({
    version: 1,
    rows: Object.freeze(ROWS),
    zones: Object.freeze(ZONES),
    seats: Object.freeze(SEATS),
    total: SEATS.length
  });
})();
