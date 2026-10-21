import {IMAGE_MS, adjacent} from './highlights-model.js';

export function createHighlightsPlayer() {
  const dialog = document.createElement('dialog');
  dialog.className = 'story-player';
  dialog.setAttribute('aria-label', 'Highlight story player');
  dialog.innerHTML = `<div class="story-layout"><button type="button" class="story-arrow story-previous" aria-label="Previous story">‹</button><section class="story-frame"><div class="story-media"></div><div class="story-top"><div class="story-progress" aria-label="Story progress"></div><header><img class="story-cover" alt=""><div><strong class="story-title"></strong><span class="story-counter"></span></div><button type="button" class="story-pause" aria-label="Pause story">Ⅱ</button><button type="button" class="story-sound" aria-label="Turn sound on">Sound off</button><button type="button" class="story-close" aria-label="Close stories">×</button></header></div><p class="story-error" role="status" hidden></p><button type="button" class="story-tap story-tap-back" aria-label="Previous story"></button><button type="button" class="story-tap story-tap-next" aria-label="Next story"></button></section><button type="button" class="story-arrow story-next" aria-label="Next story">›</button></div>`;
  document.body.append(dialog);
  const find = s => dialog.querySelector(s), media = find('.story-media'), progress = find('.story-progress'), error = find('.story-error');
  const pause = find('.story-pause'), sound = find('.story-sound');
  let groups = [], g = 0, i = 0, paused = false, muted = true, ready = false, elapsed = 0, last = 0, raf = 0, generation = 0, opener = null, oldOverflow;
  const video = () => media.querySelector('video');
  const isPaused = () => paused || document.hidden;
  function sync() {
    pause.textContent = paused ? '▶' : 'Ⅱ';
    pause.setAttribute('aria-label', paused ? 'Resume story' : 'Pause story');
    pause.setAttribute('aria-pressed', String(paused));
    sound.textContent = muted ? 'Sound off' : 'Sound on';
    sound.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    sound.setAttribute('aria-pressed', String(!muted));
    if (video()) {
      video().muted = muted;
      if (isPaused() || !ready) video().pause();
      else video().play().catch(() => { paused = true; sync(); });
    }
    last = 0;
  }
  function tick(now) {
    if (!dialog.open) return;
    if (ready && !isPaused()) {
      if (last && !video()) elapsed += now - last;
      const v = video();
      const fraction = v ? (Number.isFinite(v.duration) && v.duration > 0 ? v.currentTime / v.duration : 0) : elapsed / IMAGE_MS;
      progress.children[i]?.firstElementChild?.style.setProperty('transform', `scaleX(${Math.min(1, fraction)})`);
      if (!v && elapsed >= IMAGE_MS) { step(1); return; }
    }
    last = now;
    raf = requestAnimationFrame(tick);
  }
  function show() {
    cancelAnimationFrame(raf); generation++; const token = generation;
    video()?.pause(); media.replaceChildren(); ready = false; elapsed = 0; last = 0; error.hidden = true;
    const group = groups[g], item = group.media[i];
    find('.story-title').textContent = group.title;
    find('.story-counter').textContent = `${i + 1} / ${group.media.length}`;
    find('.story-cover').src = group.cover_url;
    progress.replaceChildren();
    group.media.forEach((_, index) => { const bar = document.createElement('span'), fill = document.createElement('b'); fill.style.transform = `scaleX(${index < i ? 1 : 0})`; bar.append(fill); progress.append(bar); });
    const el = document.createElement(item.kind === 'video' ? 'video' : 'img');
    const fail = () => { if (token !== generation) return; ready = false; error.textContent = 'This media could not play. Use the next arrow to continue.'; error.hidden = false; };
    el.onerror = fail;
    if (item.kind === 'video') {
      el.playsInline = true; el.preload = 'auto'; el.muted = muted;
      el.onloadeddata = () => { if (token === generation) { ready = true; sync(); } };
      el.onwaiting = () => { ready = false; };
      el.onplaying = () => { ready = true; };
      el.oncanplay = () => { if (token === generation) { ready = true; sync(); } };
      el.onended = () => { if (token === generation) step(1); };
      sound.hidden = false;
    } else {
      el.alt = item.name || `${group.title}, story ${i + 1}`;
      el.onload = () => { if (token === generation) { ready = true; last = 0; } };
      sound.hidden = true;
    }
    media.append(el); el.src = item.url;
    find('.story-previous').disabled = !adjacent(groups, g, i, -1);
    find('.story-tap-back').disabled = !adjacent(groups, g, i, -1);
    sync(); raf = requestAnimationFrame(tick);
  }
  function step(direction) {
    const target = adjacent(groups, g, i, direction);
    if (!target) { if (direction > 0) dialog.close(); else raf = requestAnimationFrame(tick); return; }
    g = target.group; i = target.item; show();
  }
  find('.story-close').onclick = () => dialog.close();
  for (const selector of ['.story-previous', '.story-tap-back']) find(selector).onclick = () => step(-1);
  for (const selector of ['.story-next', '.story-tap-next']) find(selector).onclick = () => step(1);
  pause.onclick = () => { paused = !paused; sync(); };
  sound.onclick = () => { muted = !muted; sync(); };
  dialog.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
    if (e.code === 'Space' && e.target === dialog) { e.preventDefault(); paused = !paused; sync(); }
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.addEventListener('visibilitychange', () => { if (dialog.open) sync(); });
  dialog.addEventListener('close', () => { generation++; cancelAnimationFrame(raf); video()?.pause(); media.replaceChildren(); document.body.style.overflow = oldOverflow; if (opener?.isConnected) opener.focus(); });
  return {
    open(list, index, button) {
      if (!list[index]?.media?.length || dialog.open) return;
      groups = list; g = index; i = 0; paused = false; muted = true; opener = button;
      oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      dialog.showModal(); find('.story-close').focus(); show();
    },
    close() { if (dialog.open) dialog.close(); }
  };
}
