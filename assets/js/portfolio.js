import {supabase,check,categories,signed,el} from './portfolio-data.js';
const gallery=document.querySelector('#gallery'),status=document.querySelector('#galleryStatus'),more=document.querySelector('#loadMore'),filters=document.querySelector('#filters'),dialog=document.querySelector('#lightbox'),large=document.querySelector('#lightboxImage');
let items=[],selected='',offset=0,busy=false,hasMore=true,generation=0,current=0,opener=null,lightboxRequest=0;
document.querySelector('#year').textContent=new Date().getFullYear();
function layout(){
  const count=matchMedia('(max-width:650px)').matches?1:2;
  const columns=Array.from({length:count},()=>el('div',{class:'masonry-column'}));const heights=Array(count).fill(0);
  for(const item of items){const col=heights.indexOf(Math.min(...heights));const button=el('button',{class:'photo','aria-label':`View ${item.title||item.alt_text||'photograph'}`});const img=el('img',{alt:item.alt_text||'',width:item.width,height:item.height,loading:'lazy',decoding:'async'});img.style.aspectRatio=`${item.width} / ${item.height}`;
    button.append(img);button.onclick=()=>openImage(items.indexOf(item),button);columns[col].append(button);heights[col]+=item.height/item.width;
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();signed(item.thumbnail_path).then(url=>img.src=url).catch(()=>{img.alt='Photograph could not load';});}},{rootMargin:'400px'});observer.observe(img);
  }gallery.replaceChildren(...columns);
}
let width=window.innerWidth;window.addEventListener('resize',()=>{if((width<=650)!==(innerWidth<=650))layout();width=innerWidth;});
async function load(reset=false){
  if(busy&&!reset)return;if(reset){generation++;items=[];offset=0;hasMore=true;layout();}const request=generation;busy=true;more.disabled=true;status.hidden=false;status.textContent='Loading photographs…';
  try{let query=supabase.from('portfolio_images').select('*').eq('published',true).order('sort_order').order('id').range(offset,offset+23);if(selected)query=query.eq('category_id',selected);const page=check(await query);if(request!==generation)return;items.push(...page);offset+=page.length;hasMore=page.length===24;layout();status.textContent=items.length?'':'New photographs are on their way. Get in touch to discuss a project.';status.hidden=items.length>0;}
  catch(error){if(request===generation){status.hidden=false;status.textContent='The portfolio could not load. Please try again.';more.textContent='Try again';hasMore=true;}}
  finally{if(request===generation){busy=false;more.disabled=false;more.hidden=!hasMore;}}
}
more.onclick=()=>load();
function filterButton(id,name){const button=el('button',{'aria-pressed':String(id===selected)},name);button.onclick=()=>{selected=id;for(const b of filters.children)b.setAttribute('aria-pressed',String(b===button));more.textContent='More photographs ↓';load(true);};filters.append(button);}
async function openImage(index,button){current=(index+items.length)%items.length;if(button)opener=button;const item=items[current],request=++lightboxRequest;large.removeAttribute('src');large.alt=item.alt_text||'';document.querySelector('#lightboxCaption').textContent=item.title||'';document.querySelector('#imageCounter').textContent=`${current+1} / ${items.length}${hasMore?' loaded':''}`;if(!dialog.open)dialog.showModal();try{const url=await signed(item.storage_path);if(request===lightboxRequest)large.src=url;}catch{if(request===lightboxRequest)document.querySelector('#lightboxCaption').textContent='Could not load photograph. Please try again.';}}
document.querySelector('#closeLightbox').onclick=()=>dialog.close();document.querySelector('#previousImage').onclick=()=>openImage(current-1);document.querySelector('#nextImage').onclick=()=>openImage(current+1);dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();openImage(current-1);}if(e.key==='ArrowRight'){e.preventDefault();openImage(current+1);}});dialog.addEventListener('close',()=>{lightboxRequest++;large.removeAttribute('src');opener?.focus();});let touchStart=0;dialog.addEventListener('touchstart',e=>touchStart=e.changedTouches[0].clientX,{passive:true});dialog.addEventListener('touchend',e=>{const delta=e.changedTouches[0].clientX-touchStart;if(Math.abs(delta)>60)openImage(current+(delta<0?1:-1));},{passive:true});
try{filterButton('','All');for(const category of await categories())filterButton(category.id,category.name);await load();}catch{status.textContent='The portfolio could not load. Please refresh to try again.';}
