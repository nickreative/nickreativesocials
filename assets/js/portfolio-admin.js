import {supabase,check,categories,signed,el,optimize,BUCKET} from './portfolio-data.js';
import {PortfolioDraft} from './portfolio-draft.js';

const status=document.querySelector('#adminStatus'),content=document.querySelector('#adminContent');
const list=document.querySelector('#adminImages'),queue=document.querySelector('#queue'),retry=document.querySelector('#retryUploads');
const saveAll=document.querySelector('#saveAll'),saveStatus=document.querySelector('#saveStatus'),editor=document.querySelector('#photoEditor');
const model=new PortfolioDraft();
let cats=[],jobs=[],uploading=false,saving=false,dragId=null,selectedId=null;
function notice(message,error=false){status.textContent=message;status.classList.toggle('error',error);}
function updateSave(){
  const count=model.edits.size;
  saveStatus.textContent=saving?'Saving changes…':model.dirty?`${count?`${count} photograph${count===1?'':'s'} edited`:''}${count&&model.orderDirty?' · ':''}${model.orderDirty?'Order changed':''} — unsaved`:'All changes saved';
  saveAll.disabled=!model.dirty||saving||uploading;
  document.querySelector('#photoCount').textContent=`${model.order.length} photographs`;
}
function options(select,value=''){
  select.replaceChildren(el('option',{value:''},'Uncategorised'));
  for(const c of cats)select.append(el('option',{value:c.id},c.name));
  select.value=value||'';
}
async function fetchImages(){
  const rows=[];
  for(let offset=0;;offset+=200){
    const page=check(await supabase.from('portfolio_images').select('*').order('sort_order').order('id').range(offset,offset+199));
    rows.push(...page);if(page.length<200)return rows;
  }
}
async function refresh(){
  cats=await categories();model.merge(await fetchImages());
  renderCategories();renderImages();renderEditor();updateSave();
}
function action(text,handler,attrs={}){
  const button=el('button',{type:'button',...attrs},text);
  button.onclick=async()=>{button.disabled=true;try{await handler();}catch(error){notice(error.message,true);}finally{button.disabled=false;}};
  return button;
}
function renderCategories(){
  const upload=document.querySelector('#uploadCategory'),value=upload.value;options(upload,value);
  const categoryFilter=document.querySelector('#categoryFilter'),filterValue=categoryFilter.value;options(categoryFilter,filterValue);categoryFilter.options[0].textContent='All categories';
  const host=document.querySelector('#categories');host.replaceChildren();
  for(const c of cats){
    const row=el('div',{class:'category-row'}),input=el('input',{'aria-label':`Category ${c.name}`,maxlength:'80',value:c.name});
    row.append(input,action('Rename',async()=>{
      const name=input.value.trim();if(!name)throw new Error('Enter a category name.');
      check(await supabase.from('portfolio_categories').update({name}).eq('id',c.id).select().single());
      await refresh();notice('Category renamed. Unsaved photograph edits are kept.');
    }),action('Remove',async()=>{
      if(!confirm(`Remove ${c.name}? Its photographs will remain in All, without a category.`))return;
      check(await supabase.from('portfolio_categories').delete().eq('id',c.id).select().single());
      // Keep pending edits valid when their selected category is removed.
      for(const [id,patch] of model.edits)if(patch.category_id===c.id)model.edit(id,{category_id:null});
      await refresh();notice('Category removed. Unsaved photograph edits are kept.');
    }));host.append(row);
  }
}
function label(text,input){const node=el('label',{},text);input.setAttribute('aria-label',text);node.append(input);return node;}
function move(id,target){model.move(id,target);renderImages();renderEditor();updateSave();}
function visibleImages(){
  const state=document.querySelector('#adminFilter').value;
  const category=document.querySelector('#categoryFilter').value;
  return model.rows.filter(image=>(state==='all'||image.published===(state==='published'))&&(!category||image.category_id===category));
}
function renderImages(){
  list.replaceChildren();
  const visible=visibleImages();
  if(!visible.length)list.append(el('p',{class:'empty'},model.order.length?'No photographs in this view.':'Your portfolio starts here. Add photographs above.'));
  visible.forEach(image=>{
    const tile=el('button',{type:'button',class:'photo-tile','data-id':image.id,draggable:'true','aria-pressed':String(selectedId===image.id),'aria-label':`Edit ${image.title||image.alt_text||'photograph'}`});
    const stage=el('span',{class:'tile-stage'}),preview=el('img',{alt:image.alt_text||'',loading:'lazy',draggable:'false'});
    signed(image.thumbnail_path).then(url=>preview.src=url).catch(()=>{});stage.append(preview);
    const caption=el('span',{class:'tile-caption'});
    caption.append(el('span',{class:'tile-name'},image.title||cats.find(c=>c.id===image.category_id)?.name||'Uncategorised'),el('span',{class:'tile-state'},image.published?'Published':'Hidden'));
    tile.classList.toggle('is-dirty',model.edits.has(image.id));
    tile.append(stage,caption);tile.onclick=()=>{selectedId=image.id;for(const node of list.children)node.setAttribute('aria-pressed',String(node===tile));renderEditor();if(matchMedia('(max-width:650px)').matches)editor.scrollIntoView({behavior:'smooth',block:'start'});};
    tile.addEventListener('dragstart',event=>{
      dragId=image.id;tile.classList.add('is-dragging');event.dataTransfer.setData('text/plain',image.id);event.dataTransfer.effectAllowed='move';
    });
    tile.addEventListener('dragend',()=>{dragId=null;list.querySelectorAll('.drop-target,.is-dragging').forEach(node=>node.classList.remove('drop-target','is-dragging'));});
    tile.addEventListener('dragover',event=>{if(dragId&&dragId!==image.id){event.preventDefault();event.dataTransfer.dropEffect='move';tile.classList.add('drop-target');}});
    tile.addEventListener('dragleave',()=>tile.classList.remove('drop-target'));
    tile.addEventListener('drop',event=>{event.preventDefault();if(dragId)move(dragId,image.id);dragId=null;});
    list.append(tile);
  });
}
function renderEditor(){
  editor.replaceChildren();
  if(!selectedId||!model.base.has(selectedId)){editor.append(el('h2',{},'Photograph details'),el('p',{class:'hint'},'Select a photograph to edit its details. Drag thumbnails to arrange your portfolio.'));return;}
  const image=model.row(selectedId),id=image.id;
  const preview=el('img',{class:'editor-preview',alt:image.alt_text||''});signed(image.thumbnail_path).then(url=>preview.src=url).catch(()=>{});
  const title=el('input',{value:image.title||'',maxlength:'200'}),alt=el('textarea',{rows:'4',maxlength:'1000'}),category=el('select'),published=el('input',{type:'checkbox'});
  alt.value=image.alt_text||'';options(category,image.category_id);published.checked=image.published;
  const edit=(patch)=>{
    model.edit(id,patch);updateSave();
    const tile=[...list.children].find(node=>node.dataset.id===id);
    if(tile){const current=model.row(id);tile.classList.toggle('is-dirty',model.edits.has(id));tile.querySelector('.tile-name').textContent=current.title||cats.find(c=>c.id===current.category_id)?.name||'Uncategorised';tile.querySelector('.tile-state').textContent=current.published?'Published':'Hidden';}
  };
  title.oninput=()=>edit({title:title.value});alt.oninput=()=>edit({alt_text:alt.value});category.onchange=()=>edit({category_id:category.value||null});published.onchange=()=>edit({published:published.checked});
  const fields=el('div',{class:'detail-fields'}),actions=el('div',{class:'toolbar'});
  fields.append(label('Title',title),label('Alt text — describe the photograph',alt),label('Category',category),label('Published',published),el('span',{class:'metadata'},`${image.width} × ${image.height} pixels`));
  const visible=visibleImages(),index=visible.findIndex(row=>row.id===id);
  const earlier=action('← Earlier',()=>move(id,visible[index-1]?.id)),later=action('Later →',()=>move(id,visible[index+1]?.id));
  earlier.disabled=index<=0;later.disabled=index<0||index===visible.length-1;
  actions.append(earlier,later);
  const remove=action('Delete photograph',async()=>{
    if(!confirm('Permanently delete this photograph and its files now? Unsaved edits to other photographs will be kept.'))return;
    check(await supabase.from('portfolio_images').delete().eq('id',id).eq('updated_at',model.base.get(id).updated_at).select().single());
    model.remove(id);selectedId=null;
    const result=await supabase.storage.from(BUCKET).remove([image.storage_path,image.thumbnail_path]);
    await refresh();notice(result.error?'Photograph removed. Storage cleanup failed. Other drafts are kept.':'Photograph deleted. Other drafts are kept.',!!result.error);
  },{class:'delete-photo'});
  editor.append(el('h2',{},'Photograph details'),preview,fields,el('p',{class:'hint'},'Use Save changes below to save photograph details and arrangement.'),actions,remove);
}
async function saveChanges(){
  if(saving||uploading||!model.dirty)return;
  // Validate the entire draft before writing any image.
  for(const [id] of model.edits){const image=model.row(id);if(image.published&&!image.alt_text.trim()){selectedId=id;renderImages();renderEditor();notice('Add descriptive alt text to each published photograph before saving.',true);return;}}
  saving=true;content.inert=true;updateSave();const errors=[];
  try{
    for(const [id,patch] of [...model.edits]){
      try{
        const values={...patch};for(const key of ['title','alt_text'])if(key in values)values[key]=values[key].trim();
        const result=await supabase.from('portfolio_images').update(values).eq('id',id).eq('updated_at',model.base.get(id).updated_at).select().single();
        if(result.error||!result.data)throw new Error(result.error?.code==='PGRST116'?'This photograph changed elsewhere. Your draft is kept; copy its text before reloading.':result.error?.message||'Could not save photograph.');
        model.accept(result.data);
      }catch(error){errors.push(error.message);}
    }
    if(model.orderDirty&&!errors.length){
      try{check(await supabase.rpc('reorder_portfolio',{ordered_ids:[...model.order]}));
        // Reordering updates timestamps. Refresh baselines for successful rows,
        // retaining original versions and drafts for any failed metadata saves.
        model.acceptOrder(await fetchImages());
      }catch(error){errors.push(error.message);}
    }
    renderImages();renderEditor();
    notice(errors.length?`Some changes could not be saved. ${model.edits.size} photograph draft(s)${model.orderDirty?' and the arrangement':''} kept for retry.\n${[...new Set(errors)].join('\n')}`:'All photograph details and arrangement saved.',errors.length>0);
  }finally{saving=false;content.inert=false;updateSave();}
}
saveAll.onclick=saveChanges;
function addFiles(files){
  const category=document.querySelector('#uploadCategory').value||null;
  for(const file of files){const row=el('li',{},`${file.name} — queued`);queue.append(row);jobs.push({file,category,row,state:'queued'});}
  document.querySelector('#files').value='';processQueue();
}
async function processQueue(){
  if(uploading)return;uploading=true;retry.hidden=true;updateSave();
  try{
    for(const job of jobs){
      if(job.state!=='queued')continue;job.state='uploading';job.row.textContent=`${job.file.name} — preparing…`;
      const id=crypto.randomUUID(),paths=[`${id}/full.webp`,`${id}/preview.webp`];const uploaded=[];
      try{
        const result=await optimize(job.file);job.row.textContent=`${job.file.name} — uploading…`;
        for(const [index,blob] of [result.full,result.thumb].entries()){check(await supabase.storage.from(BUCKET).upload(paths[index],blob,{contentType:'image/webp',upsert:false,cacheControl:'600'}));uploaded.push(paths[index]);}
        const nextOrder=model.rows.reduce((max,image)=>Math.max(max,image.sort_order),-1)+1;
        const saved=check(await supabase.from('portfolio_images').insert({id,storage_path:paths[0],thumbnail_path:paths[1],width:result.width,height:result.height,title:job.file.name.replace(/\.[^.]+$/,'').replace(/[_-]/g,' '),alt_text:'',category_id:job.category,sort_order:nextOrder,published:false}).select().single());
        model.merge([...model.base.values(),saved]);
        job.state='done';job.row.textContent=`${job.file.name} — uploaded, hidden`;
      }catch(error){job.state='error';let cleanupError=null;if(uploaded.length){try{cleanupError=(await supabase.storage.from(BUCKET).remove(uploaded)).error;}catch(e){cleanupError=e;}}job.row.textContent=`${job.file.name} — ${error.message}${cleanupError?' (storage cleanup also failed)':''}`;}
      job.row.dataset.state=job.state;
    }
    await refresh();const failed=jobs.filter(job=>job.state==='error').length;
    notice(failed?`${failed} upload(s) failed. Retry them below. Existing drafts are kept.`:'Uploads saved as hidden. Existing photograph drafts are kept.',!!failed);
  }catch(error){notice(error.message,true);}finally{uploading=false;retry.hidden=!jobs.some(job=>job.state==='error');updateSave();}
}
retry.onclick=()=>{jobs.filter(job=>job.state==='error').forEach(job=>job.state='queued');processQueue();};
const zone=document.querySelector('#dropzone');
zone.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();zone.classList.add('dragover');}});
zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));
zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('dragover');if(event.dataTransfer.files.length)addFiles(event.dataTransfer.files);});
document.querySelector('#files').onchange=event=>addFiles(event.target.files);
document.querySelector('#adminFilter').onchange=()=>{renderImages();renderEditor();};
document.querySelector('#categoryFilter').onchange=()=>{renderImages();renderEditor();};
document.querySelector('#addCategory').onsubmit=async event=>{
  event.preventDefault();const input=document.querySelector('#categoryName'),button=event.currentTarget.querySelector('button');button.disabled=true;
  try{const name=input.value.trim();if(!name)throw new Error('Enter a category name.');check(await supabase.from('portfolio_categories').insert({name,sort_order:cats.reduce((max,c)=>Math.max(max,c.sort_order),-1)+1}));input.value='';await refresh();notice('Category added. Unsaved photograph edits are kept.');}catch(error){notice(error.message,true);}finally{button.disabled=false;}
};
document.querySelector('#signOut').onclick=async()=>{
  if(model.dirty&&!confirm('You have unsaved photograph changes. Sign out and discard them?'))return;
  try{check(await supabase.auth.signOut());location.href='/admin/login/?next=portfolio';}catch(error){notice(error.message,true);}
};
window.addEventListener('beforeunload',event=>{if(uploading||saving||model.dirty){event.preventDefault();event.returnValue='';}});
try{
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user)location.replace('/admin/login/?next=portfolio');
  else if(data.user.app_metadata?.role!=='admin')notice('This page is available to the portfolio administrator only.',true);
  else{await supabase.auth.refreshSession();await refresh();content.hidden=false;notice('Select a photograph to edit. Save all your changes together.');}
}catch(error){notice(`Could not open the studio: ${error.message}`,true);}
