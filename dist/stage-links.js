(function () {
  'use strict';
  // Only fixed, public URLs are used. This module never reads event/roster data.
  const banner = document.getElementById('banner-link');
  const trigger = document.getElementById('led-trigger');
  const menu = document.getElementById('led-menu');
  const viewport = document.getElementById('map-viewport');
  const items = Array.from(menu.querySelectorAll('a'));
  function close(returnFocus = false) {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus();
  }
  function open() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.left + rect.width / 2 - menu.offsetWidth / 2));
    const top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, rect.bottom + 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    items[0].focus({ preventScroll: true });
  }
  // Native SVG anchors must not activate after a pan-like or multi-touch gesture.
  // Do not capture the pointer: a normal short click keeps native new-tab behavior.
  let gesture = null;
  document.addEventListener('pointerdown', (event) => {
    if (gesture) { gesture.moved = true; return; }
    const target = event.target.closest('.stage-link');
    if (target) gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (!event.target.closest('.stage-link, .led-menu')) close();
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (gesture && gesture.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
  }, true);
  document.addEventListener('pointercancel', () => { if (gesture) gesture.moved = true; }, true);
  document.addEventListener('pointerup', () => {
    // click is dispatched immediately after pointerup; then forget the gesture.
    window.setTimeout(() => { gesture = null; }, 0);
  }, true);
  [banner, trigger].forEach((element) => {
    element.addEventListener('dragstart', (event) => event.preventDefault());
    element.addEventListener('click', (event) => {
      if (event.detail && gesture && gesture.moved) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  });
  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  trigger.addEventListener('keydown', (event) => {
    if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); open(); }
  });
  menu.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
    if (event.key === 'Tab') close();
  });
  items.forEach((item) => item.addEventListener('click', () => close(true)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !menu.hidden) close(true); });
  viewport.addEventListener('wheel', () => close(), { passive: true });
  document.querySelectorAll('#zoom-in, #zoom-out, #zoom-fit').forEach((button) => button.addEventListener('click', () => close()));
  window.addEventListener('resize', () => close());
  window.addEventListener('scroll', () => close(), { passive: true });
  window.addEventListener('beforeprint', () => close());
})();
