// Shared by Admin and Client: Facebook is a media variant of the same post.
export function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v|avi|mkv|ogv)(?:[?#]|$)/i.test(String(url));
}

export function facebookMedia(post) {
  if (post?.facebook_mirror_primary === true) return (post.media_urls || []).filter(url => typeof url === "string" && url);
  const urls = Array.isArray(post?.facebook_media_urls) ? post.facebook_media_urls : (post?.media_urls || []);
  return urls.filter(url => typeof url === 'string' && url && !isVideoUrl(url));
}

export function createFacebookPreview(host) {
  let mediaUrls = [], index = 0, returnFocus = null, touchStart = null;
  const dialog = document.createElement('dialog');
  dialog.className = 'fb-gallery';
  dialog.setAttribute('aria-label', 'Facebook media gallery');
  dialog.innerHTML = `<div class="fb-gallery-top"><span class="fb-gallery-count" aria-live="polite"></span><button type="button" class="fb-gallery-close" aria-label="Close media gallery" autofocus>Close ×</button></div><div class="fb-gallery-stage"><img alt="" hidden><video controls playsinline preload="metadata" hidden></video></div><div class="fb-gallery-controls"><button type="button" class="fb-gallery-prev" aria-label="Previous item">←</button><span>Swipe or use the arrows</span><button type="button" class="fb-gallery-next" aria-label="Next item">→</button></div>`;
  document.body.appendChild(dialog);
  const image = dialog.querySelector('img');
  const video = dialog.querySelector('video');
  let isVideo = isVideoUrl;
  function stopVideo() {
    if (!video.hasAttribute('src')) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  const count = dialog.querySelector('.fb-gallery-count');
  function show(next) {
    if (!mediaUrls.length) return;
    index = (next + mediaUrls.length) % mediaUrls.length;
    const url = mediaUrls[index];
    const playingVideo = isVideo(url);
    const label = `Facebook ${playingVideo ? 'video' : 'photo'} ${index + 1} of ${mediaUrls.length}`;
    stopVideo();
    image.hidden = playingVideo;
    video.hidden = !playingVideo;
    if (playingVideo) {
      video.src = url;
      video.setAttribute('aria-label', label);
    } else {
      image.src = url;
      image.alt = label;
    }
    count.textContent = `${index + 1} / ${mediaUrls.length}`;
    dialog.querySelector('.fb-gallery-prev').disabled = dialog.querySelector('.fb-gallery-next').disabled = mediaUrls.length < 2;
  }
  function close() {
    stopVideo();
    if (dialog.open) dialog.close();
  }
  dialog.querySelector('.fb-gallery-close').onclick = close;
  dialog.querySelector('.fb-gallery-prev').onclick = () => show(index - 1);
  dialog.querySelector('.fb-gallery-next').onclick = () => show(index + 1);
  dialog.addEventListener('close', () => { if (dialog.open) return; stopVideo(); document.body.classList.remove('fb-gallery-open'); returnFocus?.focus(); });
  dialog.addEventListener('keydown', event => {
    if (event.target === video) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); show(index + (event.key === 'ArrowLeft' ? -1 : 1)); }
  });
  const stage = dialog.querySelector('.fb-gallery-stage');
  stage.addEventListener('touchstart', event => { if (event.target === video) return; touchStart = [event.changedTouches[0].clientX, event.changedTouches[0].clientY]; }, {passive:true});
  stage.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart[0], dy = event.changedTouches[0].clientY - touchStart[1];
    touchStart = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
  }, {passive:true});
  return {
    close,
    render({brand, caption, urls, isVideo: detectVideo = isVideoUrl}) {
      if (dialog.open) close();
      mediaUrls = urls;
      isVideo = detectVideo;
      host.replaceChildren();
      const card = document.createElement('div'); card.className = 'fb-card';
      const header = document.createElement('div'); header.className = 'fb-header';
      const avatar = document.createElement('span'); avatar.className = 'fb-avatar'; avatar.textContent = 'N';
      const meta = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = brand;
      const label = document.createElement('span'); label.textContent = 'Facebook · Preview only';
      meta.append(name, label); header.append(avatar, meta);
      const copy = document.createElement('p'); copy.className = 'fb-caption'; copy.textContent = caption || '';
      const grid = document.createElement('div'); grid.className = `fb-grid fb-grid-${Math.min(mediaUrls.length, 4)}`;
      mediaUrls.slice(0, 4).forEach((url, tileIndex) => {
        const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'fb-tile';
        const videoTile = isVideo(url);
        const label = `Facebook ${videoTile ? 'video' : 'photo'} ${tileIndex + 1} of ${mediaUrls.length}`;
        const extra = tileIndex === 3 ? mediaUrls.length - 4 : 0;
        tile.setAttribute('aria-label', extra > 0 ? `Open ${label}, ${extra} more in gallery` : `Open ${label}`);
        const thumbnail = document.createElement(videoTile ? 'video' : 'img');
        if (videoTile) {
          thumbnail.muted = true;
          thumbnail.playsInline = true;
          thumbnail.preload = 'metadata';
          thumbnail.src = url.includes('#') ? url : `${url}#t=0.001`;
          thumbnail.setAttribute('aria-hidden', 'true');
        } else {
          thumbnail.src = url;
          thumbnail.alt = '';
          thumbnail.loading = 'lazy';
        }
        tile.appendChild(thumbnail);
        if (videoTile) {
          const play = document.createElement('span');
          play.className = 'fb-play'; play.textContent = '▶'; play.setAttribute('aria-hidden', 'true');
          tile.appendChild(play);
        }
        if (extra > 0) {
          const more = document.createElement('span');
          more.className = 'fb-more'; more.textContent = `+${extra}`; more.setAttribute('aria-hidden', 'true');
          tile.appendChild(more);
        }
        tile.onclick = () => { returnFocus = tile; show(tileIndex); dialog.showModal(); document.body.classList.add('fb-gallery-open'); };
        grid.appendChild(tile);
      });
      card.append(header, copy, grid);
      if (!mediaUrls.length) { const empty = document.createElement('p'); empty.className = 'fb-empty'; empty.textContent = 'No Facebook media is available for this post yet.'; card.appendChild(empty); }
      host.appendChild(card);
    }
  };
}
