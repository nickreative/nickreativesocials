import { localDate, monthCells, canEditIdea } from './calendar-model.js';
import {dateHeading, defaultDateHeading} from './calendar-seasons.js';

export function createPortalCalendar({supabase,user,content,client,clientLabel,clientSelect}) {
  const admin=user.app_metadata?.role==='admin';
  const tabbar=document.createElement('nav');tabbar.className='portal-tabs';tabbar.setAttribute('role','tablist');tabbar.setAttribute('aria-label','Portal sections');
  const contentTab=document.createElement('button'),calendarTab=document.createElement('button');
  contentTab.textContent='Content';calendarTab.textContent='Calendar';
  [contentTab,calendarTab].forEach((b,i)=>{b.type='button';b.id=`portal-tab-${i}`;b.setAttribute('role','tab');tabbar.append(b);});
  const host=document.createElement('section');host.className='calendar-panel';host.id='calendar-panel';host.setAttribute('role','tabpanel');host.setAttribute('aria-labelledby',calendarTab.id);host.hidden=true;
  content.id ||= 'content-panel';content.setAttribute('role','tabpanel');content.setAttribute('aria-labelledby',contentTab.id);
  contentTab.setAttribute('aria-controls',content.id);calendarTab.setAttribute('aria-controls',host.id);
  content.before(tabbar);content.after(host);
  host.innerHTML=`<div class="calendar-toolbar"><div><h2 class="calendar-month-label"></h2><p class="calendar-client-label"></p></div><div class="calendar-controls"><div class="calendar-client" hidden></div><button type="button" data-action="previous" aria-label="Previous month">←</button><button type="button" data-action="today">Today</button><button type="button" data-action="next" aria-label="Next month">→</button><button type="button" class="primary" data-action="add">Add idea</button></div></div><p class="calendar-message" role="status" aria-live="polite"></p><div class="calendar-weekdays" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="calendar-month" aria-label="Content planning calendar"></div><p class="calendar-legend">Select a date to add an idea, or select an idea to see its notes. Dates are plans for content; they do not schedule automatic publishing.</p>`;
  const dialog=document.createElement('dialog');dialog.className='idea-dialog';dialog.setAttribute('aria-labelledby','idea-dialog-title');
  dialog.innerHTML=`<form><h2 id="idea-dialog-title">Post idea</h2><label>Date<input name="date" type="date" required></label><label>Post idea<input name="description" required maxlength="300" placeholder="Approximate description of post"></label><label>Notes<textarea name="notes" maxlength="5000" placeholder="Include any information such as waiting on assets, or pending launch dates."></textarea></label><p class="idea-credit"></p><label class="idea-notify"><input name="notify" type="checkbox">Notify the client by email</label><p class="idea-notification-note"></p><p class="idea-error" role="status" aria-live="polite"></p><div class="idea-actions"><button class="idea-archive" type="button">Remove idea</button><button class="idea-cancel" type="button">Cancel</button><button class="primary idea-save" type="submit">Save idea</button></div></form>`;
  document.body.append(dialog);
  const form=dialog.querySelector('form'),fields=form.elements,credit=dialog.querySelector('.idea-credit'),error=dialog.querySelector('.idea-error'),save=dialog.querySelector('.idea-save'),archive=dialog.querySelector('.idea-archive');
  const message=host.querySelector('.calendar-message'),grid=host.querySelector('.calendar-month');
  let selectedClient=client,view=new Date(),ideas=[],headings=[],request=0,activeIdea=null,newId=null,opener=null,busy=false;
  const calendarClient=admin?document.createElement('select'):null;
  if(admin){
    const label=document.createElement('label');label.append('Client ');
    for(const option of clientSelect.options){const o=option.cloneNode(true);if(o.value==='belmogroup')o.value='belmo';calendarClient.append(o);}
    calendarClient.value=selectedClient==='belmogroup'?'belmo':selectedClient;selectedClient=calendarClient.value;
    const linkedClient=new URLSearchParams(location.search).get('calendar_client');if(linkedClient&&[...calendarClient.options].some(o=>o.value===linkedClient)){calendarClient.value=linkedClient;selectedClient=linkedClient;}
    calendarClient.setAttribute('aria-label','Calendar client');label.append(calendarClient);host.querySelector('.calendar-client').append(label);host.querySelector('.calendar-client').hidden=false;
    calendarClient.onchange=()=>{selectedClient=calendarClient.value;const value=selectedClient==='belmo'?'belmogroup':selectedClient;if(clientSelect.value!==value){clientSelect.value=value;clientSelect.dispatchEvent(new Event('change'));}else load();};
    clientSelect.addEventListener('change',()=>{calendarClient.value=clientSelect.value==='belmogroup'?'belmo':clientSelect.value;selectedClient=calendarClient.value;load();});
  }
  const headingDialog=document.createElement('dialog');headingDialog.className='idea-dialog';headingDialog.setAttribute('aria-labelledby','date-heading-title');
  headingDialog.innerHTML=`<form><h2 id="date-heading-title">Date heading</h2><label>Date<input name="date" type="date" required></label><label>Heading<input name="heading" maxlength="160" placeholder="Christmas Day"></label><p class="idea-notification-note">This heading is visible to the client beside the date number. Leave it blank to hide the heading for this date. Saving it does not send an email.</p><p class="idea-error" role="status"></p><div class="idea-actions"><button type="button" data-action="default">Use seasonal default</button><button type="button" data-action="cancel">Cancel</button><button type="submit" class="primary">Save heading</button></div></form>`;
  if(admin){document.body.append(headingDialog);const addHeading=document.createElement('button');addHeading.type='button';addHeading.textContent='Date heading';addHeading.onclick=()=>openHeading(localDate(new Date()),addHeading);host.querySelector('.calendar-controls').append(addHeading);host.querySelector('.calendar-legend').textContent+=' Admins can drag ideas to another date, or use Shift + arrow keys on a focused idea to move it by a day or week.';}
  let headingOpener=null;
  function openHeading(date,button){if(!admin||busy)return;headingOpener=button;const f=headingDialog.querySelector('form');f.elements.date.value=date;f.elements.heading.value=dateHeading(date,headings);headingDialog.querySelector('.idea-error').textContent='';headingDialog.showModal();f.elements.heading.focus();}
  headingDialog.querySelector('[data-action=cancel]').onclick=()=>headingDialog.close();
  headingDialog.querySelector('[data-action=default]').onclick=()=>{const f=headingDialog.querySelector('form');f.elements.heading.value=defaultDateHeading(f.elements.date.value);};
  headingDialog.querySelector('input[name=date]').onchange=async()=>{const f=headingDialog.querySelector('form'),date=f.elements.date.value,submit=f.querySelector('[type=submit]');f.elements.heading.value=dateHeading(date,headings);submit.disabled=true;try{const result=await supabase.from('calendar_date_headers').select('*').eq('client',selectedClient).eq('heading_date',date);if(result.error)throw result.error;if(f.elements.date.value!==date)return;headings=headings.filter(x=>x.heading_date!==date).concat(result.data||[]);f.elements.heading.value=dateHeading(date,headings);}catch{headingDialog.querySelector('.idea-error').textContent='Could not load the date heading. Close and reload Calendar before saving.';}finally{if(f.elements.date.value===date)submit.disabled=false;}};
  headingDialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});headingDialog.addEventListener('close',()=>headingOpener?.isConnected&&headingOpener.focus());
  headingDialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!admin||busy)return;const f=e.currentTarget,date=f.elements.date.value,payload={client:selectedClient,heading_date:date,heading:f.elements.heading.value.trim()},existing=headings.find(x=>x.heading_date===date);busy=true;f.querySelectorAll('button,input').forEach(x=>x.disabled=true);try{const result=existing?await supabase.from('calendar_date_headers').update({heading:payload.heading}).eq('client',selectedClient).eq('heading_date',date).eq('updated_at',existing.updated_at).select().single():await supabase.from('calendar_date_headers').insert(payload).select().single();if(result.error)throw result.error;view=new Date(`${date}T12:00:00`);headingDialog.close();await load();message.textContent='Date heading saved.';}catch{headingDialog.querySelector('.idea-error').textContent='Could not save the heading. Close and reload Calendar to check for changes before retrying.';}finally{busy=false;f.querySelectorAll('button,input').forEach(x=>x.disabled=false);}};
  async function moveIdea(idea,date){if(!admin||busy||date===idea.idea_date)return;busy=true;host.setAttribute('aria-busy','true');host.querySelectorAll('button,select').forEach(x=>x.disabled=true);message.textContent='Moving idea…';try{const result=await supabase.from('calendar_ideas').update({idea_date:date,notify_clients:false}).eq('id',idea.id).eq('updated_at',idea.updated_at).select().single();if(result.error)throw result.error;view=new Date(`${date}T12:00:00`);await load();grid.querySelector(`[data-idea-id="${idea.id}"]`)?.focus();message.textContent='Idea moved. No client email was sent.';}catch{await load();message.textContent='Could not move this idea. Its date may have changed, or your connection was interrupted. Check the calendar before retrying.';}finally{busy=false;host.removeAttribute('aria-busy');host.querySelectorAll('button,select').forEach(x=>x.disabled=false);}}
  function clearDrag(){grid.querySelectorAll('.is-drop-target,.is-dragging').forEach(el=>el.classList.remove('is-drop-target','is-dragging'));}
  function label(){return admin?calendarClient.selectedOptions[0]?.textContent:clientLabel;}
  function switchTab(calendar){
    if(busy)return;
    if(admin&&!calendar){const value=selectedClient==='belmo'?'belmogroup':selectedClient;if(clientSelect.value!==value){clientSelect.value=value;clientSelect.dispatchEvent(new Event('change'));}}
    content.hidden=calendar;host.hidden=!calendar;
    [contentTab,calendarTab].forEach((b,i)=>{b.setAttribute('aria-selected',String(i===Number(calendar)));b.tabIndex=i===Number(calendar)?0:-1;});
    if(calendar){content.querySelectorAll('video').forEach(v=>v.pause());load();}
    history.replaceState(null,'',`${location.pathname}${location.search}${calendar?'#calendar':''}`);
  }
  contentTab.onclick=()=>switchTab(false);calendarTab.onclick=()=>switchTab(true);
  tabbar.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='End'||(e.key!=='Home'&&e.target===contentTab);switchTab(next);(next?calendarTab:contentTab).focus();}};
  function render(){
    host.querySelector('.calendar-month-label').textContent=view.toLocaleDateString('en-AU',{month:'long',year:'numeric'});
    host.querySelector('.calendar-client-label').textContent=`${label()} · Shared content planning`;
    grid.replaceChildren();
    for(const date of monthCells(view.getFullYear(),view.getMonth())){
      const key=localDate(date),cell=document.createElement('div');cell.className='calendar-day';cell.dataset.date=key;

      if(date.getMonth()!==view.getMonth())cell.classList.add('is-outside');if(key===localDate(new Date()))cell.classList.add('is-today');
      const b=document.createElement('button');b.type='button';b.className='calendar-date';b.textContent=date.getDate();b.setAttribute('aria-label',`Add idea for ${date.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}`);b.onclick=()=>open(null,key,b);cell.onclick=e=>{if(e.target===cell)open(null,key,b);};const dateRow=document.createElement('div');dateRow.className='calendar-date-row';dateRow.append(b);const heading=document.createElement('span');heading.className='calendar-date-heading';heading.textContent=dateHeading(key,headings);dateRow.append(heading);if(admin){const edit=document.createElement('button');edit.type='button';edit.className='calendar-heading-edit';edit.textContent='✎';edit.setAttribute('aria-label',`Edit date heading for ${key}`);edit.onclick=()=>openHeading(key,edit);dateRow.append(edit);}cell.append(dateRow);
      for(const idea of ideas.filter(x=>x.idea_date===key)){
        const entry=document.createElement('button');entry.type='button';entry.className='calendar-idea';entry.dataset.ideaId=idea.id;const title=document.createElement('span');title.className='calendar-idea-title';title.textContent=idea.description;entry.append(title);const by=document.createElement('small');by.textContent=`${idea.author_role==='admin'?'Studio':'Client'} · ${idea.author_label}`;entry.append(by);entry.onclick=()=>open(idea,key,entry);entry.setAttribute('aria-label',`${idea.description}, by ${idea.author_label}`);if(admin){entry.dataset.draggable='true';entry.draggable=false;entry.title='Drag to another date; Shift + arrow keys also move this idea';entry.onkeydown=e=>{if(e.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key],date=new Date(`${idea.idea_date}T12:00:00`);date.setDate(date.getDate()+delta);moveIdea(idea,localDate(date));}};
        let touchStart=null,touchMoved=false,suppressClick=false;entry.addEventListener('pointerdown',e=>{if((e.pointerType==='mouse'&&e.button!==0)||busy)return;touchStart={x:e.clientX,y:e.clientY};touchMoved=false;entry.setPointerCapture(e.pointerId);});entry.addEventListener('pointermove',e=>{if(!touchStart)return;if(Math.hypot(e.clientX-touchStart.x,e.clientY-touchStart.y)>8)touchMoved=true;if(touchMoved){entry.classList.add('is-dragging');grid.querySelectorAll('.is-drop-target').forEach(x=>x.classList.remove('is-drop-target'));document.elementFromPoint(e.clientX,e.clientY)?.closest('.calendar-day')?.classList.add('is-drop-target');}});entry.addEventListener('pointerup',e=>{if(!touchStart)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.calendar-day');touchStart=null;if(touchMoved){suppressClick=true;clearDrag();if(target&&grid.contains(target))moveIdea(idea,target.dataset.date);setTimeout(()=>suppressClick=false,500);}});entry.addEventListener('pointercancel',()=>{touchStart=null;clearDrag();});entry.onclick=e=>{if(suppressClick){e.preventDefault();return;}open(idea,key,entry);};}
        cell.append(entry);
      }
      grid.append(cell);
    }
  }
  async function load(){
    const token=++request,cells=monthCells(view.getFullYear(),view.getMonth()),start=localDate(cells[0]),after=new Date(cells.at(-1));after.setDate(after.getDate()+1);const end=localDate(after);
    ideas=[];headings=[];clearDrag();render();message.textContent='Loading ideas…';
    try{
      const [ideaResult,headingResult]=await Promise.all([supabase.from('calendar_ideas').select('*').eq('client',selectedClient).is('archived_at',null).gte('idea_date',start).lt('idea_date',end).order('created_at'),supabase.from('calendar_date_headers').select('*').eq('client',selectedClient).gte('heading_date',start).lt('heading_date',end)]);
      const {data,error:loadError}=ideaResult;
      if(token!==request)return;if(loadError||headingResult.error)throw loadError||headingResult.error;ideas=data||[];headings=headingResult.data||[];render();const count=ideas.filter(x=>x.idea_date.slice(0,7)===localDate(view).slice(0,7)).length;message.textContent=count?`${count} ${count===1?'idea':'ideas'} this month`:'No ideas this month yet. Select a date to start planning.';
    }catch{if(token===request)message.textContent='Could not load the calendar. Select Calendar again to retry.';}
  }
  function open(idea,date,button){
    activeIdea=idea;newId=crypto.randomUUID();opener=button;form.reset();error.textContent='';fields.date.value=date;fields.description.value=idea?.description||'';fields.notes.value=idea?.notes||'';
    const editable=!idea||canEditIdea(idea,user);
    for(const f of [fields.date,fields.description,fields.notes])f.readOnly=!editable;
    save.hidden=!editable;archive.hidden=!idea||!editable;archive.textContent='Remove idea';
    dialog.querySelector('.idea-notify').hidden=!admin||!editable;
    credit.textContent=idea?`Added by ${idea.author_label} · ${new Date(idea.created_at).toLocaleDateString('en-AU')}`:`Credited to ${user.user_metadata?.name||user.email}`;
    dialog.querySelector('.idea-notification-note').textContent=!editable?'This idea is shared with your team. Its author or Nickreative can edit it.':admin?'Notifications are off by default. Turn on the checkbox to email all client users about this idea.':'Your new ideas and changes are emailed to Nickreative automatically.';
    dialog.showModal();(editable?fields.description:dialog.querySelector('.idea-cancel')).focus();
  }
  function lock(value){busy=value;save.disabled=archive.disabled=value;dialog.querySelector('.idea-cancel').disabled=value;[fields.date,fields.description,fields.notes,fields.notify].forEach(f=>f.disabled=value);save.textContent=value?'Saving…':'Save idea';}
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{if(opener?.isConnected)opener.focus();});
  dialog.querySelector('.idea-cancel').onclick=()=>dialog.close();
  form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const payload={client:selectedClient,idea_date:fields.date.value,description:fields.description.value.trim(),notes:fields.notes.value.trim(),notify_clients:admin&&fields.notify.checked};
    if(!payload.description){error.textContent='Please enter a post idea.';return;}
    lock(true);error.textContent='';
    try{
      let result;
      if(activeIdea)result=await supabase.from('calendar_ideas').update(payload).eq('id',activeIdea.id).eq('updated_at',activeIdea.updated_at).select().single();
      else result=await supabase.from('calendar_ideas').insert({...payload,id:newId}).select().single();
      if(result.error){if(result.error.code==='23505'){error.textContent='This idea may already have saved. Close this window and reload Calendar before retrying.';return;}throw result.error;}
      view=new Date(`${payload.idea_date}T12:00:00`);dialog.close();await load();grid.querySelector(`[data-idea-id="${result.data.id}"]`)?.focus();message.textContent=(!admin||payload.notify_clients)?'Idea saved. Its email notification is queued for delivery.':'Idea saved. No client email was requested.';
    }catch{error.textContent='Could not save. The idea may have changed, or your connection was interrupted. Your notes are still here; close and reload Calendar to check before retrying.';}
    finally{lock(false);}
  };
  archive.onclick=async()=>{
    if(archive.textContent==='Remove idea'){archive.textContent='Confirm removal';error.textContent='This removes the idea from the shared calendar.';return;}
    lock(true);try{const {error:removeError}=await supabase.from('calendar_ideas').update({archived_at:new Date().toISOString(),notify_clients:false}).eq('id',activeIdea.id).eq('updated_at',activeIdea.updated_at).select().single();if(removeError)throw removeError;dialog.close();await load();host.querySelector('[data-action=add]').focus();message.textContent='Idea removed from the calendar.';}catch{error.textContent='Could not remove this idea. Reload Calendar to check for changes.';}finally{lock(false);}
  };
  host.querySelector('[data-action=previous]').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1,12);load();};
  host.querySelector('[data-action=next]').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1,12);load();};
  host.querySelector('[data-action=today]').onclick=()=>{view=new Date();load();};
  host.querySelector('[data-action=add]').onclick=e=>open(null,localDate(new Date(view.getFullYear(),view.getMonth(),view.getMonth()===new Date().getMonth()&&view.getFullYear()===new Date().getFullYear()?new Date().getDate():1,12)),e.currentTarget);
  switchTab(location.hash==='#calendar');
  return {reload:load};
}
