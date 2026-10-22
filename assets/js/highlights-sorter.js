// Pointer capture supports mouse, pen and touch without dragging media files.
export function createHighlightSorter(grid, {onMove, isBusy}) {
  let drag = null, frame = 0;
  function clear() {
    cancelAnimationFrame(frame);
    grid.querySelectorAll('.is-dragging,.is-drop-target').forEach(node => node.classList.remove('is-dragging','is-drop-target'));
    grid.classList.remove('is-sorting');
    drag = null;
  }
  function targetAt(x, y) {
    const bounds = grid.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
    const direct = document.elementFromPoint(x,y)?.closest('.highlight-item');
    if (direct && grid.contains(direct)) return direct;
    // Gaps between tiles still offer an insertion destination.
    return [...grid.querySelectorAll('.highlight-item')].reduce((nearest, tile) => {
      const r = tile.getBoundingClientRect(), distance = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      return !nearest || distance < nearest.distance ? {tile, distance} : nearest;
    }, null)?.tile;
  }
  function showTarget() {
    grid.querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target'));
    const target = targetAt(drag.x, drag.y);
    drag.target = target ? Number(target.dataset.index) : null;
    if (target && drag.target !== drag.from) target.classList.add('is-drop-target');
  }
  function scroll() {
    if (!drag?.moved || !grid.isConnected) { clear(); return; }
    const r = grid.getBoundingClientRect();
    if (drag.x >= r.left && drag.x <= r.right) {
      const top = Math.max(0,r.top), bottom = Math.min(window.innerHeight,r.bottom);
      const distance = drag.y < top + 48 ? -Math.min(14,(top + 48 - drag.y) / 3) : drag.y > bottom - 48 ? Math.min(14,(drag.y - bottom + 48) / 3) : 0;
      if (distance) { grid.scrollTop += distance; showTarget(); }
    }
    frame = requestAnimationFrame(scroll);
  }
  grid.addEventListener('pointerdown', event => {
    const handle = event.target.closest('.highlight-drag');
    if (!handle || !grid.contains(handle) || isBusy() || !event.isPrimary || event.button !== 0) return;
    const tile = handle.closest('.highlight-item');
    drag = {handle, tile, from:Number(tile.dataset.index), target:null, startX:event.clientX, startY:event.clientY, x:event.clientX, y:event.clientY, pointerId:event.pointerId, moved:false};
    handle.setPointerCapture(event.pointerId);
  });
  grid.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.moved && Math.hypot(drag.x - drag.startX,drag.y - drag.startY) > 7) {
      drag.moved = true; drag.tile.classList.add('is-dragging'); grid.classList.add('is-sorting'); frame = requestAnimationFrame(scroll);
    }
    if (drag.moved) { event.preventDefault(); showTarget(); }
  });
  grid.addEventListener('pointerup', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const {from, target, moved, handle, pointerId} = drag;
    clear();
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    if (moved && target !== null && from !== target && !isBusy()) onMove(from,target);
  });
  grid.addEventListener('pointercancel', clear);
  grid.addEventListener('lostpointercapture', clear);
  grid.addEventListener('keydown', event => {
    const handle = event.target.closest('.highlight-drag');
    if (!handle || !grid.contains(handle)) return;
    if (event.key === 'Escape') { clear(); return; }
    if (!event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) || isBusy()) return;
    event.preventDefault();
    const tiles = [...grid.querySelectorAll('.highlight-item')], from = Number(handle.closest('.highlight-item').dataset.index);
    const firstTop = tiles[0]?.getBoundingClientRect().top;
    const columns = tiles.filter(tile => Math.abs(tile.getBoundingClientRect().top - firstTop) < 2).length || 1;
    const delta = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key];
    const to = Math.max(0,Math.min(tiles.length - 1,from + delta));
    if (to !== from) onMove(from,to);
  });
  return {cancel:clear};
}
