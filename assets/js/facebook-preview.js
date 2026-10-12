// Shared by Admin and Client: Facebook is a media variant of the same post.
export function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v|avi|mkv|ogv)(?:[?#]|$)/i.test(String(url));
}

export function facebookMedia(post) {
  const urls = Array.isArray(post?.facebook_media_urls) ? post.facebook_media_urls : (post?.media_urls || []);
  return urls.filter(url => typeof url === 'string' && url && !isVideoUrl(url));
}

export function createFacebookPreview(host) {
  let pictures = [], index = 0, returnFocus = null, touchStart = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'fb-gallery';
  dialog.setAttribute('aria-label', 'Facebook photo gallery');
  dialog.innerHTML = `<div class="fb-gallery-top"><span class="fb-gallery-count" aria-live="polite"></span><button type="button" class="fb-gallery-close" aria-label="Close photo gallery" autofocus>Close ×</button></div><div class="fb-gallery-stage"><img alt=""></div><div class="fb-gallery-controls"><button type="button" class="fb-gallery-prev" aria-label="Previous photo">←</button><span>Swipe or use the arrows</span><button type="button" class="fb-gallery-next" aria-label="Next photo">→</button></div>`;
  document.body.appendChild(dialog);
  const image = dialog.querySelector('img');
  const count = dialog.querySelector('.fb-gallery-count');
  function show(next) {
    if (!pictures.length) return;
    index = (next + pictures.length) % pictures.length;
    image.src = pictures[index];
    image.alt = `Facebook photo ${index + 1} of ${pictures.length}`;
    count.textContent = `${index + 1} / ${pictures.length}`;
    dialog.querySelector('.fb-gallery-prev').disabled = dialog.querySelector('.fb-gallery-next').disabled = pictures.length < 2;
  }
  function close() { dialog.close(); }
  dialog.querySelector('.fb-gallery-close').onclick = close;
  dialog.querySelector('.fb-gallery-prev').onclick = () => show(index - 1);
  dialog.querySelector('.fb-gallery-next').onclick = () => show(index + 1);
  dialog.addEventListener('close', () => { document.body.classList.remove('fb-gallery-open'); returnFocus?.focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); show(index + (event.key === 'ArrowLeft' ? -1 : 1)); }
  });
  const stage = dialog.querySelector('.fb-gallery-stage');
  stage.addEventListener('touchstart', event => { touchStart = [event.changedTouches[0].clientX, event.changedTouches[0].clientY]; }, {passive:true});
  stage.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart[0], dy = event.changedTouches[0].clientY - touchStart[1];
    touchStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
  }, {passive:true});
  return {
    close,
    render({brand, caption, urls}) {
      if (dialog.open) close();
      pictures = urls.filter(url => !isVideoUrl(url));
      host.replaceChildren();
      const card = document.createElement('div'); card.className = 'fb-card';
      const header = document.createElement('div'); header.className = 'fb-header';
      const avatar = document.createElement('span'); avatar.className = 'fb-avatar'; avatar.textContent = 'N';
      const meta = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = brand;
      const label = document.createElement('span'); label.textContent = 'Facebook · Preview only';
      meta.append(name, label); header.append(avatar, meta);
      const copy = document.createElement('p'); copy.className = 'fb-caption'; copy.textContent = caption || '';
      const grid = document.createElement('div'); grid.className = `fb-grid fb-grid-${Math.min(pictures.length, 4)}`;
      pictures.slice(0, 4).forEach((url, tileIndex) => {
        const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'fb-tile';
        tile.setAttribute('aria-label', tileIndex === 3 && pictures.length > 4 ? `View all ${pictures.length} Facebook photos` : `Open Facebook photo ${tileIndex + 1} of ${pictures.length}`);
        const thumbnail = document.createElement('img'); thumbnail.src = url; thumbnail.alt = `Facebook photo ${tileIndex + 1}`; thumbnail.loading = 'lazy';
        tile.appendChild(thumbnail);
        if (tileIndex === 3 && pictures.length > 4) { const more = document.createElement('span'); more.className = 'fb-more'; more.textContent = `+${pictures.length - 4}`; tile.appendChild(more); }
        tile.onclick = () => { returnFocus = tile; show(tileIndex); dialog.showModal(); document.body.classList.add('fb-gallery-open'); };
        grid.appendChild(tile);
      });
      card.append(header, copy, grid);
      if (!pictures.length) { const empty = document.createElement('p'); empty.className = 'fb-empty'; empty.textContent = 'No Facebook stills are available for this post yet.'; card.appendChild(empty); }
      host.appendChild(card);
    }
  };
}
