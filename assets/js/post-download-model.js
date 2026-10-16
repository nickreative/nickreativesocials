// Original media bytes are kept intact; numbered names preserve carousel order.
export const MAX_BUNDLE_BYTES = 250 * 1024 * 1024;
const mimeExtensions = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic','image/avif':'avif','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','video/x-m4v':'m4v'};
export function downloadStem(client, slot, version) {
  const safe = String(client || 'post').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80);
  return `${safe}-post-${String(slot || 0).padStart(3, '0')}-${version}`;
}
export function mediaFilename(stem, index, source, mime = '') {
  const path = String(source).split(/[?#]/)[0];
  const extension = path.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  const safeExtension = /^(jpe?g|png|webp|gif|heic|heif|avif|mp4|mov|webm|m4v|avi|mkv|ogv)$/i.test(extension || '') ? extension : mimeExtensions[mime.split(';')[0]] || 'bin';
  return `${stem}-${String(index + 1).padStart(2, '0')}.${safeExtension}`;
}

// ZIP STORE (no recompression). Stream CRC calculation avoids copying large videos.
const crcTable = Array.from({length:256}, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
async function crc32(blob, signal) {
  let crc = 0xffffffff;
  const reader = blob.stream().getReader();
  try {
    while (true) {
      signal?.throwIfAborted();
      const {done, value} = await reader.read();
      if (done) break;
      for (const byte of value) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  return {bytes, u16:(offset,value)=>view.setUint16(offset,value,true), u32:(offset,value)=>view.setUint32(offset,value,true)};
}
export async function postZip(files, signal) {
  if (files.length > 65535 || files.reduce((n,f)=>n+f.size,0) > MAX_BUNDLE_BYTES) throw new Error('This post is too large for a ZIP on this device. Download the files individually instead.');
  const parts = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const file of files) {
    signal?.throwIfAborted();
    const name = new TextEncoder().encode(file.name), crc = await crc32(file, signal);
    if (name.length > 65535) throw new Error('The file name is too long.');
    const local = header(30);
    local.u32(0,0x04034b50); local.u16(4,20); local.u16(6,0x800); local.u16(12,33);
    local.u32(14,crc); local.u32(18,file.size); local.u32(22,file.size); local.u16(26,name.length);
    parts.push(local.bytes,name,file);
    const central = header(46);
    central.u32(0,0x02014b50); central.u16(4,20); central.u16(6,20); central.u16(8,0x800); central.u16(14,33);
    central.u32(16,crc); central.u32(20,file.size); central.u32(24,file.size); central.u16(28,name.length); central.u32(42,offset);
    directory.push(central.bytes,name); directorySize += 46 + name.length; offset += 30 + name.length + file.size;
  }
  const end = header(22);
  end.u32(0,0x06054b50); end.u16(8,files.length); end.u16(10,files.length); end.u32(12,directorySize); end.u32(16,offset);
  return new Blob([...parts,...directory,end.bytes], {type:'application/zip'});
}
