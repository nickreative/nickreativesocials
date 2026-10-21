import {requireHighlightAdminSession} from './portal-auth.js';
import {createHighlightsPlayer} from './highlights-player.js';
import {validateFiles, moveItem} from './highlights-model.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node; };
function button(text, action, cls = '') { const b = el('button', cls, text); b.type = 'button'; b.onclick = action; return b; }

export function createContentHighlights({supabase, user, content, client, clientLabel, clientSelect}) {
  const admin = user.app_metadata?.role === 'admin';
  const module = el('div', 'content-module'); content.before(module);
  const toolbar = el('div', 'highlights-toolbar');
  const label = el('label', '', 'Content preview '), mode = el('select'); mode.setAttribute('aria-label', 'Content preview');
  for (const [value, text] of [['posts', 'Approvals'], ['highlights', 'Highlights/Stories']]) { const o = el('option', '', text); o.value = value; mode.append(o); }
  label.append(mode); toolbar.append(label); module.append(toolbar, content);
  const host = el('section', 'highlights-workspace'); host.hidden = true; module.append(host);
  host.innerHTML = `<div class="highlights-heading"><div><span class="eyebrow">Content preview</span><h2>Highlights/Stories</h2><p>Open a highlight to preview its stories. Please send feedback by email.</p></div><div class="highlights-client"></div></div><p class="highlights-message" role="status" aria-live="polite"></p><div class="highlights-columns"><section class="highlights-profile" aria-label="Instagram profile preview"><header class="highlights-profile-header"><img class="highlights-avatar" alt=""><div><strong class="highlights-handle"></strong><h3 class="highlights-brand"></h3><p class="highlights-bio"></p></div></header><div class="highlight-circles" aria-label="Highlights"></div><p class="highlights-empty" hidden>No highlights yet.</p><div class="highlights-grid-label">▦ <span>Posts</span></div><div class="highlights-post-grid" aria-label="Post grid preview"></div></section><section class="highlights-editor" aria-label="Manage highlight" hidden></section></div>`;
  const find = s => host.querySelector(s), message = find('.highlights-message'), circles = find('.highlight-circles'), editor = find('.highlights-editor');
  const player = createHighlightsPlayer();
  let selectedClient = client, groups = [], active = null, draft = [], coverFile = null, coverObjectURL = null, dirty = false, busy = false, request = 0;
  let titleInput, itemsHost, editorStatus, saveButton, titleCounter;
  const highlightClient = admin ? clientSelect.cloneNode(true) : null;
  if (admin) {
    highlightClient.removeAttribute('id'); highlightClient.value = client;
    highlightClient.setAttribute('aria-label', 'Highlights client');
    const clientLabelNode = el('label', '', 'Client '); clientLabelNode.append(highlightClient); find('.highlights-client').append(clientLabelNode);
    highlightClient.onchange = () => {
      clientSelect.value = highlightClient.value; clientSelect.dispatchEvent(new Event('change'));
    };
    clientSelect.addEventListener('change', event => {
      if (busy || (dirty && !confirm('Discard unsaved highlight changes?'))) {
        event.stopImmediatePropagation(); clientSelect.value = selectedClient; highlightClient.value = selectedClient;
      }
    }, {capture:true});
    clientSelect.addEventListener('change', () => {
      selectedClient = clientSelect.value; highlightClient.value = selectedClient; request++; resetDraft(); groups = []; renderProfile([]); if (!host.hidden) load();
    });
  }
  function resetDraft() {
    draft.forEach(item => { if (item.file) URL.revokeObjectURL(item.url); });
    if (coverObjectURL) URL.revokeObjectURL(coverObjectURL);
    draft = []; active = null; coverFile = null; coverObjectURL = null; dirty = false; editor.replaceChildren(); editor.hidden = true;
  }
  function markDirty() { dirty = true; if (saveButton) saveButton.disabled = false; }
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  function renderProfile(posts) {
    const liven = selectedClient === 'livencommunities';
    find('.highlights-avatar').hidden = !liven;
    if (liven) find('.highlights-avatar').src = '/assets/images/highlights/liven.jpg';
    find('.highlights-avatar').alt = liven ? 'Liven Communities logo' : '';
    find('.highlights-handle').textContent = liven ? 'liven_communities' : (admin ? highlightClient.selectedOptions[0]?.textContent : clientLabel);
    find('.highlights-brand').textContent = liven ? 'Liven Communities' : 'Instagram preview';
    find('.highlights-bio').textContent = liven ? 'Liven owns and operates luxurious resort style communities created for those 50 and over.' : 'Highlights and current content queue';
    circles.replaceChildren(); find('.highlights-empty').hidden = groups.length > 0;
    groups.forEach((group, index) => {
      const wrap = el('div', 'highlight-circle-wrap'), play = button('', () => {
        if (group.media.length) player.open(groups, index, play);
        else message.textContent = `${group.title} has no stories yet.${admin ? ' Select Edit to add images or videos.' : ''}`;
      }, 'highlight-circle');
      play.setAttribute('aria-label', `Play ${group.title}, ${group.media.length} stories`);
      const cover = el('img'); cover.src = group.cover_url; cover.alt = ''; play.append(cover);
      const title = el('span', 'highlight-circle-title', group.title); title.title = group.title;
      wrap.append(play, title);
      if (admin) wrap.append(button('Edit', () => openEditor(group), 'highlight-edit'));
      circles.append(wrap);
    });
    const grid = find('.highlights-post-grid'); grid.replaceChildren();
    for (const post of posts) {
      const tile = el('div', 'highlights-post');
      const image = el('img'); image.src = post.thumbnail_url || '/assets/empty.png'; image.alt = `Post ${post.slot} thumbnail`; image.loading = 'lazy'; tile.append(image); grid.append(tile);
    }
    if (!posts.length) grid.append(el('p', 'highlights-grid-empty', 'Your content queue will appear here.'));
  }
  async function load() {
    const token = ++request; message.textContent = 'Loading highlights…';
    try {
      const [highlights, posts] = await Promise.all([
        supabase.from('story_highlights').select('*').eq('client', selectedClient).order('position'),
        supabase.from('posts').select('slot, thumbnail_url').eq('client', selectedClient).order('slot')
      ]);
      if (token !== request) return;
      if (highlights.error || posts.error) throw highlights.error || posts.error;
      groups = highlights.data || []; renderProfile(posts.data || []); message.textContent = '';
    } catch { if (token === request) { groups = []; renderProfile([]); message.textContent = 'Could not load highlights. Switch to Approvals, then Highlights/Stories to retry.'; } }
  }
  function openEditor(group, {saved = false} = {}) {
    if ((busy && !saved) || (dirty && !confirm('Discard unsaved highlight changes?'))) return;
    resetDraft(); active = {...group}; draft = group.media.map(item => ({...item})); editor.hidden = false;
    editor.append(el('span', 'eyebrow', 'Admin'), el('h3', '', `Edit ${group.title}`));
    const titleLabel = el('label', '', 'Highlight name'); titleInput = el('input'); titleInput.value = group.title; titleInput.maxLength = 15; titleInput.setAttribute('aria-label', 'Highlight name'); titleInput.required = true;
    titleCounter = el('small', '', `${group.title.length}/15 characters`);
    titleInput.oninput = () => { titleCounter.textContent = `${titleInput.value.length}/15 characters`; markDirty(); };
    titleLabel.append(titleInput, titleCounter); editor.append(titleLabel);
    const coverLabel = el('label', '', 'Replace circle cover'), coverInput = el('input'); coverInput.type = 'file'; coverInput.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
    const coverPreview = el('img', 'highlight-cover-preview'); coverPreview.src = group.cover_url; coverPreview.alt = 'Highlight cover';
    coverInput.onchange = () => {
      try {
        const file = coverInput.files[0]; if (!file) return;
        const [{kind}] = validateFiles([file]); if (kind !== 'image') throw new Error('Choose an image for the circle cover.');
        if (coverObjectURL) URL.revokeObjectURL(coverObjectURL);
        coverFile = file; coverObjectURL = URL.createObjectURL(file); coverPreview.src = coverObjectURL; markDirty(); editorStatus.textContent = '';
      } catch (e) { editorStatus.textContent = e.message; } finally { coverInput.value = ''; }
    };
    coverLabel.append(coverInput); editor.append(coverPreview, coverLabel);
    const uploadLabel = el('label', '', 'Add images and videos'), upload = el('input'); upload.type = 'file'; upload.multiple = true; upload.accept = 'image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime';
    upload.onchange = () => {
      try {
        const files = validateFiles([...upload.files], draft.length);
        draft.push(...files.map(({file, kind}) => ({id:crypto.randomUUID(), file, kind, name:file.name, url:URL.createObjectURL(file)})));
        if (files.length) markDirty(); renderItems(); editorStatus.textContent = '';
      } catch (e) { editorStatus.textContent = e.message; } finally { upload.value = ''; }
    };
    uploadLabel.append(upload); editor.append(uploadLabel, el('p', 'highlight-help', 'Uploads append to this highlight. Up to 100 items, 50 MB per file. MP4 is recommended for videos. Images play for 5 seconds; videos play to the end.'));
    itemsHost = el('ol', 'highlight-items'); editor.append(itemsHost);
    const actions = el('div', 'highlight-actions');
    saveButton = button('Save highlight', save, 'primary'); saveButton.disabled = true;
    actions.append(button('Preview edits', e => {
      const title = titleInput.value.trim() || active.title;
      if (!draft.length) { editorStatus.textContent = 'Add images or videos to preview this highlight.'; return; }
      player.open([{...active, title, cover_url:coverObjectURL || active.cover_url, media:draft}], 0, e.currentTarget);
    }), saveButton, button('Discard changes', () => { if (!dirty || confirm('Discard unsaved highlight changes?')) openEditorAfterDiscard(); }));
    editorStatus = el('p', 'highlight-editor-status'); editorStatus.setAttribute('role', 'status'); editorStatus.setAttribute('aria-live', 'polite'); editor.append(actions, editorStatus); renderItems();
  }
  function openEditorAfterDiscard() { const original = groups.find(group => group.id === active.id); resetDraft(); if (original) openEditor(original); }
  function renderItems(focusIndex, action) {
    itemsHost.replaceChildren();
    draft.forEach((item, index) => {
      const row = el('li', 'highlight-item'), thumb = el(item.kind === 'video' ? 'video' : 'img'); thumb.src = item.url;
      if (item.kind === 'video') { thumb.muted = true; thumb.playsInline = true; thumb.preload = 'metadata'; } else thumb.alt = '';
      const info = el('div', '', `${index + 1}. ${item.name || item.kind}`), controls = el('div', 'highlight-item-actions');
      row.append(thumb, info);
      for (const [text, delta] of [['↑', -1], ['↓', 1]]) {
        const b = button(text, () => { draft = moveItem(draft, index, index + delta); markDirty(); renderItems(index + delta, delta < 0 ? 0 : 1); });
        b.setAttribute('aria-label', `Move story ${index + 1} ${delta < 0 ? 'earlier' : 'later'}`); b.disabled = index + delta < 0 || index + delta >= draft.length; controls.append(b);
      }
      const remove = button('Remove', () => { if (item.file) URL.revokeObjectURL(item.url); draft.splice(index, 1); markDirty(); renderItems(Math.min(index, draft.length - 1), 2); }); remove.setAttribute('aria-label', `Remove story ${index + 1}`); controls.append(remove); row.append(controls); itemsHost.append(row);
    });
    if (!draft.length) itemsHost.append(el('li', 'highlight-help', 'No stories yet. Add images or videos above.'));
    if (focusIndex >= 0) itemsHost.children[focusIndex]?.querySelectorAll('button')[action]?.focus();
  }
  async function save() {
    if (busy || !active) return;
    const title = titleInput.value.trim();
    if (!title || title.length > 15) { editorStatus.textContent = 'Enter a highlight name of 1–15 characters.'; return; }
    busy = true; editor.setAttribute('aria-busy', 'true');
    // Freeze navigation and inputs while bytes and metadata are saved together.
    const disabledStates = [...module.querySelectorAll('button,input,select'), ...document.querySelectorAll('.portal-tabs button')].map(node => [node, node.disabled]);
    disabledStates.forEach(([node]) => { node.disabled = true; });
    const paths = [], uploadedItems = [], saveId = crypto.randomUUID(), target = {...active}; let metadataAttempted = false;
    try {
      await requireHighlightAdminSession(supabase, user);
      const uploadOne = async (file, id) => {
        const extension = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
        const path = `highlights/${target.client}/${target.id}/${saveId}/${id}.${extension}`;
        const result = await supabase.storage.from('social-media').upload(path, file, {upsert:false, contentType:file.type});
        if (result.error) throw result.error; paths.push(path);
        return {url:supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl, path};
      };
      for (let index = 0; index < draft.length; index++) {
        const item = draft[index]; editorStatus.textContent = `Saving story ${index + 1} of ${draft.length}…`;
        if (item.file) uploadedItems.push({id:item.id, kind:item.kind, name:item.name, ...await uploadOne(item.file, item.id)});
        else uploadedItems.push({...item});
      }
      const cover = coverFile ? await uploadOne(coverFile, 'cover') : {url:target.cover_url};
      metadataAttempted = true;
      const result = await supabase.from('story_highlights').update({title, media:uploadedItems, cover_url:cover.url, revision:target.revision + 1}).eq('id', target.id).eq('client', target.client).eq('revision', target.revision).select().maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        await requireHighlightAdminSession(supabase, user);
        throw new Error('This highlight changed since you opened it. Reload its saved version before applying your edits again.');
      }
      resetDraft(); await load(); openEditor(result.data, {saved:true}); editorStatus.textContent = 'Highlight saved. The client preview is updated.';
    } catch (e) {
      // An interrupted metadata response may already have committed. Keep uploaded
      // bytes on ambiguous responses so a successful save can never lose its media.
      if (!metadataAttempted && paths.length) await supabase.storage.from('social-media').remove(paths);
      if (e.code === 'HIGHLIGHT_AUTH') {
        editorStatus.textContent = `${e.message} Your edits are still here. `;
        const signIn = el('a', '', 'Open Admin sign-in'); signIn.href = '/admin/login/'; signIn.target = '_blank'; signIn.rel = 'noopener'; editorStatus.append(signIn);
      } else editorStatus.textContent = `Could not save: ${e.message || 'connection interrupted'}. Your edits are still here. If another Admin changed this highlight, discard changes and reload before saving again.`;
    } finally {
      busy = false; editor.removeAttribute('aria-busy'); disabledStates.forEach(([node, disabled]) => { if (node.isConnected) node.disabled = disabled; });
      if (dirty && saveButton) saveButton.disabled = false;
    }
  }
  mode.onchange = () => {
    if (busy) return;
    const stories = mode.value === 'highlights'; content.hidden = stories; host.hidden = !stories;
    if (stories) { content.querySelectorAll('video').forEach(video => video.pause()); if (!dirty) load(); }
    else player.close();
  };
  new MutationObserver(() => { if (module.hidden) player.close(); }).observe(module, {attributes:true, attributeFilter:['hidden']});
  renderProfile([]);
  return module;
}
