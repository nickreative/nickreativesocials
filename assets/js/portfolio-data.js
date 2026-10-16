import { supabase } from './portfolio-client.js';
export { supabase };
export const BUCKET = 'portfolio';
export function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
export async function categories() {
  const rows=[]; for(let offset=0;;offset+=200){const page=check(await supabase.from('portfolio_categories').select('*').order('sort_order').order('id').range(offset,offset+199));rows.push(...page);if(page.length<200)return rows;}
}
const signedCache=new Map();
export async function signed(path) {
  const cached=signedCache.get(path);if(cached&&cached.expires>Date.now())return cached.url;
  const url=check(await supabase.storage.from(BUCKET).createSignedUrl(path,600)).signedUrl;
  signedCache.set(path,{url,expires:Date.now()+540000});return url;
}
export function el(tag, attrs={}, text='') {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
  node.textContent=text;return node;
}
export async function optimize(file) {
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type)) throw new Error('Use JPEG, PNG, WebP or AVIF images.');
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try {
    const make=async(max)=>{const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!blob)throw new Error('Could not prepare image.');return blob;};
    return {width:bitmap.width,height:bitmap.height,full:await make(3200),thumb:await make(1000)};
  } finally { bitmap.close(); }
}
