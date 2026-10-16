import {downloadStem, mediaFilename, postZip, MAX_BUNDLE_BYTES} from './post-download-model.js';

export function createPostDownload(button, getSnapshot) {
  const dialog = document.createElement('dialog');
  dialog.className = 'post-download';
  dialog.setAttribute('aria-labelledby','downloadTitle');
  dialog.innerHTML = `<header><div><p class="download-eyebrow">Manual publishing</p><h2 id="downloadTitle">Download post</h2></div><button type="button" class="download-close" aria-label="Close downloads" autofocus>Close ×</button></header>
    <p class="download-context"></p><p>These files and the caption reflect the current preview, including any edits you haven’t saved.</p>
    <label for="downloadCaption">Caption</label><textarea id="downloadCaption" readonly rows="4"></textarea>
    <div class="download-actions"><button type="button" class="download-copy">Copy caption</button><a class="download-caption-file">Download caption</a></div>
    <h3>Original media, in post order</h3><ol class="download-files"></ol>
    <div class="download-actions"><button type="button" class="download-prepare">Prepare all files</button><a class="download-zip" hidden>Download ZIP</a><button type="button" class="download-share" hidden>Share / save media</button></div>
    <p class="download-status" role="status" aria-live="polite"></p>
    <p class="download-help">On your phone, use Share / save media when available to choose a destination such as Photos or Files. ZIP downloads go to Downloads or Files; extract the ZIP before posting. Copy the caption separately when sharing media.</p>`;
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  const status = find('.download-status'), prepare = find('.download-prepare'), share = find('.download-share');
  const zipLink = find('.download-zip'), caption = find('textarea');
  let controller, snapshot, stem, files = [], pending = [], rows = [], urls = [], busy = false;
  function objectURL(blob) { const url = URL.createObjectURL(blob); urls.push(url); return url; }
  function downloadLink(link, blob, name) { link.href = objectURL(blob); link.download = name; }
  function clean() {
    controller?.abort();
    // Give a download started immediately before closing time to consume its URL.
    const oldUrls = urls; setTimeout(() => oldUrls.forEach(url => URL.revokeObjectURL(url)), 60000);
    urls = []; files = []; pending = []; rows = []; snapshot = null; busy = false;
  }
  find('.download-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { clean(); button.focus(); });
  find('.download-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(caption.value); status.textContent = 'Caption copied.'; }
    catch { caption.focus(); caption.select(); status.textContent = 'Select and copy the caption using your phone or browser’s Copy command.'; }
  };
  async function getFile(index, operation) {
    if (files[index]) return files[index];
    if (pending[index]) return pending[index];
    const item = snapshot.media[index], row = rows[index];
    row.button.disabled = true; row.button.textContent = 'Preparing…';
    pending[index] = (async () => {
      const response = await fetch(item.url, {signal:operation.signal, credentials:'omit'});
      if (!response.ok) throw new Error(`File ${index + 1} couldn’t be fetched (${response.status}).`);
      const blob = await response.blob();
      operation.signal.throwIfAborted();
      const name = mediaFilename(stem, index, item.name || item.url, blob.type);
      const file = new File([blob],name,{type:blob.type || item.type || 'application/octet-stream'});
      files[index] = file;
      row.label.textContent = `${String(index + 1).padStart(2,'0')} · ${name} (${(file.size / 1048576).toFixed(1)} MB)`;
      downloadLink(row.link,file,name); row.link.hidden = false; row.button.hidden = true;
      return file;
    })();
    try { return await pending[index]; }
    catch (error) {
      if (!operation.signal.aborted) {
        row.button.disabled = false; row.button.textContent = 'Retry file'; row.original.hidden = false;
        pending[index] = null;
      }
      throw error;
    }
  }
  function showError(error, operation) {
    if (!operation.signal.aborted) status.textContent = `${error.message || 'The download couldn’t be prepared.'} You can retry or use Open original to save a file directly.`;
  }
  prepare.onclick = async () => {
    if (busy) return;
    busy = true; prepare.disabled = true; share.hidden = true; zipLink.hidden = true;
    const operation = controller;
    try {
      const all = []; let total = 0;
      for (let i = 0; i < snapshot.media.length; i++) {
        status.textContent = `Preparing file ${i + 1} of ${snapshot.media.length}…`;
        const file = await getFile(i, operation); all.push(file); total += file.size;
        if (total > MAX_BUNDLE_BYTES) throw new Error('This post is larger than 250 MB. Use the individual file downloads below each file name.');
      }
      if (navigator.canShare && navigator.share) {
        try { share.hidden = !navigator.canShare({files:all}); } catch { share.hidden = true; }
      }
      status.textContent = 'Building ZIP…';
      const zip = await postZip([...all,new File([snapshot.caption], 'caption.txt',{type:'text/plain'})],operation.signal);
      operation.signal.throwIfAborted();
      downloadLink(zipLink,zip,`${stem}.zip`); zipLink.hidden = false;
      status.textContent = 'Your files are ready. Download the ZIP, save individual files, or use Share / save media if available.';
      prepare.hidden = true;
    } catch (error) { showError(error,operation); }
    finally { if (!operation.signal.aborted) { busy = false; prepare.disabled = false; } }
  };
  share.onclick = async () => {
    // Prepared files allow this call to retain the phone's required tap activation.
    share.disabled = true;
    const operation = controller;
    try { await navigator.share({files:[...files]}); if (!operation.signal.aborted) status.textContent = 'Media handed to your device’s share menu.'; }
    catch (error) { if (!operation.signal.aborted) status.textContent = error.name === 'AbortError' ? 'Sharing cancelled. Your files are still ready to download.' : 'This device couldn’t share these files together. Use the individual downloads or ZIP instead.'; }
    finally { if (!operation.signal.aborted) share.disabled = false; }
  };
  button.onclick = () => {
    if (dialog.open) return;
    clean(); controller = new AbortController(); snapshot = getSnapshot();
    if (!snapshot) return;
    stem = downloadStem(snapshot.client,snapshot.slot,snapshot.version);
    find('.download-context').textContent = `${snapshot.clientLabel} · Post ${String(snapshot.slot).padStart(3,'0')} · ${snapshot.versionLabel}`;
    caption.value = snapshot.caption || '';
    downloadLink(find('.download-caption-file'),new Blob([caption.value],{type:'text/plain;charset=utf-8'}),`${stem}-caption.txt`);
    find('.download-copy').disabled = !caption.value;
    prepare.hidden = !snapshot.media.length; prepare.disabled = false; share.hidden = true; share.disabled = false; zipLink.hidden = true;
    status.textContent = snapshot.media.length ? 'Prepare the files you need, then tap Download to save them. Original image and video quality is preserved.' : 'This version has no media. You can still copy or download its caption.';
    find('ol').replaceChildren();
    snapshot.media.forEach((item,index) => {
      const li = document.createElement('li'), label = document.createElement('span');
      label.textContent = `${String(index + 1).padStart(2,'0')} · ${item.type?.startsWith('video/') || /\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.test(item.url) ? 'Video' : 'Image'}`;
      const actions = document.createElement('div'), fileButton = document.createElement('button'), link = document.createElement('a'), original = document.createElement('a');
      actions.className = 'download-actions'; fileButton.type = 'button'; fileButton.textContent = 'Prepare file';
      fileButton.setAttribute('aria-label',`Prepare file ${index + 1}`);
      link.textContent = 'Download file'; link.setAttribute('aria-label',`Download file ${index + 1}`); link.hidden = true;
      original.textContent = 'Open original'; original.href = item.url; original.target = '_blank'; original.rel = 'noopener'; original.hidden = true;
      fileButton.onclick = async () => { const operation = controller; try { await getFile(index,operation); if (!operation.signal.aborted) status.textContent = `File ${index + 1} is ready. Tap Download file to save it.`; } catch (error) { showError(error,operation); } };
      rows.push({label,button:fileButton,link,original}); actions.append(fileButton,link,original); li.append(label,actions); find('ol').append(li);
    });
    dialog.showModal();
  };
}
