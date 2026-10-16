import {supabase,check,categories,signed,el,optimize,BUCKET} from './portfolio-data.js';
const status=document.querySelector('#adminStatus'),content=document.querySelector('#adminContent'),list=document.querySelector('#adminImages'),queue=document.querySelector('#queue'),retry=document.querySelector('#retryUploads');
let cats=[],images=[],jobs=[],uploading=false,dragId=null,mutating=false;
function notice(message,error=false){status.textContent=message;status.classList.toggle('error',error);}
function options(select,value='',allowEmpty=true){select.replaceChildren();if(allowEmpty)select.append(el('option',{value:''},'Uncategorised'));for(const c of cats)select.append(el('option',{value:c.id},c.name));select.value=value||'';}
async function refresh(){cats=await categories();images=[];for(let offset=0;;offset+=200){const page=check(await supabase.from('portfolio_images').select('*').order('sort_order').order('id').range(offset,offset+199));images.push(...page);if(page.length<200)break;}renderCategories();renderImages();}
function action(text,handler,attrs={}){const button=el('button',{type:'button',...attrs},text);button.onclick=async()=>{button.disabled=true;try{await handler();}catch(e){notice(e.message,true);}finally{button.disabled=false;}};return button;}
function renderCategories(){
  const upload=document.querySelector('#uploadCategory'),value=upload.value;options(upload,value);
  const host=document.querySelector('#categories');host.replaceChildren();
  cats.forEach(c=>{const row=el('div',{class:'category-row'}),input=el('input',{'aria-label':`Category ${c.name}`,maxlength:'80',value:c.name});
    row.append(input,action('Rename',async()=>{const name=input.value.trim();if(!name)throw new Error('Enter a category name.');check(await supabase.from('portfolio_categories').update({name}).eq('id',c.id).select().single());await refresh();notice('Category renamed.');}),action('Remove',async()=>{if(!confirm(`Remove ${c.name}? Its photographs will remain in All, without a category.`))return;check(await supabase.from('portfolio_categories').delete().eq('id',c.id).select().single());await refresh();notice('Category removed.');}));host.append(row);});
}
function label(text,input){const node=el('label',{},text);node.append(input);return node;}
async function reorder(id,target){
  if(mutating)return;mutating=true;
  try{const ordered=images.map(i=>i.id),from=ordered.indexOf(id),to=ordered.indexOf(target);if(from===to||from<0||to<0)return;ordered.splice(from,1);ordered.splice(to,0,id);check(await supabase.rpc('reorder_portfolio',{ordered_ids:ordered}));await refresh();notice('Order saved.');}finally{mutating=false;}
}
function renderImages(){
  const filter=document.querySelector('#adminFilter').value;list.replaceChildren();const visible=images.filter(i=>filter==='all'||i.published===(filter==='published'));
  if(!visible.length){list.append(el('p',{class:'empty'},images.length?'No photographs in this view.':'Your portfolio starts here. Add your first photographs above.'));return;}
  visible.forEach(image=>{
    const card=el('form',{class:'edit-card','data-id':image.id});const preview=el('img',{alt:image.alt_text||image.title||'Upload preview',loading:'lazy'});signed(image.thumbnail_path).then(url=>preview.src=url).catch(()=>{});
    const fields=el('div',{class:'edit-fields'}),title=el('input',{value:image.title||'',maxlength:'200'}),alt=el('input',{value:image.alt_text||'',maxlength:'1000'}),category=el('select');options(category,image.category_id);const published=el('input',{type:'checkbox'});published.checked=image.published;
    const actions=el('div',{class:'edit-actions'}),save=el('button',{type:'submit',class:'primary'},'Save changes');const index=images.indexOf(image);
    const handle=el('button', {draggable:'true','aria-label':`Drag to reorder ${image.title||'photograph'}`},'↕ Reorder');handle.type='button';handle.addEventListener('dragstart',event=>{dragId=image.id;event.dataTransfer.setData('text/plain',image.id);event.dataTransfer.effectAllowed='move';});handle.addEventListener('dragend',()=>dragId=null);
    card.addEventListener('dragover',e=>{if(dragId)e.preventDefault();});card.addEventListener('drop',async e=>{e.preventDefault();if(!dragId)return;try{await reorder(dragId,image.id);}catch(error){notice(error.message,true);}dragId=null;});
    const earlier=action('Earlier',()=>reorder(image.id,images[index-1]?.id));earlier.disabled=index===0;const later=action('Later',()=>reorder(image.id,images[index+1]?.id));later.disabled=index===images.length-1;
    actions.append(label('Published',published),save,handle,earlier,later,action('Delete',async()=>{if(!confirm('Permanently delete this photograph and its image files?'))return;check(await supabase.from('portfolio_images').delete().eq('id',image.id).select().single());const result=await supabase.storage.from(BUCKET).remove([image.storage_path,image.thumbnail_path]);await refresh();notice(result.error?'Photograph removed. Storage cleanup failed; contact the site administrator.':'Photograph deleted.',!!result.error);}));
    fields.append(label('Title',title),label('Alt text — describe the photograph',alt),label('Category',category),el('span',{class:'metadata'},`${image.width} × ${image.height} pixels · ${image.published?'Published':'Hidden'}`),actions);card.append(preview,fields);
    card.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{if(published.checked&&!alt.value.trim())throw new Error('Add descriptive alt text before publishing.');const saved=check(await supabase.from('portfolio_images').update({title:title.value.trim(),alt_text:alt.value.trim(),category_id:category.value||null,published:published.checked}).eq('id',image.id).eq('updated_at',image.updated_at).select().single());Object.assign(image,saved);fields.querySelector('.metadata').textContent=`${image.width} × ${image.height} pixels · ${image.published?'Published':'Hidden'}`;notice('Photograph saved.');}catch(error){notice(error.message.includes('0 rows')?'This photograph changed elsewhere. Refresh before editing again.':error.message,true);}finally{save.disabled=false;}};list.append(card);
  });
}
function addFiles(files){const category=document.querySelector('#uploadCategory').value||null;for(const file of files){const row=el('li',{},`${file.name} — queued`);queue.append(row);jobs.push({file,category,row,state:'queued'});}document.querySelector('#files').value='';processQueue();}
async function processQueue(){
  if(uploading)return;uploading=true;retry.hidden=true;
  try{for(const job of jobs){if(job.state!=='queued')continue;job.state='uploading';job.row.textContent=`${job.file.name} — preparing…`;const id=crypto.randomUUID(),paths=[`${id}/full.webp`,`${id}/preview.webp`];let uploaded=[];
    try{const result=await optimize(job.file);job.row.textContent=`${job.file.name} — uploading…`;
      for(const [index,blob] of [result.full,result.thumb].entries()){check(await supabase.storage.from(BUCKET).upload(paths[index],blob,{contentType:'image/webp',upsert:false,cacheControl:'600'}));uploaded.push(paths[index]);}
      const nextOrder=images.reduce((max,i)=>Math.max(max,i.sort_order),-1)+1;
      const saved=check(await supabase.from('portfolio_images').insert({id,storage_path:paths[0],thumbnail_path:paths[1],width:result.width,height:result.height,title:job.file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' '),alt_text:'',category_id:job.category,sort_order:nextOrder,published:false}).select().single());images.push(saved);job.state='done';job.row.textContent=`${job.file.name} — uploaded, hidden`;
    }catch(error){job.state='error';let cleanupError=null;if(uploaded.length){try{cleanupError=(await supabase.storage.from(BUCKET).remove(uploaded)).error;}catch(e){cleanupError=e;}}job.row.textContent=`${job.file.name} — ${error.message}${cleanupError?' (storage cleanup also failed)':''}`;}job.row.dataset.state=job.state;
  }await refresh();const failed=jobs.filter(j=>j.state==='error').length;notice(failed?`${failed} upload(s) failed. Successful uploads are saved as hidden. Retry failed uploads below.`:'Uploads saved as hidden. Add alt text and publish when ready.',!!failed);
  }catch(error){notice(error.message,true);}finally{uploading=false;retry.hidden=!jobs.some(j=>j.state==='error');}
}
retry.onclick=()=>{jobs.filter(j=>j.state==='error').forEach(j=>j.state='queued');processQueue();};
const zone=document.querySelector('#dropzone');zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragover');});zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragover');addFiles(e.dataTransfer.files);});document.querySelector('#files').onchange=e=>addFiles(e.target.files);document.querySelector('#adminFilter').onchange=renderImages;
document.querySelector('#addCategory').onsubmit=async e=>{e.preventDefault();const input=document.querySelector('#categoryName'),button=e.currentTarget.querySelector('button');button.disabled=true;try{const name=input.value.trim();if(!name)throw new Error('Enter a category name.');check(await supabase.from('portfolio_categories').insert({name,sort_order:cats.reduce((max,c)=>Math.max(max,c.sort_order),-1)+1}));input.value='';await refresh();notice('Category added.');}catch(error){notice(error.message,true);}finally{button.disabled=false;}};
document.querySelector('#signOut').onclick=async()=>{try{check(await supabase.auth.signOut());location.href='/admin/login/?next=portfolio';}catch(error){notice(error.message,true);}};
window.addEventListener('beforeunload',e=>{if(uploading){e.preventDefault();e.returnValue='';}});
try{const {data,error}=await supabase.auth.getUser();if(error||!data.user){location.replace('/admin/login/?next=portfolio');}else if(data.user.app_metadata?.role!=='admin'){notice('This page is available to the portfolio administrator only.',true);}else{await supabase.auth.refreshSession();await refresh();content.hidden=false;notice('Your changes are saved to your portfolio. Uploads begin hidden.');}}catch(error){notice(`Could not open the studio: ${error.message}`,true);}
