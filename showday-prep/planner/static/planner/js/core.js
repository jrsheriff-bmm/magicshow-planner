/* ==========================================================================
   core.js — the app's memory, saving, and the shared calculations.

   What's in here:
     • S (state): everything the screens are showing right now
     • saving: every edit calls touch(event), which waits half a second and then
       saves the whole event through store.saveEvent (so fast typing = one save)
     • schedule math, checks, calendar files, and PDF/Word export
       (spreadsheets and the layout drawing are in exports.js)

   This file never talks to the server directly. It calls store.* instead,
   which lives in store-django.js (real site) or store-proto.js (prototype).
   ========================================================================== */

/* ---------- state ---------- */
const S = { events:{}, notes:[], people:[], templates:[], view:'home', eventId:null, tab:'overview', shareAud:'Performers', calMonth:null,
  mode:'loading', readOnly:false, saveMsg:'', modal:null, drawer:null, confirmDel:null,
  user:null, org:null, features:{}, links:{}, personLinks:{}, reportTab:'current', reportExample:false,
  orgs:[], orgRole:null, hours:[], orgSettings:{retainerHours:'', hourlyRate:''}, hoursMonth:null,
  msView:'board', showView:'sheet', previewTime:null, eqFilter:'all', layoutView:'build', placing:false, sel:null, localImg:{}, dirSearch:'' };
const pending = {}, saving = {}, timers = {};
let needsRender = false;

/* ---------- start-up: load everything once ---------- */
async function init(){
  render();
  try { await store.init(); }
  catch(e){ S.mode = 'error'; S.saveMsg = e.message; }
  render();
}

/* Fill in anything an older event is missing, so every screen can rely on it. */
function normalize(ev,id){
  ev.id = id;
  ['milestones','setup','contacts','compliance','equipment','houseRules','budget','approvals'].forEach(k => { if(!Array.isArray(ev[k])) ev[k] = []; });
  if(!ev.program || typeof ev.program !== 'object') ev.program = {start:'19:00', items:[]};
  if(!Array.isArray(ev.program.items)) ev.program.items = [];
  ev.milestones.forEach(m => { if(!Array.isArray(m.checklist)) m.checklist = []; if(m.desc == null) m.desc = ''; if(m.doneAt == null) m.doneAt = ''; });
  ev.setup.forEach(s => { if(s.track === 'Performers') s.track = 'Program & talent'; if(!TRACKS.includes(s.track)) s.track = 'Production'; });
  ev.compliance.forEach(c => { if(!Array.isArray(c.files)) c.files = []; });
  ev.budget.forEach(b => { if(!Array.isArray(b.files)) b.files = []; if(!b.kind) b.kind = 'cost'; });
  ev.contacts.forEach(c => { if(c.remind == null) c.remind = true; });
  // "Team" = the planning team: gets payment reminders and the Monday summary. Older events: the lead.
  if(ev.contacts.length && !ev.contacts.some(c => c.team != null)){ const lead = ev.contacts.find(c => /lead|manager|producer/i.test(c.role||'')) || ev.contacts[0]; ev.contacts.forEach(c => c.team = c === lead); }
  if(!ev.layout || typeof ev.layout !== 'object') ev.layout = {};
  const L = ev.layout; if(!Array.isArray(L.pins)) L.pins = []; if(!Array.isArray(L.pieces)) L.pieces = []; if(!L.room) L.room = {w:60,d:80}; if(L.image == null) L.image = '';
  if(!ev.kind) ev.kind = 'organizer';
  if(!ev.wrapup || typeof ev.wrapup !== 'object') ev.wrapup = {};
  if(!ev.wrapup.ratings || typeof ev.wrapup.ratings !== 'object') ev.wrapup.ratings = {};
  ['priceAdv','priceDoor','capacity','target','budgetTotal'].forEach(k => { if(ev[k] == null) ev[k] = ''; });
  linkOwners(ev);
  return ev;
}

/* ---------- owners ----------
   "Owner" is typed as a name. When that name matches someone in the event's People,
   we remember that person's id (ownerId). That's how the app knows whose email
   gets the reminder, and whose tasks go in their "by person" download. */
function findContact(ev, name){
  const n = norm(name); if(!n) return null;
  return ev.contacts.find(c => norm(c.name) === n) || ev.contacts.find(c => c.org && norm(c.org) === n) || null;
}
function contactById(ev, id){ return id ? ev.contacts.find(c => c.id === id) || null : null; }
function linkOwners(ev){
  const set = (x, field, idField) => { const c = findContact(ev, x[field]); x[idField] = c ? c.id : ''; };
  ev.milestones.forEach(m => set(m, 'owner', 'ownerId'));
  ev.compliance.forEach(c => set(c, 'owner', 'ownerId'));
  ev.equipment.forEach(q => set(q, 'owner', 'ownerId'));
  ev.budget.forEach(b => set(b, 'payee', 'payeeId'));
}
/* Can this owner get reminder emails? Returns {contact, ok, why}. */
function ownerReach(ev, name){
  if(!String(name||'').trim()) return {contact:null, ok:false, why:'No owner'};
  const c = findContact(ev, name);
  if(!c) return {contact:null, ok:false, why:'Not in People'};
  if(!c.email) return {contact:c, ok:false, why:'No email'};
  if(c.remind === false) return {contact:c, ok:false, why:'Reminders off'};
  return {contact:c, ok:true, why:''};
}

function softRender(){
  const a = document.activeElement;
  if(S.dragging || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#app'))){ needsRender = true; return; }
  render();
}
document.addEventListener('focusout', () => { if(needsRender){ setTimeout(() => { const a = document.activeElement; if(!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && !S.dragging){ needsRender = false; render(); } }, 0); } });

/* ---------- saving events ---------- */
function touch(ev, quiet){
  ev.updatedAt = Date.now();
  linkOwners(ev);
  pending[ev.id] = true;
  clearTimeout(timers[ev.id]);
  timers[ev.id] = setTimeout(() => flush(ev.id), 450);
  if(quiet) updateSaveState();
  else if(S.deferRender){ updateSaveState(); renderLater(); }   // a typed-in box changed: redraw once the Tab or click has landed (views.js)
  else render();
}
async function flush(id){
  if(S.mode === 'local'){ pending[id] = false; updateSaveState(); return; }
  if(saving[id]){ saving[id].again = true; return; }
  saving[id] = {again:false};
  const ev = S.events[id];
  if(ev){ try { await store.saveEvent(ev); S.saveMsg = 'All changes saved'; } catch(e){ writeFailed(e); } }
  const again = saving[id].again; delete saving[id];
  if(again) flush(id); else { pending[id] = false; updateSaveState(); }
}
function writeFailed(e){
  const code = e && (e.status || e.code);
  if(code === 403 || code === 'invalid_argument' || code === 'not_granted'){ S.readOnly = true; S.saveMsg = 'View only'; }
  else if(code === 'quota_exceeded') S.saveMsg = 'Couldn’t save: storage is full. Delete an old event to keep saving.';
  else S.saveMsg = 'Couldn’t save: '+(e && e.message ? e.message : 'unknown error')+' Your next edit will try again.';
  render();
}
function updateSaveState(){ const el = $('#savestate'); if(el) el.innerHTML = saveStateHTML(); }
function saveStateHTML(){
  if(S.mode === 'loading') return '<span class="dot busy"></span>Loading…';
  if(S.mode === 'error') return '<span class="dot off"></span>'+esc(S.saveMsg || 'Couldn’t load your data');
  if(S.mode === 'local') return '<span class="dot off"></span>Not saved: changes last until you close this page';
  const busy = Object.values(pending).some(Boolean);
  const bad = /^Couldn/.test(S.saveMsg||'');
  return '<span class="dot '+(busy?'busy':bad?'off':'')+'"></span>'+esc(busy ? 'Saving…' : (S.saveMsg || 'All changes saved'));
}
function createEvent(ev){
  ev.id = ev.id || uid(); ev.createdAt = Date.now(); ev.updatedAt = Date.now();
  normalize(ev, ev.id);
  S.events[ev.id] = ev;
  pending[ev.id] = true; flush(ev.id);
  openEvent(ev.id);
}
async function deleteEvent(id){
  delete S.events[id];
  try { await store.deleteEvent(id); } catch(e){ writeFailed(e); }
  S.view = 'home'; S.eventId = null; render();
}

/* ---------- contacts directory ---------- */
async function savePerson(p){
  if(!p.id) p.id = uid();
  const body = {id:p.id, name:p.name||'', org:p.org||'', role:p.role||'', phone:p.phone||'', email:p.email||'', invoiceUrl:p.invoiceUrl||'', notes:p.notes||''};
  const i = S.people.findIndex(x => x.id === p.id);
  if(i >= 0) S.people[i] = body; else S.people.push(body);
  try { await store.savePerson(body); } catch(e){ writeFailed(e); }
  return p.id;
}
async function removePerson(id){
  S.people = S.people.filter(p => p.id !== id); render();
  try { await store.deletePerson(id); } catch(e){ writeFailed(e); }
}
function personKey(p){ return norm(p.name)+'|'+norm(p.org); }

/* ---------- testing notes ---------- */
async function addNote(text){
  const ev = S.events[S.eventId];
  const tabName = (TABS.find(t => t[0] === S.tab)||[])[1];
  const where = S.view === 'event' && ev ? (ev.name||'Untitled')+' · '+tabName : ({contacts:'Contacts', reports:'Reports', library:'Templates', hours:'Hours'})[S.view] || 'Events home';
  const n = {id:uid(), text, where, eventId: S.view === 'event' ? S.eventId : '', done:false, createdAt:Date.now()};
  S.notes.unshift(n); render();
  try { await store.saveNote(n); } catch(e){ writeFailed(e); }
}
async function patchNote(id,patch){
  const n = S.notes.find(x => x.id === id); if(!n) return;
  Object.assign(n, patch); render();
  try { await store.saveNote(n); } catch(e){ writeFailed(e); }
}
async function removeNote(id){
  S.notes = S.notes.filter(x => x.id !== id); render();
  try { await store.deleteNote(id); } catch(e){ writeFailed(e); }
}

/* ---------- uploaded files ---------- */
function blobUrl(id){ return store.blobUrl(id); }
async function uploadFile(file){
  if(!file) return null;
  if(file.size > 20*1024*1024){ toast('That file is over 20 MB. Upload a smaller copy.'); return null; }
  toast('Uploading '+file.name+'…');
  try { return await store.uploadFile(file); }
  catch(e){ toast(e.message || 'Upload failed. Try again.'); return null; }
}
function downloadAsset(f){ return store.downloadAsset(f); }
async function saveFile(filename, data){ return store.saveFile(filename, data); }

/* ---------- small pop-up messages ---------- */
let toastTimer;
function toast(msg){ S.toast = msg; renderToast(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = null; renderToast(); }, 4200); }
function renderToast(){ let el = $('#toast'); if(!el){ el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role','status'); el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:40;max-width:min(520px,calc(100% - 32px));'; document.body.appendChild(el); } el.innerHTML = S.toast ? '<div class="banner info" style="box-shadow:var(--shadow)">'+esc(S.toast)+'</div>' : ''; }

/* ---------- private links (real site only) ---------- */
async function loadLinks(eventId){
  if(!store.links || S.links[eventId] || S.links[eventId+'-loading']) return;
  S.links[eventId+'-loading'] = true;
  try { S.links[eventId] = await store.shareLinks(eventId); }
  catch(e){ toast('Couldn’t load share links: '+e.message); }
  delete S.links[eventId+'-loading'];
  softRender();
}
async function loadPersonLink(eventId, contactId){
  const k = eventId+'|'+contactId;
  if(!store.links || S.personLinks[k] || S.personLinks[k+'-loading']) return;
  S.personLinks[k+'-loading'] = true;
  try { S.personLinks[k] = await store.personLink(eventId, contactId); } catch(e){}
  delete S.personLinks[k+'-loading'];
  softRender();
}
async function copyText(text, label){
  try { await navigator.clipboard.writeText(text); toast((label||'Text')+' copied.'); }
  catch(e){ toast('Select the text and press Ctrl+C (or Cmd+C) to copy.'); }
}

/* ---------- schedule math ---------- */
function programTimes(ev){
  let t = toMin(ev.program && ev.program.start); if(t == null) t = 19*60;
  return ((ev.program && ev.program.items) || []).map(it => { const s = t; t += Math.max(0, Number(it.dur)||0); return Object.assign({}, it, {s, e:t, kind:'program', track:'Program'}); });
}
function spanOf(it){ const s = toMin(it.start), e0 = toMin(it.end); if(s == null) return null; let e = e0 == null ? s : e0; if(e < s) e += 1440; return {s, e}; }
function daySchedule(ev){
  const setup = ev.setup.map(s => { const sp = spanOf(s); return sp ? Object.assign({}, s, {s:sp.s, e:sp.e, kind:'setup'}) : null; }).filter(Boolean);
  return setup.concat(programTimes(ev)).sort((a,b) => a.s - b.s || (a.kind === 'setup' ? -1 : 1));
}
function contactMatches(ev,name){
  const n = norm(name); if(!n) return true;
  return (ev.contacts||[]).some(c => { const a = norm(c.name), b = norm(c.org); return (a && (a.includes(n) || n.includes(a))) || (b && (b.includes(n) || n.includes(b))); });
}

/* The last day an event still needs anything: show day, or a later open deadline
   (editing, delivery, a payment). Reminders and the Current report run until then. */
function lastActiveDay(ev){
  if(!isYMD(ev.date)) return '';
  let last = ev.date;
  ev.milestones.filter(m => m.status !== 'done').forEach(m => { const d = addDays(ev.date, Number(m.offset)||0); if(d > last) last = d; });
  ev.compliance.filter(c => c.status === 'needed').forEach(c => { const d = addDays(ev.date, Number(c.offset)||0); if(d > last) last = d; });
  ev.budget.filter(b => b.kind === 'cost' && b.status !== 'paid' && isYMD(b.due)).forEach(b => { if(b.due > last) last = b.due; });
  return last;
}

/* Everything one person is responsible for in an event (for "Download by person"). */
function personTasks(ev, name){
  const c = findContact(ev, name), n = norm(name);
  const mine = (x, f, idf) => (c && x[idf] === c.id) || norm(x[f]) === n;
  return {
    contact: c,
    deadlines: ev.milestones.filter(m => mine(m,'owner','ownerId')).sort((a,b) => (a.offset||0)-(b.offset||0)),
    paperwork: ev.compliance.filter(x => mine(x,'owner','ownerId')),
    equipment: ev.equipment.filter(q => mine(q,'owner','ownerId')),
    program: programTimes(ev).filter(p => p.who && (norm(p.who) === n || (c && norm(p.who) === norm(c.name))))
  };
}
/* Everyone who owns at least one task, with how many they own. */
function taskOwners(ev){
  const names = new Map();
  const bump = nm => { nm = String(nm||'').trim(); if(!nm) return; const c = findContact(ev, nm); const key = c ? c.name || c.org : nm; names.set(key, (names.get(key)||0) + 1); };
  ev.milestones.forEach(m => bump(m.owner)); ev.compliance.forEach(c => bump(c.owner)); ev.equipment.forEach(q => bump(q.owner));
  return [...names.entries()].map(([name,count]) => ({name, count})).sort((a,b) => b.count - a.count);
}

/* ---------- checks ---------- */
function runChecks(ev){
  const out = [], today = todayYMD();
  const add = (level,text,tab,area,ref) => out.push({level,text,tab,area,ref});
  if(!isYMD(ev.date)){ add('critical','Show date isn’t set, so no deadlines can be calculated.','overview','Facts'); return out; }
  const toShow = diffDays(today, ev.date);
  if(toShow < 0) add('info','Show day has passed. Clone this event to plan the next one.','overview','Facts');
  if(ev.priceAdv !== '' && ev.priceDoor !== '' && ev.priceAdv != null && ev.priceDoor != null && Number(ev.priceDoor) < Number(ev.priceAdv)) add('warning','Door price ('+money(ev.priceDoor)+') is lower than the advance price ('+money(ev.priceAdv)+').','overview','Facts');
  if(Number(ev.capacity) && Number(ev.target) > Number(ev.capacity)) add('warning','Target headcount ('+ev.target+') is above venue capacity ('+ev.capacity+').','overview','Facts');
  ev.milestones.forEach(m => {
    const d = addDays(ev.date, Number(m.offset)||0);
    if(m.status !== 'done'){
      if(d < today) add(m.hard?'critical':'warning','“'+m.title+'” was due '+fmtD(d,true)+(m.hard?' (hard deadline)':'')+' and isn’t marked done.','milestones','Deadlines',{type:'ms',id:m.id});
      else if(m.hard && diffDays(today,d) <= 7) add('warning','Hard deadline “'+m.title+'” is due in '+diffDays(today,d)+' days.','milestones','Deadlines',{type:'ms',id:m.id});
      if(!String(m.owner||'').trim()) add('info','“'+m.title+'” has no owner.','milestones','Deadlines',{type:'ms',id:m.id});
    }
  });
  ev.compliance.forEach(c => {
    const d = addDays(ev.date, Number(c.offset)||0);
    if(c.status !== 'approved'){
      if(d < today) add('critical','“'+c.item+'” was due '+fmtD(d,true)+' and isn’t approved.','compliance','Paperwork');
      else if(diffDays(today,d) <= 14) add('warning','“'+c.item+'” is due in '+diffDays(today,d)+' days ('+fmtD(d,true)+').','compliance','Paperwork');
    } else if(!(c.files||[]).length) add('info','“'+c.item+'” is approved but has no file on record.','compliance','Paperwork');
    if(isYMD(c.expires) && c.expires < ev.date) add('critical','“'+c.item+'” expires '+fmtD(c.expires)+', before show day.','compliance','Paperwork');
    if(c.owner && !contactMatches(ev,c.owner)) add('warning','“'+c.item+'” is assigned to '+c.owner+', who isn’t in People. Is that the right vendor?','compliance','Paperwork');
    if(!c.owner) add('info','“'+c.item+'” has no responsible party.','compliance','Paperwork');
  });
  const needed = ev.equipment.filter(e => e.status === 'needed');
  if(toShow >= 0 && toShow <= 7 && needed.length) add('warning',needed.length+' equipment item'+(needed.length>1?'s are':' is')+' still marked Needed with '+toShow+' days to go.','equipment','Equipment');
  else if(toShow >= 0 && toShow <= 21){ const rent = needed.filter(e => e.source === 'Rent'); if(rent.length) add('warning',rent.length+' rental item'+(rent.length>1?'s aren’t':' isn’t')+' secured yet: '+rent.slice(0,3).map(e=>e.item).join(', ')+(rent.length>3?'…':'')+'.','equipment','Equipment'); }
  ev.equipment.filter(e => e.source === 'Vendor brings' && !e.owner).forEach(e => add('info','“'+e.item+'” is coming from a vendor, but no one is named.','equipment','Equipment'));
  const pt = programTimes(ev), endM = toMin(ev.end);
  if(pt.length && endM != null){ const last = pt[pt.length-1].e; let em = endM; if(em < (toMin(ev.program.start)||0)) em += 1440; if(last > em) add('warning','The program runs to '+fmt12(last)+', past the scheduled end of '+fmt12(endM)+'.','show','Run of show'); }
  pt.forEach(p => {
    if(p.who && !contactMatches(ev,p.who)) add('warning','“'+p.who+'” in the run of show doesn’t match anyone in People. Check the spelling.','show','Run of show',{type:'item',id:p.id});
    if(!(p.audiences||[]).length) add('info','Program item “'+p.title+'” isn’t on any share page.','show','Run of show',{type:'item',id:p.id});
  });
  const doorsM = toMin(ev.doors);
  TRACKS.forEach(tr => {
    const items = ev.setup.filter(s => s.track === tr).map(s => Object.assign({sp:spanOf(s)}, s)).filter(s => s.sp).sort((a,b) => a.sp.s - b.sp.s);
    for(let i=1;i<items.length;i++){ if(items[i].sp.s < items[i-1].sp.e) add('warning','“'+items[i-1].title+'” and “'+items[i].title+'” overlap in the '+tr+' track.','show','Run of show',{type:'item',id:items[i].id}); }
  });
  ev.setup.forEach(s => {
    if(!(s.audiences||[]).length) add('info','Setup item “'+s.title+'” isn’t on any share page.','show','Run of show',{type:'item',id:s.id});
    const sp = spanOf(s);
    if(sp && doorsM != null && (s.track === 'Food & bar' || s.track === 'Program & talent') && sp.e > doorsM && sp.s < doorsM) add('warning','“'+s.title+'” is still running when doors open at '+fmt12(doorsM)+'.','show','Run of show',{type:'item',id:s.id});
  });
  ev.contacts.forEach(c => {
    const nm = String(c.name||'');
    if(!nm.trim() || /tbd|insert|\[/.test(nm.toLowerCase())) add('critical',(c.role||'A contact')+' has no confirmed name yet.','people','People');
    else if(!c.phone && !c.email) add('warning',nm+' ('+(c.role||'contact')+') has no phone or email.','people','People');
  });
  // Reminders: owners the app can't email
  const noReach = ev.milestones.filter(m => m.status !== 'done' && m.owner && !ownerReach(ev, m.owner).ok);
  if(noReach.length){ const names = [...new Set(noReach.map(m => m.owner))]; add('info', noReach.length+' open deadline'+(noReach.length>1?'s have':' has')+' an owner the app can’t email ('+names.slice(0,3).join(', ')+(names.length>3?'…':'')+'), so '+(noReach.length>1?'they won’t':'it won’t')+' get reminders. Add them to People with an email.','people','Reminders'); }
  // Budget
  if(typeof budgetSummary === 'function'){
    const B = budgetSummary(ev);
    if(B.cap && B.projCost > B.cap) add('critical','Projected costs ('+usd(B.projCost)+') are over the budget of '+usd(B.cap)+' by '+usd(B.projCost - B.cap)+'.','budget','Budget');
    else if(B.cap && B.projCost > B.cap*0.9) add('warning','Projected costs are at '+Math.round(B.projCost/B.cap*100)+'% of the budget.','budget','Budget');
    B.overCats.forEach(c => add('warning',c.cat+' is '+usd(c.actual - c.est)+' over its estimate.','budget','Budget'));
    ev.budget.filter(b => b.kind === 'cost' && b.status !== 'paid' && isYMD(b.due) && b.due < today).forEach(b => add('critical','Payment for “'+(b.item||b.cat)+'”'+(b.payee?' to '+b.payee:'')+' was due '+fmtD(b.due,true)+' and isn’t marked paid.','budget','Budget'));
    const noEst = ev.budget.filter(b => b.kind === 'cost' && !hasAmt(b.est) && !hasAmt(b.actual));
    if(noEst.length) add('info',noEst.length+' cost line'+(noEst.length>1?'s have':' has')+' no amount yet.','budget','Budget');
  }
  // Approvals
  ev.approvals.filter(a => a.status === 'pending' && a.requestedAt && (Date.now() - a.requestedAt) > 7*864e5).forEach(a => add('warning','Approval for “'+a.label+'” from '+(a.approver||'the approver')+' has been waiting over a week.','overview','Approvals'));
  ev.approvals.filter(a => a.status === 'declined').forEach(a => add('warning','“'+a.label+'” was declined by '+(a.decidedBy||a.approver||'the approver')+(a.comment?': '+a.comment:'.'),'overview','Approvals'));
  const rank = {critical:0,warning:1,info:2};
  return out.sort((a,b) => rank[a.level]-rank[b.level]);
}
function counts(list){ return {critical:list.filter(c=>c.level==='critical').length, warning:list.filter(c=>c.level==='warning').length, info:list.filter(c=>c.level==='info').length}; }

/* ---------- calendar files (.ics) ---------- */
function icsEsc(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
function buildICS(ev, items){
  const stamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Blackmagic Media//MagicShow//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:'+icsEsc(ev.name)];
  items.forEach(it => {
    // "@showday-prep" = the app's old name, kept on purpose so calendars don't show events twice
    L.push('BEGIN:VEVENT','UID:'+it.uid+'@showday-prep','DTSTAMP:'+stamp);
    if(it.allDay) L.push('DTSTART;VALUE=DATE:'+it.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+addDays(it.date,1).replace(/-/g,''));
    else { const d0 = addDays(it.date,Math.floor(it.s/1440)), d1 = addDays(it.date,Math.floor(it.e/1440)); L.push('DTSTART:'+d0.replace(/-/g,'')+'T'+toHHMM(it.s).replace(':','')+'00','DTEND:'+d1.replace(/-/g,'')+'T'+toHHMM(it.e).replace(':','')+'00'); }
    L.push('SUMMARY:'+icsEsc(it.title));
    if(it.desc) L.push('DESCRIPTION:'+icsEsc(it.desc));
    if(it.loc) L.push('LOCATION:'+icsEsc(it.loc));
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
function deadlineItems(ev){
  const items = ev.milestones.map(m => ({uid:m.id, allDay:true, date:addDays(ev.date,Number(m.offset)||0), title:(m.hard?'HARD DEADLINE: ':'')+m.title+' ('+ev.name+')', desc:[m.desc, 'Owner: '+(m.owner||'unassigned')].filter(Boolean).join('\n')}));
  ev.compliance.forEach(c => items.push({uid:c.id, allDay:true, date:addDays(ev.date,Number(c.offset)||0), title:'Paperwork due: '+c.item+' ('+ev.name+')', desc:'Responsible: '+(c.owner||'unassigned')}));
  const ds = toMin(ev.doors) == null ? 1140 : toMin(ev.doors); let de = toMin(ev.end) == null ? ds+180 : toMin(ev.end); if(de <= ds) de += 1440;
  items.push({uid:ev.id+'-show', allDay:false, date:ev.date, s:ds, e:de, title:ev.name, loc:[ev.venue,ev.address].filter(Boolean).join(', ')});
  ev.budget.filter(b => b.kind === 'cost' && isYMD(b.due) && b.status !== 'paid').forEach(b => items.push({uid:b.id, allDay:true, date:b.due, title:'Payment due: '+(b.item||b.cat)+(b.payee?' to '+b.payee:'')+' ('+ev.name+')', desc:'Amount: '+usd(hasAmt(b.actual)?b.actual:b.est)}));
  return items;
}
function audienceItems(ev,aud){
  const loc = [ev.venue,ev.address].filter(Boolean).join(', ');
  return daySchedule(ev).filter(x => aud === 'Internal' || (x.audiences||[]).includes(aud)).map(x => ({uid:x.id, date:ev.date, s:x.s, e:Math.max(x.e, x.s+5), title:(x.who? x.who+': ':'')+x.title+' ('+ev.name+')', loc}));
}

/* ---------- export: one document model, two formats ---------- */
function audLabel(a){ return (a||[]).join(', ') || 'Nobody yet'; }
function exportDoc(ev, which){
  const today = todayYMD(), sections = [];
  const facts = {kv:[['Date',fmtLong(ev.date)],['Venue',[ev.venue,ev.address].filter(Boolean).join(', ')||'To confirm'],['Doors',fmt12(toMin(ev.doors))],['Ends',fmt12(toMin(ev.end))]]};
  if(ev.priceAdv !== '' && ev.priceAdv != null || ev.priceDoor !== '' && ev.priceDoor != null) facts.kv.push(['Tickets', money(ev.priceAdv)+' advance / '+money(ev.priceDoor)+' door']);
  if(ev.host) facts.kv.push(['Host',ev.host]);
  if(ev.capacity || ev.target) facts.kv.push(['Headcount','Target '+(ev.target||'—')+' of '+(ev.capacity||'—')+' capacity']);
  const prog = {table:{head:['Time','Segment','Who'], widths:[.18,.5,.32], rows:programTimes(ev).map(p => [fmt12(p.s), p.title, p.who||''])}};
  const sched = {table:{head:['Time','Item','Who / track','Shown to'], widths:[.2,.4,.2,.2], rows:daySchedule(ev).map(x => [fmt12(x.s)+(x.kind==='setup'?' – '+fmt12(x.e):''), x.title, x.kind==='setup'?x.track:(x.who||'Program'), audLabel(x.audiences)])}};
  const msRows = ev.milestones.slice().sort((a,b) => (a.offset||0)-(b.offset||0)).map(m => [fmtD(addDays(ev.date,Number(m.offset)||0),true), tcode(m.offset), m.title+(m.hard?' (hard)':''), m.owner||'—', statusLabel(MS_STATUS,m.status)]);
  const msT = {table:{head:['Due','Days out','Task','Owner','Status'], widths:[.14,.12,.46,.14,.14], rows:msRows}};
  const cpT = {table:{head:['Item','Responsible','Due','Status','Files'], widths:[.4,.2,.14,.14,.12], rows:ev.compliance.map(c => [c.item, c.owner||'—', fmtD(addDays(ev.date,Number(c.offset)||0)), statusLabel(CP_STATUS,c.status), String((c.files||[]).length)])}};
  const eqT = {table:{head:['Item','Category','Qty','Source','Responsible','Status'], widths:[.3,.16,.07,.15,.16,.16], rows:ev.equipment.slice().sort((a,b) => EQ_CATS.indexOf(a.cat)-EQ_CATS.indexOf(b.cat)).map(e => [e.item, e.cat, String(e.qty), e.source, e.owner||'—', statusLabel(EQ_STATUS,e.status)])}};
  const pplT = (full) => ({table:{head:['Role','Name','Organization','Phone','Email'], widths:[.2,.22,.2,.16,.22], rows:ev.contacts.map(c => [c.role||'', c.name||'To confirm', c.org||'', (full||c.showPhone)?(c.phone||''):'', full?(c.email||''):''])}});
  const done = ev.milestones.filter(m => m.status==='done').length, ok = ev.compliance.filter(c => c.status==='approved').length, sec = ev.equipment.filter(e => e.status!=='needed').length;
  const status = {kv:[['Deadlines',done+' of '+ev.milestones.length+' done'],['Paperwork',ok+' of '+ev.compliance.length+' approved'],['Equipment',sec+' of '+ev.equipment.length+' secured or better']]};
  const issues = runChecks(ev).filter(x => x.level !== 'info').slice(0,10).map(x => x.text);
  const upcoming = ev.milestones.filter(m => m.status!=='done').map(m => Object.assign({d:addDays(ev.date,Number(m.offset)||0)},m)).filter(m => m.d >= today).sort((a,b) => a.d.localeCompare(b.d)).slice(0,8).map(m => fmtD(m.d,true)+': '+m.title+(m.owner?' ('+m.owner+')':''));
  const sub = fmtLong(ev.date)+(ev.venue?' · '+ev.venue:'');
  const B = budgetSummary(ev);
  const budKV = {kv:[['Budget', B.cap ? usd(B.cap) : 'Not set'],['Projected costs', usd(B.projCost)],['Paid so far', usd(B.paid)],['Still owed', usd(B.owed)],['Projected income', usd(B.projIncome)],['Projected net', usd(B.net)]].concat(B.cap ? [['Left to spend', usd(B.left)]] : []).concat(B.breakEven != null ? [['Break-even', B.breakEven+' tickets at '+usd(ev.priceAdv)]] : [])};
  const lines = kind => ev.budget.filter(b => b.kind === kind);
  const costT = {table:{head:['Category','Item','Paid to','Estimated','Actual','Paid','Due','Status'], widths:[.14,.2,.16,.1,.1,.1,.1,.1], rows:lines('cost').map(b => [b.cat, b.item, b.payee||'', usd(b.est,''), usd(b.actual,''), usd(b.paid,''), isYMD(b.due)?fmtD(b.due):'', statusLabel(COST_STATUS,b.status)])}};
  const incT = {table:{head:['Source','Item','Expected','Received','Status'], widths:[.2,.35,.15,.15,.15], rows:lines('income').map(b => [b.cat, b.item, usd(b.est,''), usd(b.actual,''), statusLabel(INCOME_STATUS,b.status)])}};
  const apT = {table:{head:['What','Approver','Status','Decided','Comment'], widths:[.3,.18,.16,.14,.22], rows:ev.approvals.map(a => [a.label, a.approver||'', statusLabel(APPROVAL_STATUS,a.status), a.decidedAt?fmtD(new Date(a.decidedAt).toISOString().slice(0,10)):'', a.comment||''])}};
  if(which === 'budget') return {title:ev.name, subtitle:sub+' · Budget', sections:[{h:'Summary', items:[budKV]},{h:'Costs', items:[costT]},{h:'Income', items:[incT]}]};
  if(which && which.startsWith('person:')){
    const who = which.slice(7), T = personTasks(ev, who);
    const secs = [{h:'', items:[{p:'Everything assigned to '+who+' for '+ev.name+', as of '+fmtLong(today)+'.'}]}];
    secs.push({h:'Deadlines', items:[{table:{head:['Due','Task','Status','Notes'], widths:[.16,.44,.14,.26], rows:T.deadlines.map(m => [fmtD(addDays(ev.date,Number(m.offset)||0),true), m.title+(m.hard?' (hard deadline)':''), statusLabel(MS_STATUS,m.status), [m.desc, (m.checklist||[]).filter(c=>!c.done).map(c=>'[ ] '+c.text).join('; ')].filter(Boolean).join(' ')])}}]});
    if(T.paperwork.length) secs.push({h:'Paperwork', items:[{table:{head:['Due','Item','Status'], widths:[.2,.6,.2], rows:T.paperwork.map(c => [fmtD(addDays(ev.date,Number(c.offset)||0),true), c.item, statusLabel(CP_STATUS,c.status)])}}]});
    if(T.equipment.length) secs.push({h:'Equipment', items:[{table:{head:['Item','Qty','Status'], widths:[.6,.15,.25], rows:T.equipment.map(q => [q.item, String(q.qty), statusLabel(EQ_STATUS,q.status)])}}]});
    if(T.program.length) secs.push({h:'On show day', items:[{table:{head:['Time','Segment'], widths:[.25,.75], rows:T.program.map(p => [fmt12(p.s), p.title+' ('+p.dur+' min)'])}}]});
    return {title:ev.name+': '+who, subtitle:sub+' · Tasks for '+who, sections:secs};
  }
  if(which === 'summary'){
    sections.push({h:'At a glance', items:[facts].concat(ev.about?[{p:ev.about}]:[])});
    if(programTimes(ev).length) sections.push({h:'Program', items:[prog]});
    sections.push({h:'Who’s involved', items:[{table:{head:['Role','Name','Organization'], widths:[.34,.33,.33], rows:ev.contacts.filter(c=>c.name).map(c => [c.role||'', c.name, c.org||''])}}]});
    sections.push({h:'Where we stand', items:[status]});
    if(ev.budget.length || B.cap) sections.push({h:'Budget', items:[budKV]});
    if(ev.approvals.length) sections.push({h:'Approvals', items:[apT]});
    if(upcoming.length) sections.push({h:'Coming up', items:[{list:upcoming}]});
    if(issues.length) sections.push({h:'Open issues', items:[{list:issues}]});
    return {title:ev.name||'Event', subtitle:sub+' · Event summary', sections};
  }
  if(which === 'milestones'){ sections.push({h:'Deadlines', items:[msT]}); const withDesc = ev.milestones.filter(m => m.desc || (m.checklist||[]).length); if(withDesc.length) sections.push({h:'Details', items:withDesc.map(m => ({p:m.title+': '+(m.desc||'')+((m.checklist||[]).length?' Checklist: '+m.checklist.map(c => (c.done?'[x] ':'[ ] ')+c.text).join('; '):'')}))}); return {title:ev.name, subtitle:sub+' · Deadlines', sections}; }
  if(which === 'show') return {title:ev.name, subtitle:sub+' · Run of show', sections:[{h:'Show day schedule', items:[sched]}]};
  if(which === 'equipment') return {title:ev.name, subtitle:sub+' · Equipment', sections:[{h:'Equipment list', items:[status.kv?{kv:[status.kv[2]]}:null, eqT].filter(Boolean)}]};
  if(which === 'people') return {title:ev.name, subtitle:sub+' · Contacts', sections:[{h:'People', items:[pplT(true)]}]};
  if(which === 'layout'){ const secs = layoutSections(ev); return {title:ev.name, subtitle:sub+' · Layout', sections:secs.length ? secs : [{h:'Layout', items:[{p:'No layout yet. On the Layout tab, build the room or upload a floor plan.'}]}]}; }
  if(which === 'compliance') return {title:ev.name, subtitle:sub+' · Paperwork', sections:[{h:ev.kind==='venue'?'What promoters owe the venue':'Permits and paperwork', items:[cpT]}]};
  if(which && which.startsWith('share:')){
    const a = which.slice(6);
    const rows = daySchedule(ev).filter(x => a==='Internal' || (x.audiences||[]).includes(a)).map(x => [fmt12(x.s)+(x.kind==='setup'?' – '+fmt12(x.e):''), (x.who?x.who+' · ':'')+x.title]);
    const ppl = ev.contacts.filter(c => a==='Internal' || (c.audiences||[]).includes(a)).map(c => [c.role||'', c.name||'To confirm', (a==='Internal'||c.showPhone)?(c.phone||''):'']);
    return {title:ev.name, subtitle:sub+' · '+a+' itinerary', sections:[{h:'Details',items:[facts].concat(ev.about?[{p:ev.about}]:[])},{h:'Your schedule',items:[{table:{head:['Time','What'],widths:[.28,.72],rows}}]},{h:'Who to contact',items:[{table:{head:['Role','Name','Phone'],widths:[.34,.36,.3],rows:ppl}}]}]};
  }
  // full plan
  sections.push({h:'Overview', items:[facts].concat(ev.about?[{p:ev.about}]:[]).concat([status])});
  layoutSections(ev).forEach(x => sections.push(x));   // [final] the layout comes right after the overview
  sections.push({h:'Deadlines', items:[msT]});
  sections.push({h:'Show day schedule', items:[sched]});
  if(ev.equipment.length) sections.push({h:'Equipment', items:[eqT]});
  sections.push({h:'People', items:[pplT(true)]});
  if(ev.compliance.length) sections.push({h:'Permits and paperwork', items:[cpT]});
  if(ev.budget.length || B.cap) sections.push({h:'Budget', items:[budKV, costT, incT]});
  if(ev.approvals.length) sections.push({h:'Approvals', items:[apT]});
  if(ev.wrapup && ev.wrapup.completedAt) sections.push({h:'Wrap-up', items:[{kv:[['Attendance', String(ev.wrapup.attendance||'—')],['Rating', ev.wrapup.rating ? ev.wrapup.rating+' of 5' : '—']]}].concat(ev.wrapup.worked?[{p:'What worked: '+ev.wrapup.worked}]:[]).concat(ev.wrapup.change?[{p:'Change next time: '+ev.wrapup.change}]:[])});
  if(ev.kind === 'venue' && ev.houseRules.length) sections.push({h:'House rules', items:[{list:ev.houseRules}]});
  if(issues.length) sections.push({h:'Open issues', items:[{list:issues}]});
  return {title:ev.name, subtitle:sub+' · Master event plan', sections};
}
function docFromText(title, subtitle, text){
  const sections = []; let cur = null;
  String(text||'').split(/\r?\n/).forEach(raw => {
    const line = raw.replace(/\*\*/g,'').replace(/^#+\s*/,'').trimEnd();
    if(!line.trim()) return;
    const isBullet = /^\s*[-•*]\s+/.test(line);
    const isHead = !isBullet && (/^#/.test(raw) || (line.length < 48 && !/[.,;]$/.test(line) && /^[A-Z0-9]/.test(line) && line.split(' ').length <= 7));
    if(isHead){ cur = {h:line.replace(/:$/,''), items:[]}; sections.push(cur); return; }
    if(!cur){ cur = {h:'', items:[]}; sections.push(cur); }
    if(isBullet){ const last = cur.items[cur.items.length-1]; const t = line.replace(/^\s*[-•*]\s+/,''); if(last && last.list) last.list.push(t); else cur.items.push({list:[t]}); }
    else cur.items.push({p:line.trim()});
  });
  return {title, subtitle, sections};
}
function toWord(doc){
  const e = esc;
  let h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+e(doc.title)+'</title>';
  h += '<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1c1827}h1{font-size:20pt;margin:0 0 2pt}h2{font-size:13pt;margin:16pt 0 6pt;border-bottom:1px solid #999;padding-bottom:2pt}.sub{color:#666;font-size:10pt;margin:0 0 10pt}table{border-collapse:collapse;width:100%;margin:4pt 0 8pt}th,td{border:1px solid #bbb;padding:4pt 6pt;font-size:10pt;vertical-align:top;text-align:left}th{background:#ece9f3}td.k{font-weight:bold;width:28%;background:#f6f5f9}</style></head><body>';
  h += '<h1>'+e(doc.title)+'</h1><p class="sub">'+e(doc.subtitle||'')+'</p>';
  doc.sections.forEach(s => {
    if(s.h) h += '<h2>'+e(s.h)+'</h2>';
    s.items.forEach(it => {
      if(it.figure) h += '<p><i>'+e(it.wordNote||'')+'</i></p>';
      if(it.p) h += '<p>'+e(it.p)+'</p>';
      if(it.list) h += '<ul>'+it.list.map(x => '<li>'+e(x)+'</li>').join('')+'</ul>';
      if(it.kv) h += '<table>'+it.kv.map(([k,v]) => '<tr><td class="k">'+e(k)+'</td><td>'+e(v)+'</td></tr>').join('')+'</table>';
      if(it.table) h += '<table><tr>'+it.table.head.map(x => '<th>'+e(x)+'</th>').join('')+'</tr>'+(it.table.rows.length?it.table.rows.map(r => '<tr>'+r.map(x => '<td>'+e(x)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+it.table.head.length+'">None yet</td></tr>')+'</table>';
    });
  });
  return h + '<p class="sub" style="margin-top:16pt">Made with MagicShow · Blackmagic Media</p></body></html>';
}
function pdfSafe(s){ return String(s==null?'':s).replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[−–—]/g,'-').replace(/×/g,'x').replace(/…/g,'...').replace(/★|◆|✓|✕|→|←/g,'').replace(/[^\x00-\xFF]/g,''); }
function toPDF(doc){
  const J = window.jspdf && window.jspdf.jsPDF; if(!J) return null;
  const pdf = new J({unit:'pt', format:'letter'}); const W = 612, H = 792, M = 54, CW = W - 2*M; let y = M;
  const ink = [28,24,39], grey = [110,104,128], accent = [90,59,194];
  const ensure = h => { if(y + h > H - M){ pdf.addPage(); y = M; return true; } return false; };
  const text = (t, x, size, style, color, maxW) => { pdf.setFont('helvetica', style||'normal'); pdf.setFontSize(size); pdf.setTextColor.apply(pdf, color||ink); const lines = pdf.splitTextToSize(pdfSafe(t), maxW||CW); return lines; };
  let lines = text(doc.title, M, 20, 'bold'); lines.forEach(l => { pdf.text(l, M, y+16); y += 24; });
  lines = text(doc.subtitle||'', M, 10, 'normal', grey); lines.forEach(l => { pdf.text(l, M, y+6); y += 14; });
  y += 6; pdf.setDrawColor.apply(pdf, accent); pdf.setLineWidth(2); pdf.line(M, y, M+60, y); y += 14;
  doc.sections.forEach(s => {
    if(s.h){ const f = s.items[0] && s.items[0].figure ? s.items[0] : null; ensure(f ? Math.min(H - 2*M, 44 + figureHeight(f, CW, Math.min(470, H - 2*M - 60))) : 40); y += 8; const hl = text(s.h, M, 13, 'bold'); pdf.text(hl[0], M, y+10); y += 16; pdf.setDrawColor(210,206,222); pdf.setLineWidth(.6); pdf.line(M, y, W-M, y); y += 10; }
    s.items.forEach(it => {
      if(it.figure){ const maxH = Math.min(470, H - 2*M - 60); ensure(figureHeight(it, CW, maxH)); y += drawFigure(pdf, it, M, y, CW, maxH) + 6; }
      if(it.p){ const ls = text(it.p, M, 10.5); ls.forEach(l => { ensure(14); pdf.text(l, M, y+10); y += 14; }); y += 4; }
      if(it.list){ it.list.forEach(x => { const ls = text(x, M+14, 10.5, 'normal', ink, CW-14); ls.forEach((l,i) => { ensure(14); if(i===0) pdf.text('•', M+3, y+10); pdf.text(l, M+14, y+10); y += 14; }); y += 2; }); y += 4; }
      if(it.kv){ it.kv.forEach(([k,v]) => { const kl = text(k, M, 10, 'bold', ink, 120); const vl = text(v, M+130, 10.5, 'normal', ink, CW-130); const h = Math.max(kl.length, vl.length)*14; ensure(h); pdf.setFont('helvetica','bold'); pdf.setFontSize(10); pdf.setTextColor.apply(pdf, grey); kl.forEach((l,i) => pdf.text(l, M, y+10+i*14)); pdf.setFont('helvetica','normal'); pdf.setFontSize(10.5); pdf.setTextColor.apply(pdf, ink); vl.forEach((l,i) => pdf.text(l, M+130, y+10+i*14)); y += h + 2; }); y += 6; }
      if(it.table){
        const t = it.table, ws = (t.widths || t.head.map(() => 1/t.head.length)).map(f => f*CW);
        const drawHead = () => { ensure(22); pdf.setFillColor(236,233,243); pdf.rect(M, y, CW, 18, 'F'); let x = M; pdf.setFont('helvetica','bold'); pdf.setFontSize(9); pdf.setTextColor.apply(pdf, grey); t.head.forEach((c,i) => { pdf.text(pdfSafe(c).toUpperCase(), x+4, y+12); x += ws[i]; }); y += 20; };
        drawHead();
        const rows = t.rows.length ? t.rows : [['None yet'].concat(t.head.slice(1).map(() => ''))];
        rows.forEach(r => {
          pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5);
          const cells = r.map((c,i) => pdf.splitTextToSize(pdfSafe(c), ws[i]-8));
          const h = Math.max(...cells.map(c => c.length))*12 + 6;
          if(ensure(h)) drawHead();
          pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); pdf.setTextColor.apply(pdf, ink);
          let x = M; cells.forEach((c,i) => { c.forEach((l,j) => pdf.text(l, x+4, y+11+j*12)); x += ws[i]; });
          y += h; pdf.setDrawColor(225,222,233); pdf.setLineWidth(.5); pdf.line(M, y, W-M, y);
        });
        y += 10;
      }
    });
  });
  const n = pdf.getNumberOfPages();
  for(let i=1;i<=n;i++){ pdf.setPage(i); pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); pdf.setTextColor.apply(pdf, grey); pdf.text(pdfSafe(doc.title)+' · page '+i+' of '+n, M, H-28); pdf.text('MagicShow · Blackmagic Media', W-M, H-28, {align:'right'}); }
  return pdf.output('arraybuffer');
}
async function exportAs(doc, fmt, base){
  if(fmt === 'pdf'){ await prepFigures(doc); const buf = toPDF(doc); if(!buf){ toast('The PDF maker didn’t load in this view. Try Word instead.'); return; } await saveFile(base+'.pdf', buf); }
  else await saveFile(base+'.doc', toWord(doc));
}
