export const IMAGE_MS = 5000;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_ITEMS = 100;
export function mediaKind(file) {
  if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) return 'image';
  if (/^video\/(mp4|webm|quicktime)$/.test(file.type)) return 'video';
  throw new Error('Use JPG, PNG, WebP, GIF, AVIF, MP4, WebM or MOV files.');
}
export function validateFiles(files, existing = 0) {
  if (files.length + existing > MAX_ITEMS) throw new Error(`A highlight can contain up to ${MAX_ITEMS} items.`);
  return files.map(file => {
    const kind = mediaKind(file);
    if (!file.size || file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: choose a file under 50 MB.`);
    return {file, kind};
  });
}
export function moveItem(items, from, to) {
  const next = [...items];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
export function adjacent(groups, group, item, direction) {
  if (direction < 0 && item > 0) return {group, item:item - 1};
  if (direction > 0 && item + 1 < groups[group].media.length) return {group, item:item + 1};
  for (let g = group + direction; g >= 0 && g < groups.length; g += direction) {
    if (groups[g].media.length) return {group:g, item:direction > 0 ? 0 : groups[g].media.length - 1};
  }
  return null;
}
