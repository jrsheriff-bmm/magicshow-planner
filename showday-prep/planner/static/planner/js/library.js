/* ==========================================================================
   library.js — templates you build yourself, picking pieces, and per-person
   downloads.

   • Your templates: any event can be saved as a template. A saved template is
     {id, name, desc, data, createdAt, updatedAt}, where data looks like an
     event without dates, statuses, files or money actually spent.
   • Add pieces: pull chosen deadlines, setup items, program segments,
     paperwork, equipment or budget lines from any template or event into
     the one you're working on. Duplicates are skipped.
   • Download by person: each owner's deadlines, paperwork, gear and set times.
   ========================================================================== */

const PIECE_SECTIONS = [
  ['milestones','Deadlines', m => m.title, m => tcode(m.offset)+(m.hard?' · hard':'')],
  ['setup','Setup & load-in', s => s.title, s => fmt12(toMin(s.start))+' – '+fmt12(toMin(s.end))+' · '+s.track],
  ['program','Program', p => p.title, p => (p.dur||0)+' min'],
  ['compliance','Paperwork', c => c.item, c => tcode(c.offset)],
  ['equipment','Equipment', e => e.item, e => e.qty+' × · '+e.cat],
  ['budget','Budget lines', b => b.item || b.cat, b => (b.kind === 'income' ? 'Income' : 'Cost')+' · '+b.cat+(hasAmt(b.est)?' · '+usd(b.est):'')]
];
function sectionList(obj, key){ return key === 'program' ? ((obj.program && obj.program.items) || []) : (obj[key] || []); }

/* Turn an event into template data: keep the plan, drop what only applies to that one show. */
function templateFromEvent(ev, keepNames){
  const d = clone(ev);
  ['id','name','date','createdAt','updatedAt','aiSummary','approvals','wrapup','venue','address','series'].forEach(k => delete d[k]);
  const fresh = x => { x.id = uid(); return x; };
  d.milestones.forEach(m => { fresh(m); m.status = 'todo'; m.doneAt = ''; m.checklist.forEach(c => c.done = false); if(!keepNames){ m.owner = ''; } delete m.ownerId; });
  d.setup.forEach(fresh); d.program.items.forEach(p => { fresh(p); if(!keepNames) p.who = ''; });
  d.compliance.forEach(c => { fresh(c); c.status = 'needed'; c.expires = ''; c.files = []; if(!keepNames) c.owner = ''; delete c.ownerId; });
  d.equipment.forEach(e => { fresh(e); e.status = 'needed'; if(!keepNames) e.owner = ''; delete e.ownerId; });
  d.budget.forEach(b => { fresh(b); b.actual = ''; b.paid = ''; b.due = ''; b.files = []; b.status = b.kind === 'income' ? 'expected' : 'estimated'; if(!keepNames){ b.payee = ''; } delete b.payeeId; });
  d.contacts = keepNames ? d.contacts.map(c => Object.assign(fresh(c), {personId:c.personId||''})) : d.contacts.filter(c => c.role).map(c => ({id:uid(), role:c.role, name:'', org:'', phone:'', email:'', audiences:c.audiences||['Internal'], showPhone:false, invoiceUrl:'', remind:true, team:!!c.team}));
  d.layout.pins = []; d.layout.image = ''; d.layout.pieces.forEach(fresh);
  return d;
}
/* Template data → a new event (fresh ids, so two events never share a line). */
function eventFromTemplateData(data){
  const d = clone(data);
  ['milestones','setup','compliance','equipment','budget','contacts'].forEach(k => (d[k]||[]).forEach(x => x.id = uid()));
  ((d.program && d.program.items) || []).forEach(x => x.id = uid());
  if(d.layout){ (d.layout.pieces||[]).forEach(x => x.id = uid()); d.layout.pins = []; }
  return d;
}
function builtinData(key){ const t = TEMPLATES.find(x => x.key === key); return t ? buildTemplate(t) : null; }
function userTemplate(id){ return S.templates.find(t => t.id === id) || null; }
function tplCounts(d){ return (d.milestones||[]).length+' deadlines · '+(d.equipment||[]).length+' gear · '+(d.budget||[]).length+' budget lines'; }

/* ---------- Templates page ---------- */
function libraryHTML(){
  let h = '<div class="head"><div><div class="eyebrow">Starting points</div><h1>Templates</h1><p class="muted" style="margin-top:6px;max-width:64ch">Built-in templates cover common event types. Save any event as your own template, copy a built-in one to change it, or start empty and pick just the pieces you want.</p></div><button class="btn primary" data-act="newEvent" data-tpl="pick">Start empty and pick pieces</button></div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>Your templates</h2><p class="hint">Click a name to rename it. To change what’s inside, create an event from it, edit that event, then use <b>Save as template → Replace</b>.</p></div></div>';
  if(!S.templates.length) h += '<p class="muted">None yet. Open any event and click <b>Save as template</b>, or copy a built-in one below.</p>';
  else {
    h += '<div class="tablewrap"><table style="min-width:820px"><thead><tr><th style="width:30%">Name</th><th style="width:30%">Description</th><th>What’s in it</th><th>Updated</th><th></th></tr></thead><tbody>';
    S.templates.forEach(t => {
      h += '<tr><td><input data-tplf="'+t.id+'|name" value="'+esc(t.name)+'" aria-label="Template name"'+ro()+'></td><td><input data-tplf="'+t.id+'|desc" value="'+esc(t.desc||'')+'" placeholder="What is it for?" aria-label="Description"'+ro()+'></td><td class="hint">'+tplCounts(t.data||{})+(t.workspace?'<br>Saved in '+esc(t.workspace):'')+'</td><td class="mono hint">'+(t.updatedAt?fmtD(new Date(t.updatedAt).toISOString().slice(0,10)):'')+'</td>';
      h += '<td style="white-space:nowrap"><button class="btn small primary" data-act="newEvent" data-tpl="lib:'+t.id+'">Use</button><button class="btn small ghost" data-act="libDup" data-id="'+t.id+'"'+ro()+'>Duplicate</button>'+(S.confirmTpl===t.id?'<button class="btn small danger" data-act="libDel" data-id="'+t.id+'">Click again to delete</button>':'<button class="btn small ghost danger" data-act="libAskDel" data-id="'+t.id+'"'+ro()+'>Delete</button>')+'</td></tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div><div class="panel"><div class="panel-head"><div><h2>Built-in templates</h2><p class="hint">These can’t be edited, but you can copy one into Your templates and change it from there.</p></div></div><div class="tpl">';
  TEMPLATES.forEach(t => { h += '<div class="tplcard"><b>'+esc(t.label)+'</b><span class="hint">'+esc(t.scale)+'</span><span class="muted" style="font-size:13px">'+esc(t.desc)+'</span><span class="hint">'+t.ms.length+' deadlines · '+t.eq.length+' gear · '+(t.bud||BUD_DEFAULT).length+' budget lines</span><span class="row" style="margin-top:4px"><button class="btn small primary" data-act="newEvent" data-tpl="'+t.key+'">Use</button><button class="btn small ghost" data-act="libCopyBuiltin" data-key="'+t.key+'"'+ro()+'>Copy to my templates</button></span></div>'; });
  return h + '</div></div>';
}

/* ---------- Save as template ---------- */
MODALS.saveTpl = (ev, M) => {
  let h = '<div><h2 id="mt">Save as template</h2><p class="hint">Keeps the deadlines (as days before show), run of show, paperwork list, equipment, budget lines and layout. Statuses, files, dates and amounts actually spent are left out.</p></div>';
  h += '<div class="facts"><div class="field wide"><label for="tName">Template name</label><input id="tName" value="'+esc(ev.series || ev.name || '')+'"></div><div class="field wide"><label for="tDesc">Description (optional)</label><input id="tDesc" placeholder="e.g. Our standard monthly showcase"></div></div>';
  h += '<fieldset class="opts" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">Save as</legend><label class="opt"><input type="radio" name="tMode" value="new" checked><span><b>A new template</b></span></label>';
  if(S.templates.length) h += '<label class="opt"><input type="radio" name="tMode" value="replace"><span><b>Replace one of your templates</b><br><select id="tReplace" class="inline-in" style="margin-top:6px">'+S.templates.map(t => '<option value="'+t.id+'">'+esc(t.name)+'</option>').join('')+'</select></span></label>';
  h += '</fieldset><label class="toggle"><input type="checkbox" id="tKeep"> Keep names, owners and contact details (turn off to keep only the roles)</label>';
  h += '<p class="hint" id="tErr" style="color:var(--crit)"></p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doSaveTpl"'+ro()+'>Save template</button></div>';
  return h;
};

/* ---------- Add pieces from templates or other events ---------- */
function pieceSource(src){
  if(!src) return null;
  if(src.startsWith('tpl:')) return builtinData(src.slice(4));
  if(src.startsWith('lib:')){ const t = userTemplate(src.slice(4)); return t ? t.data : null; }
  if(src.startsWith('ev:')) return S.events[src.slice(3)] || null;
  return null;
}
function pieceSourceOptions(cur, skipEventId){
  let o = '<optgroup label="Built-in templates">'+TEMPLATES.map(t => '<option value="tpl:'+t.key+'"'+(cur==='tpl:'+t.key?' selected':'')+'>'+esc(t.label)+'</option>').join('')+'</optgroup>';
  if(S.templates.length) o += '<optgroup label="Your templates">'+S.templates.map(t => '<option value="lib:'+t.id+'"'+(cur==='lib:'+t.id?' selected':'')+'>'+esc(t.name)+'</option>').join('')+'</optgroup>';
  const evs = sortedEvents().filter(e => e.id !== skipEventId);
  if(evs.length) o += '<optgroup label="Other events">'+evs.map(e => '<option value="ev:'+e.id+'"'+(cur==='ev:'+e.id?' selected':'')+'>'+esc(e.name)+'</option>').join('')+'</optgroup>';
  return o;
}
MODALS.pieces = (ev, M) => {
  if(!M.cache || M.cache.src !== M.src) M.cache = {src:M.src, data:pieceSource(M.src)};   // keep built-in ids stable while the modal is open
  const src = M.cache.data;
  let h = '<div><h2 id="mt">Add pieces to '+esc(ev.name||'this event')+'</h2><p class="hint">Pick a source, tick what you want, and it’s copied in. Things this event already has are greyed out. Deadlines keep their days-before-show, so they land on the right dates.</p></div>';
  h += '<div class="facts two"><div class="field"><label for="pcSrc">Copy from</label><select id="pcSrc">'+pieceSourceOptions(M.src, ev.id)+'</select></div><div class="field"><label for="pcSec">Show</label><select id="pcSec"><option value="">Everything</option>'+PIECE_SECTIONS.map(([k,l]) => '<option value="'+k+'"'+(M.section===k?' selected':'')+'>'+l+'</option>').join('')+'</select></div></div>';
  if(!src) return h + '<p class="muted">Pick where to copy from.</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button></div>';
  h += '<div class="pieces">';
  PIECE_SECTIONS.filter(([k]) => !M.section || M.section === k).forEach(([k, label, title, sub]) => {
    const items = sectionList(src, k); if(!items.length) return;
    const have = new Set(sectionList(ev, k).map(x => norm(title(x))));
    h += '<fieldset class="opts" style="border:0;padding:0;margin:0 0 10px"><legend class="eyebrow spread" style="width:100%;margin-bottom:6px"><span>'+label+' ('+items.length+')</span><button class="btn small ghost" data-act="pcAll" data-sec="'+k+'">Select all new</button></legend>';
    items.forEach((x, i) => { const dup = have.has(norm(title(x))); h += '<label class="opt compact'+(dup?' dim':'')+'"><input type="checkbox" name="pc" value="'+k+'|'+i+'"'+(dup?' disabled':'')+'><span><b>'+esc(title(x)||'Untitled')+'</b> <span class="hint">· '+esc(sub(x))+(dup?' · already in this event':'')+'</span></span></label>'; });
    h += '</fieldset>';
  });
  h += '</div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doAddPieces"'+ro()+'>Add selected</button></div>';
  return h;
};
WIDE_MODALS.add('pieces');

/* ---------- Download by person ---------- */
MODALS.byPerson = (ev, M) => {
  const owners = taskOwners(ev);
  let h = '<div><h2 id="mt">Download deadlines by person</h2><p class="hint">Each person’s deadlines, paperwork, equipment and set times, as a PDF or Word file they can keep. '+(store.links?'Each person also has a private “My tasks” link (see People → Send page) where they can mark things done.':'On the live site each person also gets a private “My tasks” link where they can mark things done.')+'</p></div>';
  if(!owners.length) return h + '<p class="muted">Nobody owns a task yet. Add owners on the Deadlines tab.</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Close</button></div>';
  h += '<fieldset class="opts" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">What to download</legend>';
  h += '<label class="opt"><input type="radio" name="bpMode" value="one" checked><span><b>One person</b><br><select id="bpWho" class="inline-in" style="margin-top:6px">'+owners.map(o => '<option value="'+esc(o.name)+'">'+esc(o.name)+' ('+o.count+')</option>').join('')+'</select></span></label>';
  h += '<label class="opt"><input type="radio" name="bpMode" value="each"><span><b>Everyone, one file each</b><br><span class="hint">'+owners.length+' files, ready to send to each person.</span></span></label>';
  h += '<label class="opt"><input type="radio" name="bpMode" value="all"><span><b>One file with a section per person</b><br><span class="hint">For the event lead or a team meeting.</span></span></label></fieldset>';
  h += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-act="doPersonExport" data-fmt="word">Download Word</button><button class="btn primary" data-act="doPersonExport" data-fmt="pdf">Download PDF</button></div>';
  return h;
};
function everyoneDoc(ev){
  const sections = [{h:'', items:[{p:'Every task by owner for '+ev.name+', as of '+fmtLong(todayYMD())+'.'}]}];
  taskOwners(ev).forEach(o => { const d = exportDoc(ev, 'person:'+o.name); d.sections.slice(1).forEach((s,i) => sections.push({h:o.name+' · '+s.h, items:s.items})); });
  return {title:ev.name+': tasks by person', subtitle:fmtLong(ev.date)+(ev.venue?' · '+ev.venue:''), sections};
}

Object.assign(actions, {
  library(){ S.view = 'library'; S.modal = null; S.drawer = null; S.confirmTpl = null; render(); window.scrollTo(0,0); },
  saveAsTemplate(){ S.modal = {type:'saveTpl'}; render(); setTimeout(() => { const i = $('#tName'); if(i){ i.focus(); i.select(); } }, 0); },
  async doSaveTpl(){
    const ev = curEv(), name = $('#tName').value.trim(), err = $('#tErr');
    if(!name){ err.textContent = 'Give the template a name.'; return; }
    const mode = (document.querySelector('input[name="tMode"]:checked')||{}).value;
    const existing = mode === 'replace' ? userTemplate($('#tReplace').value) : null;
    const t = {id: existing ? existing.id : uid(), name, desc: $('#tDesc').value.trim() || (existing ? existing.desc : ''), data: templateFromEvent(ev, $('#tKeep').checked), fromEvent: ev.name, createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now()};
    await saveTemplate(t);
    S.modal = null; render(); toast(existing ? 'Template “'+name+'” replaced.' : 'Saved “'+name+'”. It’s under Templates and in the New event list.');
  },
  libAskDel(el){ S.confirmTpl = el.dataset.id; render(); },
  async libDel(el){ S.confirmTpl = null; S.templates = S.templates.filter(t => t.id !== el.dataset.id); render(); try { await store.deleteTemplate(el.dataset.id); } catch(e){ writeFailed(e); } },
  async libDup(el){ const t = userTemplate(el.dataset.id); if(!t) return; await saveTemplate({id:uid(), name:t.name+' (copy)', desc:t.desc||'', data:eventFromTemplateData(t.data), createdAt:Date.now(), updatedAt:Date.now()}); render(); toast('Duplicated. Rename it in the table.'); },
  async libCopyBuiltin(el){ const T = TEMPLATES.find(x => x.key === el.dataset.key); if(!T) return; await saveTemplate({id:uid(), name:T.label+' (my version)', desc:T.desc, data:buildTemplate(T), createdAt:Date.now(), updatedAt:Date.now()}); render(); toast('Copied to Your templates.'); },
  addFrom(el){ S.modal = {type:'pieces', section: el.dataset.section || '', src: S.lastPieceSrc || (S.templates[0] ? 'lib:'+S.templates[0].id : 'tpl:showcase')}; render(); },
  pcAll(el){ document.querySelectorAll('input[name="pc"]:not(:disabled)').forEach(i => { if(i.value.startsWith(el.dataset.sec+'|')) i.checked = true; }); },
  doAddPieces(){
    const ev = curEv(), M = S.modal, src = M.cache && M.cache.data; if(!src) return;
    const picked = [...document.querySelectorAll('input[name="pc"]:checked')].map(i => i.value.split('|'));
    if(!picked.length){ toast('Tick at least one item.'); return; }
    const n = {};
    picked.forEach(([k, i]) => {
      const x = clone(sectionList(src, k)[Number(i)]); if(!x) return;
      x.id = uid();
      if(k === 'milestones'){ x.status = 'todo'; x.doneAt = ''; (x.checklist||[]).forEach(c => { c.id = uid(); c.done = false; }); }
      if(k === 'compliance'){ x.status = 'needed'; x.files = []; x.expires = ''; }
      if(k === 'equipment') x.status = 'needed';
      if(k === 'budget'){ x.actual = ''; x.paid = ''; x.due = ''; x.files = []; x.status = x.kind === 'income' ? 'expected' : 'estimated'; }
      sectionList(ev, k).push(x); n[k] = (n[k]||0) + 1;
    });
    S.lastPieceSrc = M.src; S.modal = null; touch(ev);
    toast('Added '+Object.entries(n).map(([k,v]) => v+' '+PIECE_SECTIONS.find(s => s[0] === k)[1].toLowerCase()).join(', ')+'.');
  },
  personExport(){ S.modal = {type:'byPerson'}; render(); },
  async doPersonExport(el){
    const ev = curEv(), fmt = el.dataset.fmt, mode = (document.querySelector('input[name="bpMode"]:checked')||{}).value || 'one';
    const who = mode === 'one' ? $('#bpWho').value : ''; S.modal = null; render();
    if(mode === 'one'){ await exportAs(exportDoc(ev, 'person:'+who), fmt, slug(ev.name)+'-'+slug(who)+'-tasks'); }
    else if(mode === 'all') await exportAs(everyoneDoc(ev), fmt, slug(ev.name)+'-tasks-by-person');
    else { const owners = taskOwners(ev); for(const o of owners) await exportAs(exportDoc(ev, 'person:'+o.name), fmt, slug(ev.name)+'-'+slug(o.name)+'-tasks'); toast('Saved '+owners.length+' files.'); }
  }
});

async function saveTemplate(t){
  const i = S.templates.findIndex(x => x.id === t.id);
  if(i >= 0) S.templates[i] = t; else S.templates.push(t);
  S.templates.sort((a,b) => String(a.name).localeCompare(String(b.name)));
  try { await store.saveTemplate(t); } catch(e){ writeFailed(e); }
}
document.addEventListener('change', e => {
  const el = e.target;
  if(el.id === 'pcSrc' && S.modal){ S.modal.src = el.value; render(); return; }
  if(el.id === 'pcSec' && S.modal){ S.modal.section = el.value; render(); return; }
  if(el.dataset && el.dataset.tplf && !S.readOnly){ const [id, k] = el.dataset.tplf.split('|'); const t = userTemplate(id); if(t){ t[k] = el.value; t.updatedAt = Date.now(); saveTemplate(t); } }
});
