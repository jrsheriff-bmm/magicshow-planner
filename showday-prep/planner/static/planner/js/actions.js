/* ==========================================================================
   actions.js — what happens when you click, type, drag or upload.

   • actions = { name(){...} }: one entry per data-act="name" button in views.js
   • the "change" listener handles every data-edit="list|id|field" input
   • drag and drop: deadline cards between board columns, pins on the floor
     plan, pieces in the layout room, and [final] table rows by their ⠿ handle
     (run of show program, people, budget lines)
   After changing an event, code calls touch(event) (core.js), which saves it.
   Newer features add their own buttons with Object.assign(actions, {...}) in
   their own files (budget.js, approvals.js, wrapup.js, reports.js, library.js).
   ========================================================================== */
/* ---------- actions ---------- */
function openEvent(id){ S.view='event'; S.eventId=id; S.tab='overview'; S.calMonth=null; S.confirmDel=null; S.modal=null; S.drawer=null; S.placing=false; S.previewTime=null; render(); window.scrollTo(0,0); }
function listOf(ev,list){ return list === 'program' ? ev.program.items : list === 'pins' ? ev.layout.pins : list === 'pieces' ? ev.layout.pieces : ev[list]; }
function openDrawer(type,id){ S.drawer = {type,id}; render(); }
const actions = {
  home(){ S.view='home'; S.modal=null; S.drawer=null; render(); window.scrollTo(0,0); },
  contacts(){ S.view='contacts'; S.modal=null; S.drawer=null; render(); window.scrollTo(0,0); },
  dirTag(el){ S.dirTag = el.dataset.v; render(); },   // [beta] Contacts: show one tag
  open(el){ openEvent(el.dataset.id); },
  tab(el){ S.tab = el.dataset.tab; S.confirmDel=null; S.placing=false; if(S.drawer && S.drawer !== 'notes') S.drawer = null; render(); },
  fix(el){ S.tab = el.dataset.tab; if(el.dataset.rtype === 'ms') S.drawer = {type:'ms', id:el.dataset.rid}; else if(el.dataset.rtype === 'item'){ S.showView = 'sheet'; S.drawer = {type:'item', id:el.dataset.rid}; } render(); },
  newEvent(el){ S.modal = {type:'new', tpl:el.dataset.tpl}; render(); setTimeout(() => { const i = $('#nName'); if(i) i.focus(); }, 0); },
  cloneThis(){ S.modal = {type:'clone'}; render(); setTimeout(() => { const i = $('#nDate'); if(i) i.focus(); }, 0); },
  closeModal(el,e){ if(el.classList.contains('scrim') && e.target !== el) return; S.modal = null; render(); },
  createFromModal(){
    const name = $('#nName').value.trim(), date = $('#nDate').value, series = $('#nSeries').value.trim(), venue = $('#nVenue').value.trim(), err = $('#nErr');
    if(!name){ err.textContent = 'Give the event a name.'; return; }
    if(!isYMD(date)){ err.textContent = 'Pick a show date so deadlines can be counted back from it.'; return; }
    let base;
    if(S.modal.type === 'clone') base = cloneEvent(curEv());
    else {
      const from = (document.querySelector('input[name="nFrom"]:checked')||{}).value || 'showcase';
      if(from === 'blank' || from === 'pick') base = blankTemplate();
      else if(from.startsWith('lib:')){ const t = userTemplate(from.slice(4)); base = t ? eventFromTemplateData(t.data) : blankTemplate(); }
      else if(from.startsWith('ev:')) base = cloneEvent(S.events[from.slice(3)]);
      else base = buildTemplate(TEMPLATES.find(t => t.key === from) || TEMPLATES[0]);
    }
    const ev = Object.assign({address:'',host:'',priceAdv:'',priceDoor:'',capacity:'',target:'',about:''}, base, {id:uid(), name, date, series, venue: venue || base.venue || ''});
    const pick = S.modal.type === 'new' && ((document.querySelector('input[name="nFrom"]:checked')||{}).value === 'pick');
    S.modal = null; createEvent(normalize(ev, ev.id));
    if(pick){ ev.budget = []; S.modal = {type:'pieces', section:'', src: S.templates[0] ? 'lib:'+S.templates[0].id : 'tpl:showcase'}; render(); }
  },
  askDel(){ S.confirmDel = S.eventId; render(); },
  delEvent(){ deleteEvent(S.eventId); },
  /* export */
  export(el){ S.modal = {type:'export', which: el.dataset.which || 'summary'}; render(); },
  async doExport(el){ const ev = curEv(); const which = (document.querySelector('input[name="exWhich"]:checked')||{}).value || 'summary'; await exportAs(exportDoc(ev, which), el.dataset.fmt, slug(ev.name)+'-'+(which==='full'?'master-plan':which)); },
  async quickExport(el){ const ev = curEv(); const w = el.dataset.which; await exportAs(exportDoc(ev, w), el.dataset.fmt, slug(ev.name)+'-'+slug(w)); },
  /* deadlines */
  msView(el){ S.msView = el.dataset.v; render(); },
  addMs(){ const ev = curEv(); const m = {id:uid(),title:'New deadline',offset:-14,phase:PHASES[3],owner:'',hard:false,status:'todo',desc:'',checklist:[]}; ev.milestones.push(m); S.drawer = {type:'ms', id:m.id}; touch(ev); setTimeout(() => { const t = $('#d-title'); if(t){ t.focus(); t.select(); } }, 0); },
  openMs(el){ if(S.justDragged) return; S.tab = S.tab === 'calendar' || S.tab === 'overview' ? S.tab : 'milestones'; openDrawer('ms', el.dataset.id); },
  closeDrawer(){ S.drawer = null; render(); },
  addSub(el){ const ev = curEv(), m = ev.milestones.find(x => x.id === el.dataset.ms), t = $('#newSub'); if(!m || !t || !t.value.trim()) return; m.checklist.push({id:uid(), text:t.value.trim(), done:false}); touch(ev); setTimeout(() => { const n = $('#newSub'); if(n) n.focus(); }, 0); },
  delSub(el){ const ev = curEv(), m = ev.milestones.find(x => x.id === el.dataset.ms); if(!m) return; m.checklist = m.checklist.filter(c => c.id !== el.dataset.id); touch(ev); },
  /* show */
  showView(el){ S.showView = el.dataset.v; render(); },
  openItem(el){ openDrawer('item', el.dataset.id); },
  addSetup(){ const ev = curEv(); ev.setup.push({id:uid(),title:'New setup item',start:'16:00',end:'16:30',track:'Production',audiences:['Internal'],notes:''}); touch(ev); toast('Added to the Internal page only. Tap a group in “Shown to” to put it on that group’s page too.'); },
  addProg(){ const ev = curEv(); ev.program.items.push({id:uid(),title:'New segment',who:'',dur:15,audiences:['Internal','Performers'],notes:''}); touch(ev); toast('Added to the Internal and Performers pages. Change “Shown to” to add or remove pages.'); },
  move(el){ const ev = curEv(), arr = ev.program.items, i = arr.findIndex(x => x.id === el.dataset.id), j = i + Number(el.dataset.dir); if(i<0||j<0||j>=arr.length) return; const t = arr[i]; arr[i]=arr[j]; arr[j]=t; touch(ev); },
  /* [final] Add a line at a chosen place instead of at the end. */
  addProgAt(el){
    const ev = curEv(), arr = ev.program.items, i = Math.max(0, Math.min(arr.length, Number(el.dataset.index)||0));
    const it = {id:uid(), title:'New segment', who:'', dur:15, audiences:['Internal','Performers'], notes:''};
    arr.splice(i, 0, it);
    if(S.drawer && S.drawer.type === 'item') S.drawer = {type:'item', id:it.id};
    touch(ev); focusNew(S.drawer ? '#i-title' : '[data-edit="program|'+it.id+'|title"]');
  },
  addSetupAt(el){
    // Setup items sort by start time, so "here" means: starts when the one above ends.
    const ev = curEv(), sorted = ev.setup.slice().sort((a,b) => (toMin(a.start)||0)-(toMin(b.start)||0)), i = Number(el.dataset.index)||0;
    const prev = sorted[i-1], next = sorted[i];
    let s = prev ? (spanOf(prev) ? spanOf(prev).e : toMin(prev.start)) : (next && toMin(next.start) != null ? toMin(next.start) - 30 : 16*60);
    if(s == null) s = 16*60;
    if(next && toMin(next.start) != null && s > toMin(next.start)) s = toMin(prev.start);   // the one above runs past the one below: start alongside it
    let e = s + 30; if(next && toMin(next.start) != null && toMin(next.start) > s && toMin(next.start) < e) e = toMin(next.start);
    const it = {id:uid(), title:'New setup item', start:toHHMM(Math.max(0,s)), end:toHHMM(Math.max(0,e)), track:(prev||next||{}).track||'Production', audiences:['Internal'], notes:''};
    ev.setup.push(it); touch(ev); focusNew('[data-edit="setup|'+it.id+'|title"]');
  },
  dupSetup(el){ const ev = curEv(), s = ev.setup.find(x => x.id === el.dataset.id); if(!s) return; const c = Object.assign(clone(s), {id:uid(), title:s.title+' (copy)'}); ev.setup.push(c); S.drawer = {type:'item', id:c.id}; touch(ev); focusNew('#i-title'); },
  del(el){ const ev = curEv(), arr = listOf(ev, el.dataset.list); const i = arr.findIndex(x => x.id === el.dataset.id); if(i < 0) return; arr.splice(i,1); if(S.drawer && S.drawer.id === el.dataset.id) S.drawer = null; if(el.dataset.list === 'contacts') ev.layout.pins.forEach(p => { if(p.contactId === el.dataset.id) p.contactId = ''; }); touch(ev); },
  aud(el){ const ev = curEv(), it = listOf(ev, el.dataset.list).find(x => x.id === el.dataset.id); if(!it) return; const a = el.dataset.aud; it.audiences = (it.audiences||[]).includes(a) ? it.audiences.filter(x => x!==a) : (it.audiences||[]).concat(a); touch(ev); },
  /* equipment */
  eqFilter(el){ S.eqFilter = el.dataset.v; render(); },
  addEq(){ const ev = curEv(), t = $('#eqNew'), c = $('#eqCat'); if(!t || !t.value.trim()) { if(t) t.focus(); return; } ev.equipment.push({id:uid(), item:t.value.trim(), cat:c.value, qty:1, source:ev.kind==='venue'?'Venue provides':'Owned', owner:'', status:'needed', notes:''}); if(S.eqFilter !== 'all' && S.eqFilter !== 'needed') S.eqFilter = 'all'; touch(ev); setTimeout(() => { const n = $('#eqNew'); if(n) n.focus(); const cc = $('#eqCat'); if(cc) cc.value = c.value; }, 0); },
  suggestEq(el){ const ev = curEv(); ev.equipment.push({id:uid(), item:el.dataset.item, cat:el.dataset.cat, qty:1, source:'Owned', owner:'', status:'needed', notes:''}); touch(ev); },
  eqStep(el){ const ev = curEv(), e = ev.equipment.find(x => x.id === el.dataset.id); if(!e) return; const i = EQ_STATUS.findIndex(s => s[0] === e.status); e.status = EQ_STATUS[(i+1) % EQ_STATUS.length][0]; touch(ev); },
  /* people */
  addPerson(){ const ev = curEv(); ev.contacts.push({id:uid(),role:'',name:'',org:'',phone:'',email:'',audiences:['Internal'],showPhone:false,invoiceUrl:'',remind:true,team:false}); touch(ev); },
  pickPeople(){ S.modal = {type:'pick', q:''}; render(); },
  doPick(){ const ev = curEv(); const ids = [...document.querySelectorAll('input[name="pickP"]:checked')].map(i => i.value); ids.forEach(id => { const p = S.people.find(x => x.id === id); if(p) ev.contacts.push({id:uid(), personId:p.id, role:p.role||'', name:p.name||'', org:p.org||'', phone:p.phone||'', email:p.email||'', audiences:['Internal'], showPhone:false, invoiceUrl:p.invoiceUrl||'', remind:true, team:false}); }); S.modal = null; touch(ev); if(ids.length) toast('Added '+ids.length+' '+(ids.length===1?'person':'people')+'. Set their role and tags in the table.'); },
  send(el){ S.modal = {type:'send', id:el.dataset.id}; render(); },
  async copySend(){ const t = $('#sendText'); if(!t) return; try { await navigator.clipboard.writeText(t.value); toast('Message copied. Paste it into a text or email.'); } catch(e){ t.focus(); t.select(); toast('Press Ctrl+C (or Cmd+C) to copy the selected message.'); } },
  icsFor(el){ const ev = curEv(); saveFile(slug(ev.name)+'-'+slug(gname(ev, el.dataset.aud))+'-schedule.ics', buildICS(ev, audienceItems(ev, el.dataset.aud))); },
  async saveToDir(el){ const ev = curEv(), c = ev.contacts.find(x => x.id === el.dataset.id); if(!c) return; if(!c.name && !c.org){ toast('Add a name first.'); return; } c.personId = await savePerson({name:c.name, org:c.org, role:c.role, phone:c.phone, email:c.email, invoiceUrl:c.invoiceUrl}); touch(ev); toast((c.name||c.org)+' saved to Contacts.'); },
  async importPeople(){
    let added = 0; const keys = new Set(S.people.map(personKey));
    for(const ev of Object.values(S.events)){
      let changed = false;
      for(const c of ev.contacts){
        if(!c.name || /tbd|insert|\[/i.test(c.name)) continue;
        const k = personKey(c);
        if(keys.has(k)){ const p = S.people.find(x => personKey(x) === k); if(p && c.personId !== p.id){ c.personId = p.id; changed = true; } continue; }
        c.personId = await savePerson({name:c.name, org:c.org, role:c.role, phone:c.phone, email:c.email, invoiceUrl:c.invoiceUrl}); keys.add(k); added++; changed = true;
      }
      if(changed) touch(ev, true);
    }
    render(); toast(added ? 'Imported '+added+' '+(added===1?'contact':'contacts')+' from your events.' : 'Everyone from your events is already in Contacts.');
  },
  async addDir(){ await savePerson({name:'', org:'', role:''}); render(); const rows = document.querySelectorAll('[data-person$="|name"]'); for(const r of rows){ if(!r.value){ r.focus(); break; } } },
  delDir(el){ removePerson(el.dataset.id); },
  /* paperwork */
  addCp(){ const ev = curEv(); ev.compliance.push({id:uid(),item:'New paperwork item',owner:'',offset:-21,status:'needed',expires:'',notes:'',files:[]}); touch(ev); },
  dlFile(el){ const ev = curEv(), c = ev.compliance.find(x => x.id === el.dataset.cp); const f = c && c.files.find(x => x.id === el.dataset.id); if(f) downloadAsset(f); },
  rmFile(el){ const ev = curEv(), c = ev.compliance.find(x => x.id === el.dataset.cp); if(!c) return; c.files = c.files.filter(f => f.id !== el.dataset.id); touch(ev); },
  /* layout */
  layoutView(el){ S.layoutView = el.dataset.v; S.placing = false; S.drawer = null; render(); },
  addPiece(el){ const ev = curEv(), L = ev.layout, def = LAYOUT_PIECES[el.dataset.kind]; const W = Number(L.room.w)||60, D = Number(L.room.d)||80; const n = L.pieces.length % 6; const p = {id:uid(), kind:el.dataset.kind, label:el.dataset.kind==='label'?'Label':el.dataset.kind==='custom'?'Custom area':'', w:def.w, h:def.h, rot:0, x:Math.max(0,Math.min(W-def.w, W/2-def.w/2+n*2)), y:Math.max(0,Math.min(D-def.h, D/2-def.h/2+n*2)), group:def.group && gindex(ev, def.group) >= 0 ? def.group : '', contactId:''}; L.pieces.push(p); S.drawer = {type:'piece', id:p.id}; touch(ev); if(def.custom) focusNew('#pc-label'); },
  rotPiece(el){ const ev = curEv(), p = ev.layout.pieces.find(x => x.id === el.dataset.id); if(!p) return; p.rot = ((p.rot||0) + 90) % 360; touch(ev); },
  dupPiece(el){ const ev = curEv(), p = ev.layout.pieces.find(x => x.id === el.dataset.id); if(!p) return; const c = Object.assign({}, p, {id:uid(), x:p.x + ((p.rot||0)%180 ? p.h : p.w), y:p.y}); ev.layout.pieces.push(c); S.drawer = {type:'piece', id:c.id}; touch(ev); },
  placing(){ S.placing = !S.placing; render(); },
  /* share & calendar */
  shareAud(el){ S.shareAud = el.dataset.aud; render(); },
  icsAud(){ const ev = curEv(); saveFile(slug(ev.name)+'-'+slug(gname(ev, S.shareAud))+'-schedule.ics', buildICS(ev, audienceItems(ev, S.shareAud))); },
  icsAll(){ const ev = curEv(); saveFile(slug(ev.name)+'-deadlines.ics', buildICS(ev, deadlineItems(ev))); },
  cal(el){ let [y,m] = S.calMonth.split('-').map(Number); m += Number(el.dataset.dir); if(m<1){m=12;y--;} if(m>12){m=1;y++;} S.calMonth = y+'-'+pad(m); render(); },
  /* account and links */
  logout(){ store.logout(); },
  reload(){ S.mode = 'loading'; init(); },
  copyLink(el){ copyText(el.dataset.url, el.dataset.label || 'Link'); },
  /* notes */
  notes(){ S.drawer = S.drawer === 'notes' ? null : 'notes'; render(); if(S.drawer) setTimeout(() => { const t = $('#noteText'); if(t) t.focus(); }, 0); },
  saveNote(){ const t = $('#noteText'), sh = $('#noteShare'); const v = t && t.value.trim(); if(!v) return; t.value = ''; if(sh) S.noteShare = sh.checked; addNote(v, sh ? sh.checked : false); if(sh && sh.checked) toast('Sent to the MagicShow team. Thank you!'); },
  delNote(el){ removeNote(el.dataset.id); }
};

/* Put the cursor in a line that was just added, with its placeholder text selected, ready to type over. */
function focusNew(selector){ setTimeout(() => { const el = document.querySelector(selector); if(el){ try { el.focus({preventScroll:false}); el.select(); } catch(x){} } }, 0); }

/* Marking a deadline done records the date, so past-event reports can see what ran late. */
function setMsStatus(m, status){ m.status = status; m.doneAt = status === 'done' ? (m.doneAt || todayYMD()) : ''; }

/* ---------- event wiring ---------- */
document.addEventListener('click', e => {
  const app = $('#app'); if(!app || !app.contains(e.target)) return;
  if(S.placing){ const plan = e.target.closest('#plan'); if(plan && !e.target.closest('[data-pin]')){ const r = plan.getBoundingClientRect(); const ev = curEv(); const p = {id:uid(), label:'', kind:'Other', x:+((e.clientX-r.left)/r.width*100).toFixed(2), y:+((e.clientY-r.top)/r.height*100).toFixed(2), contactId:'', notes:''}; ev.layout.pins.push(p); S.placing = false; S.drawer = {type:'pin', id:p.id}; touch(ev); setTimeout(() => { const l = $('#p-label'); if(l) l.focus(); }, 0); return; } }
  const el = e.target.closest('[data-act]'); if(!el) return;
  const act = el.dataset.act;
  if(el.disabled) return;
  if(act === 'closeModal' && el.classList.contains('scrim') && e.target !== el) return;
  if(actions[act]){ if(el.tagName !== 'LABEL') e.preventDefault(); actions[act](el, e); }
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape'){ if(S.modal){ S.modal = null; render(); } else if(S.placing){ S.placing = false; render(); } else if(S.drawer){ S.drawer = null; render(); } return; }
  if((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target.dataset && e.target.dataset.grip && !S.readOnly){ e.preventDefault(); const [list,id] = e.target.dataset.grip.split('|'); moveRow(list, id, e.key === 'ArrowUp' ? -1 : 1); return; }
  if(e.key === 'Enter' && e.target.id === 'newSub'){ e.preventDefault(); const b = document.querySelector('[data-act="addSub"]'); if(b) actions.addSub(b); }
  if(e.key === 'Enter' && e.target.id === 'eqNew'){ e.preventDefault(); actions.addEq(); }
  if(e.key === 'Enter' && e.target.id === 'noteText' && (e.metaKey || e.ctrlKey)) actions.saveNote();
});
function refocus(id){ setTimeout(() => { const el = document.getElementById(id); if(el){ el.focus(); const n = el.value.length; try { el.setSelectionRange(n,n); } catch(x){} } }, 0); }
document.addEventListener('input', e => {
  const el = e.target;
  if(el.id === 'dirSearch'){ S.dirSearch = el.value; render(); refocus('dirSearch'); }
  if(el.id === 'pickQ' && S.modal){ S.modal.q = el.value; render(); refocus('pickQ'); }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if(el.dataset.note){ patchNote(el.dataset.note, {done: el.checked}); return; }
  if(el.id === 'prevTime'){ S.previewTime = toMin(el.value); render(); return; }
  if(S.readOnly) return;
  if(el.dataset.person){ const [id,k] = el.dataset.person.split('|'); const p = S.people.find(x => x.id === id); if(p){ p[k] = k === 'tags' ? el.value.split(',').map(t => t.trim()).filter(Boolean) : el.value; savePerson(p); if(k === 'tags') renderInput(); } return; }
  const ev = curEv();
  if(el.dataset.upload && ev){ const c = ev.compliance.find(x => x.id === el.dataset.upload); const f = await uploadFile(el.files && el.files[0]); if(c && f){ c.files.push(f); touch(ev); toast('Uploaded '+f.name+'.'); } return; }
  if(el.id === 'planUpload' && ev){ const f = el.files && el.files[0]; if(f && !/^image\//.test(f.type)){ toast('Upload the floor plan as a PNG or JPG image.'); return; } const r = await uploadFile(f); if(r){ ev.layout.image = r.id; touch(ev); } return; }
  if(el.dataset.sub && ev){
    const [mid,sid,k] = el.dataset.sub.split('|'); const m = ev.milestones.find(x => x.id === mid); const s = m && m.checklist.find(x => x.id === sid); if(!s) return;
    if(k === 'due') s.offset = isYMD(el.value) && isYMD(ev.date) ? diffDays(ev.date, el.value) : null;   // [beta] a step's own due date
    else s[k] = k === 'done' ? el.checked : el.value;
    if(k === 'done' && el.checked){
      if(m.status === 'todo') setMsStatus(m, 'doing');          // ticking a step means someone is working on it
      const P = stepProgress(m); if(P.total && P.done === P.total && m.status !== 'done') toast('Every step of “'+m.title+'” is done. Set its status to Done when you’re ready.');
    }
    touch(ev); return;
  }
  const spec = el.dataset.edit; if(!spec || !ev) return;
  const [list,id,key] = spec.split('|');
  const val = el.type === 'checkbox' ? el.checked : el.value;
  if(list === 'facts'){ if(key === 'date' && !isYMD(val)){ render(); return; } ev[key] = el.type === 'number' ? (val === '' ? '' : Number(val)) : val; touch(ev); return; }
  if(list === 'rules'){ ev.houseRules = String(val).split('\n').map(s => s.trim()).filter(Boolean); touch(ev); return; }
  if(list === 'room'){ ev.layout.room[key] = Math.max(10, Math.min(400, Number(val)||60)); touch(ev); return; }
  if(list === 'program' && !id){ ev.program[key] = val; touch(ev); return; }
  const it = listOf(ev,list).find(x => x.id === id); if(!it) return;
  if(key === '_neg') it.offset = -Math.max(0, Math.round(Number(val)||0));
  else if(key === '_days'){ const n = Math.max(0, Math.round(Number(val)||0)); it.offset = (Number(it.offset) > 0 ? 1 : -1) * n; }
  else if(key === '_side'){ const n = Math.abs(Number(it.offset)||0) || 1; it.offset = val === 'on' ? 0 : val === 'after' ? n : -n; }
  else if(key === '_date'){ if(!isYMD(val)){ render(); return; } it.offset = diffDays(ev.date, val); }
  else if(list === 'milestones' && key === 'status') setMsStatus(it, val);
  else if(key === 'owner'){ it[key] = val; addMemberToPeople(ev, val); }
  else if(el.type === 'number') it[key] = val === '' ? (list === 'budget' || key === 'fee' ? '' : 0) : (list === 'pieces' ? Math.max(0.5, Number(val)) : Number(val));
  else it[key] = val;
  touch(ev);
});

/* board drag and drop */
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('[data-drag]'); if(!c || S.readOnly) return; S.dragMs = c.dataset.drag; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', S.dragMs); e.dataTransfer.effectAllowed = 'move'; } catch(x){} });
document.addEventListener('dragend', e => { const c = e.target.closest && e.target.closest('[data-drag]'); if(c) c.classList.remove('dragging'); document.querySelectorAll('.col.over').forEach(x => x.classList.remove('over')); });
document.addEventListener('dragover', e => { const col = e.target.closest && e.target.closest('[data-col]'); if(!col || !S.dragMs) return; e.preventDefault(); document.querySelectorAll('.col.over').forEach(x => { if(x !== col) x.classList.remove('over'); }); col.classList.add('over'); });
document.addEventListener('drop', e => { const col = e.target.closest && e.target.closest('[data-col]'); if(!col || !S.dragMs) return; e.preventDefault(); const ev = curEv(), m = ev && ev.milestones.find(x => x.id === S.dragMs); S.dragMs = null; S.justDragged = true; setTimeout(() => S.justDragged = false, 50); if(m && m.status !== col.dataset.col){ setMsStatus(m, col.dataset.col); touch(ev); } else render(); });

/* pin and piece dragging */
let drag = null;
document.addEventListener('pointerdown', e => {
  const pin = e.target.closest && e.target.closest('[data-pin]'), piece = e.target.closest && e.target.closest('[data-piece]');
  if(!pin && !piece) return;
  if(S.placing) return;
  e.preventDefault();
  const ev = curEv(); if(!ev) return;
  if(pin){ const p = ev.layout.pins.find(x => x.id === pin.dataset.pin); drag = {kind:'pin', el:pin, obj:p, sx:e.clientX, sy:e.clientY, moved:false, plan:$('#plan')}; }
  else { const p = ev.layout.pieces.find(x => x.id === piece.dataset.piece); const svg = $('#room'); const pt = toSvg(svg, e.clientX, e.clientY); drag = {kind:'piece', el:piece, obj:p, sx:e.clientX, sy:e.clientY, moved:false, svg, dx:pt.x - p.x, dy:pt.y - p.y}; }
  if(drag.el.setPointerCapture) try { drag.el.setPointerCapture(e.pointerId); } catch(x){}
});
function toSvg(svg,x,y){ const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
document.addEventListener('pointermove', e => {
  if(!drag || S.readOnly) return;
  if(!drag.moved && Math.hypot(e.clientX-drag.sx, e.clientY-drag.sy) < 4) return;
  drag.moved = true; S.dragging = true;
  if(drag.kind === 'pin'){ const r = drag.plan.getBoundingClientRect(); drag.nx = Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)); drag.ny = Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100)); drag.el.style.left = drag.nx+'%'; drag.el.style.top = drag.ny+'%'; }
  else { const ev = curEv(), L = ev.layout, p = drag.obj, rot = (p.rot||0)%180 !== 0, w = rot?p.h:p.w, h = rot?p.w:p.h; const pt = toSvg(drag.svg, e.clientX, e.clientY); drag.nx = Math.max(0, Math.min((Number(L.room.w)||60) - w, Math.round((pt.x - drag.dx)*2)/2)); drag.ny = Math.max(0, Math.min((Number(L.room.d)||80) - h, Math.round((pt.y - drag.dy)*2)/2)); drag.el.setAttribute('transform','translate('+drag.nx+' '+drag.ny+')'); }
});
document.addEventListener('pointerup', () => {
  if(!drag) return;
  const d = drag; drag = null; S.dragging = false;
  const ev = curEv(); if(!ev || !d.obj) return;
  if(d.moved && !S.readOnly && d.nx != null){ d.obj.x = +d.nx.toFixed(2); d.obj.y = +d.ny.toFixed(2); touch(ev); }
  else { S.drawer = {type: d.kind, id: d.obj.id}; needsRender = false; render(); }
});
document.addEventListener('pointercancel', () => { if(drag){ drag = null; S.dragging = false; render(); } });


/* ---------- [final] drag a table row by its ⠿ handle ----------
   Works with a mouse and with a finger. A table opts in with <tbody data-reorder="list">,
   rows carry data-row="id", and the handle carries data-grip="list|id" (see gripCell in
   views.js). While dragging, a line shows where the row will land. Letting go moves the
   item inside the event's list and saves. */
function sameGroup(ev, list, a, b){ return list !== 'budget' || (a.kind||'cost') === (b.kind||'cost'); }   // budget: costs and income share one list
function moveRow(list, id, dir){
  const ev = curEv(); if(!ev) return;
  const arr = listOf(ev, list), i = arr.findIndex(x => x.id === id); if(i < 0) return;
  let j = i + dir; while(j >= 0 && j < arr.length && !sameGroup(ev, list, arr[i], arr[j])) j += dir;
  if(j < 0 || j >= arr.length) return;
  const it = arr.splice(i, 1)[0]; arr.splice(j, 0, it); touch(ev);
}
function dropRow(list, id, beforeId, afterId){
  const ev = curEv(); if(!ev) return;
  const arr = listOf(ev, list), i = arr.findIndex(x => x.id === id); if(i < 0) return;
  const it = arr.splice(i, 1)[0];
  let j = beforeId ? arr.findIndex(x => x.id === beforeId) : -1;
  if(j < 0){ const k = afterId ? arr.findIndex(x => x.id === afterId) : -1; j = k < 0 ? arr.length : k + 1; }
  arr.splice(j, 0, it); touch(ev);
}
let rowDrag = null;
function rowDragStep(){
  const d = rowDrag; if(!d || !d.moved) return;
  // near the top or bottom of the window: scroll, so long lists can be crossed in one drag
  const edge = 70; let dy = 0;
  if(d.y < edge) dy = -Math.ceil((edge - d.y)/5); else if(d.y > window.innerHeight - edge) dy = Math.ceil((d.y - (window.innerHeight - edge))/5);
  if(dy) window.scrollBy(0, dy);
  d.tr.style.transform = 'translateY('+((d.y - d.startY) + (window.scrollY - d.startScroll))+'px)';
  const rows = [...d.body.querySelectorAll('tr[data-row]')].filter(r => r !== d.tr);
  d.body.querySelectorAll('.drop-before,.drop-after').forEach(r => r.classList.remove('drop-before','drop-after'));
  d.before = null; d.after = null;
  for(const r of rows){ const b = r.getBoundingClientRect(); if(d.y < b.top + b.height/2){ d.before = r.dataset.row; r.classList.add('drop-before'); break; } }
  if(!d.before && rows.length){ const last = rows[rows.length-1]; d.after = last.dataset.row; last.classList.add('drop-after'); }
  d.raf = requestAnimationFrame(rowDragStep);
}
document.addEventListener('pointerdown', e => {
  const g = e.target.closest && e.target.closest('[data-grip]');
  if(!g || S.readOnly || (e.button != null && e.button > 0)) return;
  const tr = g.closest('tr'), body = tr && tr.closest('tbody'); if(!body) return;
  e.preventDefault(); g.focus({preventScroll:true});
  const [list, id] = g.dataset.grip.split('|');
  rowDrag = {list, id, tr, body, startY:e.clientY, y:e.clientY, startScroll:window.scrollY, moved:false};
  if(g.setPointerCapture) try { g.setPointerCapture(e.pointerId); } catch(x){}
});
document.addEventListener('pointermove', e => {
  const d = rowDrag; if(!d) return;
  d.y = e.clientY;
  if(!d.moved){ if(Math.abs(e.clientY - d.startY) < 5) return; d.moved = true; S.dragging = true; d.tr.classList.add('dragging'); d.body.classList.add('reordering'); rowDragStep(); }
});
function endRowDrag(commit){
  const d = rowDrag; if(!d) return; rowDrag = null;
  cancelAnimationFrame(d.raf); S.dragging = false;
  d.tr.style.transform = ''; d.tr.classList.remove('dragging'); d.body.classList.remove('reordering');
  d.body.querySelectorAll('.drop-before,.drop-after').forEach(r => r.classList.remove('drop-before','drop-after'));
  if(!d.moved) return;
  if(commit && (d.before || d.after)) dropRow(d.list, d.id, d.before, d.after); else render();
}
document.addEventListener('pointerup', () => endRowDrag(true));
document.addEventListener('pointercancel', () => endRowDrag(false));

/* [beta] Picking a workspace member as an owner adds them to People (with their email),
   so reminders reach them without anyone typing the email again. */
function addMemberToPeople(ev, name){
  const n = norm(name); if(!n || findContact(ev, name)) return;
  const m = (S.members||[]).find(x => norm(x.name) === n || norm(x.email) === n); if(!m) return;
  ev.contacts.push({id:uid(), role:'Team member', name:m.name, org:S.org ? S.org.name : '', phone:'', email:m.email||'', audiences:['Internal'], showPhone:false, invoiceUrl:'', remind:true, team:false, roster:false});
  toast(m.name+' was added to People, so their reminders go to '+(m.email||'their email')+'.');
}
