/* ==========================================================================
   views.js — draws every screen.

   render() rebuilds the page from S (the state in core.js). Each tab has its own
   function: overviewHTML, milestonesHTML (Deadlines), showHTML (Run of show),
   equipmentHTML, peopleHTML, complianceHTML (Paperwork), layoutHTML, shareHTML,
   calendarHTML, checksHTML. Side panels (drawers) and pop-ups (modals) are at
   the bottom. Newer tabs and pop-ups live in their own files and register
   themselves: TAB_VIEWS.budget = budgetHTML (budget.js), MODALS.approval = …
   (approvals.js), and so on. Adding a feature = adding a file, not editing this one.

   Buttons don't run code directly. They carry data-act="something", and
   actions.js looks up what "something" does. Inputs carry data-edit="list|id|field"
   so actions.js knows which value to change when you type.
   ========================================================================== */
/* ---------- render ---------- */
/* [final] Keeping your place.
   render() rebuilds the whole page, which on its own would snap every scrolling area
   back to its start: a wide table jumps back to its left edge, the side menu and an open
   side panel jump to the top. So before rebuilding we note where each scrolling area is,
   and afterwards put each one back. An area is only put back when you're still on the
   same screen (same tab, same side panel, same pop-up); a new screen starts at its start.
   The box or button you were on keeps the keyboard focus too. */
let lastZones = {};
function zoneKeys(){
  const d = S.drawer, ev = S.view === 'event';
  return { rail:'rail',
    main:[S.view, ev ? S.eventId : '', ev ? S.tab : '', ev && S.tab === 'show' ? S.showView : '', ev && S.tab === 'layout' ? S.layoutView : '', ev && S.tab === 'milestones' ? S.msView : '', S.view === 'reports' ? S.reportTab : ''].join('|'),
    drawer: d ? (d === 'notes' ? 'notes' : d.type+':'+d.id) : '',
    modal: S.modal ? S.modal.type+':'+(S.modal.id||'') : '' };
}
function zoneOf(el){ return el.closest('.drawer') ? 'drawer' : el.closest('.scrim') ? 'modal' : el.closest('.rail') ? 'rail' : 'main'; }
function scrollSig(el){ return el.tagName+'.'+(typeof el.className === 'string' ? el.className : ''); }
function saveScrolls(app){
  const seen = {}, out = [];
  app.querySelectorAll('*').forEach(el => {
    const sig = scrollSig(el), n = seen[sig] = (seen[sig]||0) + 1;
    if(el.scrollLeft || el.scrollTop) out.push({sig, n, left:el.scrollLeft, top:el.scrollTop, zone:zoneOf(el)});
  });
  return out;
}
function restoreScrolls(app, saved, now){
  if(!saved.length) return;
  const seen = {}, want = {};
  saved.forEach(x => { if(lastZones[x.zone] === now[x.zone]) want[x.sig+'#'+x.n] = x; });
  app.querySelectorAll('*').forEach(el => {
    const sig = scrollSig(el), n = seen[sig] = (seen[sig]||0) + 1, x = want[sig+'#'+n];
    if(x){ if(x.left) el.scrollLeft = x.left; if(x.top) el.scrollTop = x.top; }
  });
}
function focusKey(el){
  if(!el || !el.closest || !el.closest('#app')) return null;
  const q = v => '"'+String(v).replace(/["\\]/g,'\\$&')+'"', d = el.dataset || {};
  if(el.id) return el.id === 'noteText' ? null : '[id='+q(el.id)+']';
  if(d.edit) return '[data-edit='+q(d.edit)+']';
  if(d.grip) return '[data-grip='+q(d.grip)+']';
  if(d.person) return '[data-person='+q(d.person)+']';
  if(d.hour) return '[data-hour='+q(d.hour)+']';
  if(d.sub) return '[data-sub='+q(d.sub)+']';
  if(d.wrap) return '[data-wrap='+q(d.wrap)+']';
  if(d.rate) return '[data-rate='+q(d.rate)+']';
  if(d.orgset) return '[data-orgset='+q(d.orgset)+']';
  if(d.act && d.id) return '[data-act='+q(d.act)+'][data-id='+q(d.id)+']'+(d.dir ? '[data-dir='+q(d.dir)+']' : '')+(d.list ? '[data-list='+q(d.list)+']' : '')+(d.aud ? '[data-aud='+q(d.aud)+']' : '');
  return null;
}
/* Typing in a box and then pressing Tab, or clicking a button, tells the browser two things
   at once: "this box changed" and "move on to the next thing". If the page were rebuilt in
   between, the move would be lost: Tab would land nowhere, and the click would be swallowed
   so you'd have to click twice. renderLater() waits a moment, until the move has happened
   and the mouse button or finger is up, and only then rebuilds. */
let pointerIsDown = false, renderTimer = null;
document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
['pointerup','pointercancel'].forEach(t => document.addEventListener(t, () => setTimeout(() => { pointerIsDown = false; }, 0), true));
function renderLater(){
  if(renderTimer) return;
  const go = () => { if(pointerIsDown){ renderTimer = setTimeout(go, 40); return; } renderTimer = null; render(); };
  renderTimer = setTimeout(go, 0);
}
/* A typed-in box (not a tick box or a drop-down list) just changed: see renderLater(). */
document.addEventListener('change', e => {
  const el = e.target;
  S.deferRender = !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|file)$/.test(el.type)));
  setTimeout(() => { S.deferRender = false; }, 0);
}, true);
function renderInput(){ if(S.deferRender) renderLater(); else render(); }
function render(){
  const app = $('#app'); if(!app) return;
  if(renderTimer){ clearTimeout(renderTimer); renderTimer = null; }
  const x = window.scrollX, y = window.scrollY;
  const saved = saveScrolls(app), keepFocus = focusKey(document.activeElement);
  const now = zoneKeys();
  S.drawerStill = !!now.drawer && lastZones.drawer === now.drawer;   // same side panel as before: don't slide it in again
  app.innerHTML = railHTML() + '<main class="main" id="main">'+mainHTML()+'</main>' + notesBtnHTML() + drawerHTML() + modalHTML();
  restoreScrolls(app, saved, now);
  window.scrollTo(x, y);
  lastZones = now;
  if(keepFocus){ let el = null; try { el = app.querySelector(keepFocus); } catch(e){} if(el && !el.disabled){ try { el.focus({preventScroll:true}); } catch(e){} } }
}
const TAB_VIEWS = {overview:overviewHTML, milestones:milestonesHTML, show:showHTML, equipment:equipmentHTML, people:peopleHTML, compliance:complianceHTML, layout:layoutHTML, share:shareHTML, calendar:calendarHTML, checks:checksHTML};
const MODALS = {};                          // extra pop-ups: MODALS.name = (event, modalState) => html
const WIDE_MODALS = new Set(['new']);  // pop-ups that need the wider frame
function canUpload(){ return store.kind === 'django' || !!(typeof CAP !== 'undefined' && CAP.assets); }
function sortedEvents(){ return Object.values(S.events).sort((a,b) => String(a.date).localeCompare(String(b.date))); }
function curEv(){ return S.events[S.eventId]; }
function ro(){ return S.readOnly ? ' disabled' : ''; }

function railHTML(){
  const evs = sortedEvents();
  let h = '<aside class="rail"><div class="brand"><b>MagicShow</b><span>'+esc(S.org ? S.org.name : 'Blackmagic Media')+'</span>'+(S.orgRole === 'support' ? '<span class="pill accent" style="align-self:flex-start;margin-top:4px" title="You’re in a client’s workspace through support access">Client workspace</span>' : '')+'</div>';
  h += '<div class="railsec"><button class="navbtn" data-act="home" aria-current="'+(S.view==='home')+'">All events <span class="count">'+evs.length+'</span></button>';
  h += '<button class="navbtn" data-act="contacts" aria-current="'+(S.view==='contacts')+'">Contacts <span class="count">'+S.people.length+'</span></button>';
  h += '<button class="navbtn" data-act="reports" aria-current="'+(S.view==='reports')+'">Reports</button>';
  h += '<button class="navbtn" data-act="library" aria-current="'+(S.view==='library')+'">Templates <span class="count">'+S.templates.length+'</span></button>';
  h += '<button class="navbtn" data-act="hours" aria-current="'+(S.view==='hours')+'">Hours</button></div>';
  h += workspaceHTML();
  h += '<div class="railsec evlist"><div class="eyebrow">Your events</div>';
  evs.forEach(e => { h += '<button class="navbtn" data-act="open" data-id="'+e.id+'" aria-current="'+(S.view==='event' && S.eventId===e.id)+'"><span>'+esc(e.name||'Untitled event')+'</span><small>'+esc(fmtD(e.date))+'</small></button>'; });
  if(!evs.length) h += '<p class="hint" style="padding:0 10px">No events yet.</p>';
  h += '</div><div class="savestate" id="savestate">'+saveStateHTML()+'</div>';
  if(S.user) h += '<div class="railsec"><span class="hint" style="padding:0 10px">Signed in as '+esc(S.user.name)+'</span><button class="navbtn" data-act="account">Account</button><button class="navbtn" data-act="logout">Log out</button></div>';
  h += '</aside>';
  return h;
}
function mainHTML(){
  let top = '';
  if(S.readOnly) top += '<div class="banner">You can look around, but this account can’t save changes to this workspace.</div>';
  if(S.mode === 'error') return top + '<div class="empty"><h2>Couldn’t load your events</h2><p>'+esc(S.saveMsg||'')+'</p><button class="btn primary" data-act="reload">Try again</button></div>';
  if(S.mode === 'loading') return top + '<div class="empty"><h2>Loading events</h2><p>Your saved events appear here in a moment.</p></div>';
  if(S.view === 'contacts') return top + contactsHTML();
  if(S.view === 'reports') return top + reportsHTML();
  if(S.view === 'library') return top + libraryHTML();
  if(S.view === 'hours') return top + hoursHTML();
  if(S.view === 'home' || !S.events[S.eventId]) return top + homeHTML();
  return top + eventHTML(S.events[S.eventId]);
}

/* ---------- home ---------- */
function homeHTML(){
  const evs = sortedEvents(), today = todayYMD();
  let h = '<div class="head"><div><div class="eyebrow">Pre-event planning</div><h1>Your events</h1><p class="muted" style="margin-top:6px;max-width:62ch">Each event is entered once. Deadlines, equipment, share pages, calendar files and printouts are all built from that one record.</p></div><button class="btn primary" data-act="newEvent">+ New event</button></div>';
  if(!evs.length) h += '<div class="empty"><h2>No events yet</h2><p>Start from one of the templates below. Each comes with deadlines, a run of show, paperwork and an equipment list.</p><button class="btn primary" data-act="newEvent">+ New event</button></div>';
  else {
    h += '<div class="cards">';
    evs.forEach(ev => {
      const days = isYMD(ev.date) ? diffDays(today, ev.date) : null;
      const done = ev.milestones.filter(m => m.status === 'done').length, tot = ev.milestones.length;
      const eqs = ev.equipment.filter(e => e.status !== 'needed').length;
      const c = counts(runChecks(ev));
      h += '<button class="evcard" data-act="open" data-id="'+ev.id+'"><div class="top"><div><div class="eyebrow">'+esc(ev.kind==='venue'?'Venue view':(ev.series||'One-off event'))+'</div><h2 style="margin-top:4px">'+esc(ev.name||'Untitled event')+'</h2></div><span class="tminus">'+(days==null?'No date':days>0?'T−'+days:days===0?'Today':'Done')+'</span></div>';
      h += '<p class="muted">'+esc(fmtLong(ev.date))+(ev.venue?' · '+esc(ev.venue):'')+'</p>';
      h += '<div><div class="hint">'+done+' of '+tot+' deadlines done · '+eqs+' of '+ev.equipment.length+' gear secured</div><div class="bar"><i style="width:'+(tot?Math.round(done/tot*100):0)+'%"></i></div></div>';
      h += '<div class="row">'+(c.critical?'<span class="pill crit">'+c.critical+' urgent</span>':'')+(c.warning?'<span class="pill warn">'+c.warning+' to review</span>':'')+(!c.critical&&!c.warning?'<span class="pill good">No open issues</span>':'')+'</div></button>';
    });
    h += '</div>';
  }
  h += '<div class="panel"><div class="panel-head"><div><h2>Templates</h2><p class="hint">Pick one when you create an event. Every deadline is counted back from your show date, and each comes with a starter equipment list and budget lines. Or start empty and pick just the pieces you want.</p></div><div class="row"><button class="btn small" data-act="library">Manage templates</button><button class="btn small" data-act="newEvent" data-tpl="pick">Start empty and pick pieces</button></div></div><div class="tpl">';
  S.templates.forEach(t => { h += '<button class="tplcard mine" data-act="newEvent" data-tpl="lib:'+t.id+'"><b>'+esc(t.name)+'</b><span class="hint">'+(t.workspace?'From '+esc(t.workspace):'Your template')+'</span><span class="muted" style="font-size:13px">'+esc(t.desc||('Saved from '+(t.fromEvent||'an event')))+'</span><span class="hint">'+tplCounts(t.data||{})+'</span></button>'; });
  TEMPLATES.forEach(t => { h += '<button class="tplcard" data-act="newEvent" data-tpl="'+t.key+'"><b>'+esc(t.label)+'</b><span class="hint">'+esc(t.scale)+'</span><span class="muted" style="font-size:13px">'+esc(t.desc)+'</span><span class="hint">'+t.ms.length+' deadlines · '+t.eq.length+' gear items</span></button>'; });
  h += '</div></div>';
  return h;
}

/* ---------- contacts directory ---------- */
function contactsHTML(){
  const q = norm(S.dirSearch);
  const list = S.people.filter(p => !q || norm([p.name,p.org,p.role,p.email].join(' ')).includes(q));
  const evCount = p => Object.values(S.events).filter(ev => ev.contacts.some(c => c.personId === p.id || personKey(c) === personKey(p))).length;
  let h = '<div class="head"><div><div class="eyebrow">Directory</div><h1>Contacts</h1><p class="muted" style="margin-top:6px;max-width:62ch">Everyone you work with, stored once. Pull them into any event from its People tab.</p></div><div class="row"><button class="btn" data-act="importPeople"'+ro()+'>Import from my events</button><button class="btn primary" data-act="addDir"'+ro()+'>+ Add contact</button></div></div>';
  h += '<div class="panel"><div class="field" style="max-width:360px"><label for="dirSearch">Search</label><input id="dirSearch" value="'+esc(S.dirSearch)+'" placeholder="Name, organization or role"></div>';
  h += '<div class="tablewrap"><table style="min-width:1100px"><thead><tr><th>Name</th><th>Organization</th><th>Usual role</th><th>Phone</th><th>Email</th><th>Invoice / quote link</th><th>Notes</th><th>Events</th><th></th></tr></thead><tbody>';
  list.forEach(p => {
    const f = (k,type,ph) => '<input'+(type?' type="'+type+'"':'')+' data-person="'+p.id+'|'+k+'" value="'+esc(p[k])+'"'+(ph?' placeholder="'+ph+'"':'')+ro()+' aria-label="'+k+'">';
    h += '<tr><td>'+f('name','','Name')+'</td><td>'+f('org')+'</td><td>'+f('role')+'</td><td>'+f('phone','tel')+'</td><td>'+f('email','email')+'</td><td>'+f('invoiceUrl','url','https://…')+'</td><td>'+f('notes')+'</td><td class="mono" style="text-align:center">'+evCount(p)+'</td><td><button class="iconbtn del" data-act="delDir" data-id="'+p.id+'" aria-label="Delete contact"'+ro()+'>✕</button></td></tr>';
  });
  if(!list.length) h += '<tr><td colspan="9" class="muted" style="padding:16px">'+(S.people.length?'No contacts match that search.':'No contacts yet. Import everyone from your events to start.')+'</td></tr>';
  h += '</tbody></table></div></div>';
  return h;
}

/* ---------- event shell ---------- */
function eventHTML(ev){
  const days = isYMD(ev.date) ? diffDays(todayYMD(), ev.date) : null;
  const cc = counts(runChecks(ev));
  let h = '<div class="head"><div><div class="eyebrow">'+esc(ev.kind==='venue'?'Venue view · '+(ev.series||'House show'):(ev.series||'One-off event'))+'</div><h1>'+esc(ev.name||'Untitled event')+'</h1><div class="meta"><span>'+esc(fmtLong(ev.date))+'</span>'+(ev.venue?'<span>'+esc(ev.venue)+'</span>':'')+'<span class="mono">Doors '+esc(fmt12(toMin(ev.doors)))+'</span>'+(days!=null&&days>=0?'<span class="tminus">'+(days===0?'Show day':'T−'+days+' days')+'</span>':'')+'</div></div>';
  h += '<div class="row"><button class="btn" data-act="export">Download PDF / Word</button><button class="btn" data-act="cloneThis">Clone for next show</button><button class="btn" data-act="saveAsTemplate">Save as template</button><button class="btn" data-act="logTime"'+ro()+'>Log time</button>'+(S.confirmDel===ev.id?'<button class="btn danger" data-act="delEvent">Click again to delete</button>':'<button class="btn ghost danger" data-act="askDel">Delete</button>')+'</div></div>';
  h += '<div class="tabs" role="tablist">'+TABS.map(([k,l]) => '<button class="tab" role="tab" data-act="tab" data-tab="'+k+'" aria-selected="'+(S.tab===k)+'">'+l+(k==='checks'&&(cc.critical||cc.warning)?' <span class="count '+(cc.critical?'crit':'warn')+'">'+(cc.critical+cc.warning)+'</span>':'')+'</button>').join('')+'</div>';
  const fn = TAB_VIEWS[S.tab] || overviewHTML;
  return h + fn(ev);
}
function saveBtn(which){ return '<button class="btn small" data-act="export" data-which="'+which+'">Save this page</button>'; }
function inp(list,id,key,val,type,extra){ return '<input'+(type?' type="'+type+'"':'')+' data-edit="'+list+'|'+id+'|'+key+'" value="'+esc(val)+'" aria-label="'+esc(key)+'"'+ro()+(extra||'')+'>'; }
function sel(list,id,key,val,opts,cls){ return '<select class="'+(cls||'')+'" data-edit="'+list+'|'+id+'|'+key+'" aria-label="'+esc(key)+'"'+ro()+'>'+opts.map(o => { const v = Array.isArray(o)?o[0]:o, l = Array.isArray(o)?o[1]:o; return '<option value="'+esc(v)+'"'+(v===val?' selected':'')+'>'+esc(l)+'</option>'; }).join('')+'</select>'; }
function audChips(list,id,arr){ return '<div class="chips">'+AUD.map(a => '<button class="chip" data-act="aud" data-list="'+list+'" data-id="'+id+'" data-aud="'+a+'" aria-pressed="'+(arr||[]).includes(a)+'"'+ro()+'>'+a+'</button>').join('')+'</div>'; }
function fact(key,label,val,type,hint){ return '<div class="field"><label for="f-'+key+'">'+label+'</label><input id="f-'+key+'" '+(type?'type="'+type+'" ':'')+'data-edit="facts||'+key+'" value="'+esc(val)+'"'+ro()+'>'+(hint?'<span class="hint">'+hint+'</span>':'')+'</div>'; }
function peopleDatalist(ev){ const names = new Set(); ev.contacts.forEach(c => { if(c.name) names.add(c.name); if(c.org) names.add(c.org); }); S.people.forEach(p => { if(p.name) names.add(p.name); if(p.org) names.add(p.org); }); return '<datalist id="people-dl">'+[...names].map(n => '<option value="'+esc(n)+'">').join('')+'</datalist>'; }
function checkRow(x){ return '<div class="check '+x.level+'"><span class="sev"></span><div><p>'+esc(x.text)+'</p><small>'+esc(x.area)+' · '+(x.level==='critical'?'Urgent':x.level==='warning'?'Review':'FYI')+'</small></div><button class="btn small ghost" data-act="fix" data-tab="'+x.tab+'"'+(x.ref?' data-rtype="'+x.ref.type+'" data-rid="'+x.ref.id+'"':'')+'>Fix →</button></div>'; }

/* Little ✉ after an owner's name when they'll get reminder emails; a warning mark when they won't. */
function ownerMark(ev, name){ const r = ownerReach(ev, name); return r.ok ? ' <span class="okmail" title="Gets email reminders">✉</span>' : ' <span class="nomail" title="'+esc(r.why)+': no reminder emails">✉̸</span>'; }
function ownerHint(ev, name){
  if(!String(name||'').trim()) return '<span class="hint">Pick someone from People so they get reminders.</span>';
  const r = ownerReach(ev, name);
  if(r.ok) return '<span class="hint" style="color:var(--good)">✉ Reminders go to '+esc(r.contact.email)+'</span>';
  return '<span class="hint" style="color:var(--warn)">'+esc(r.why === 'Not in People' ? name+' isn’t in People, so no reminder emails. Add them with an email.' : r.why === 'No email' ? name+' has no email in People, so no reminders.' : name+' has reminders turned off in People.')+'</span>';
}
/* "Appears on: Internal, Performers pages" for a setup item or program segment. */
function pagesLine(auds){ const a = (auds||[]); return a.length ? 'Appears on the '+a.join(', ')+' page'+(a.length>1?'s':'')+'. Tap a tag to add or remove it.' : 'Not on any share page yet. Tap a tag to add it.'; }
/* Private links only exist on the real site. */
function noLinksHint(what){ return '<span class="hint">On the live site, a private '+what+' link appears here. In this prototype, use the PDF, Word and calendar files.</span>'; }

/* ---------- overview ---------- */
function overviewHTML(ev){
  const today = todayYMD(), list = runChecks(ev), c = counts(list);
  const done = ev.milestones.filter(m => m.status==='done').length, tot = ev.milestones.length;
  const ok = ev.compliance.filter(x => x.status==='approved').length, ctot = ev.compliance.length;
  const sec = ev.equipment.filter(e => e.status!=='needed').length, etot = ev.equipment.length;
  const days = isYMD(ev.date) ? diffDays(today, ev.date) : null;
  const stat = (label,val,pct,sub,tab) => '<button class="stat" data-act="tab" data-tab="'+tab+'" style="cursor:pointer"><span>'+label+'</span><b class="mono">'+val+'</b>'+(pct!=null?'<div class="bar"><i style="width:'+pct+'%"></i></div>':'<span>'+(sub||'')+'</span>')+'</button>';
  let h = '';
  if(days != null && days < 0 && !(ev.wrapup && ev.wrapup.completedAt)) h += '<div class="banner info">The show is over. <b>Fill in the Wrap-up</b> (attendance, final costs, ratings, what to change) so next time starts smarter. <button class="btn small" data-act="tab" data-tab="wrapup" style="margin-left:8px">Open Wrap-up</button></div>';
  h += '<div class="stats">';
  h += '<div class="stat"><span>Until show day</span><b class="mono">'+(days==null?'—':days<0?'Past':days)+'</b><span>'+(days!=null&&days>=0?'days':'')+'</span></div>';
  h += stat('Deadlines done',done+'/'+tot,tot?done/tot*100:0,'','milestones') + stat('Gear secured',sec+'/'+etot,etot?sec/etot*100:0,'','equipment') + stat(ev.kind==='venue'?'Promoter items in':'Paperwork approved',ok+'/'+ctot,ctot?ok/ctot*100:0,'','compliance');
  const B = budgetSummary(ev);
  h += '<button class="stat" data-act="tab" data-tab="budget" style="cursor:pointer"><span>Budget</span><b class="mono"'+(B.cap && B.projCost > B.cap ? ' style="color:var(--crit)"' : '')+'>'+usd(B.projCost)+'</b>'+(B.cap?'<div class="bar"><i style="width:'+Math.min(100,B.projCost/B.cap*100)+'%;background:'+(B.projCost>B.cap?'var(--crit)':'var(--accent)')+'"></i></div><span>of '+usd(B.cap)+'</span>':'<span>projected costs</span>')+'</button>';
  h += '<button class="stat" data-act="tab" data-tab="checks" style="cursor:pointer"><span>Checks</span><b class="mono" style="color:'+(c.critical?'var(--crit)':c.warning?'var(--warn)':'var(--good)')+'">'+(c.critical+c.warning)+'</b><span>'+(c.critical?c.critical+' urgent · ':'')+c.warning+' to review</span></button></div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>Event facts</h2><p class="hint">Entered once. Every page, deadline, file and calendar reads from here.</p></div></div><div class="facts">';
  h += fact('name','Event name',ev.name) + fact('series','Series',ev.series) + fact('date','Show date',ev.date,'date','Change it and every deadline moves with it.');
  h += fact('venue','Venue',ev.venue) + fact('address','Address',ev.address) + fact('host','Host / MC',ev.host);
  h += fact('doors','Doors open',ev.doors,'time') + fact('end','Event ends',ev.end,'time') + fact('priceAdv','Advance ticket ($)',ev.priceAdv,'number');
  h += fact('priceDoor','Door ticket ($)',ev.priceDoor,'number') + fact('capacity','Venue capacity',ev.capacity,'number') + fact('target','Target headcount',ev.target,'number');
  h += '<div class="field wide"><label for="f-about">Short description (used on share pages and printouts)</label><textarea id="f-about" rows="2" data-edit="facts||about"'+ro()+'>'+esc(ev.about)+'</textarea></div></div></div>';
  if(ev.kind === 'venue'){
    h += '<div class="panel"><div class="panel-head"><div><h2>House rules</h2><p class="hint">One per line. These print on every share page and the master plan, so promoters see them before show day.</p></div></div><div class="field"><textarea id="f-rules" rows="5" data-edit="rules||"'+ro()+'>'+esc(ev.houseRules.join('\n'))+'</textarea></div></div>';
  }
  const next = ev.milestones.map(m => Object.assign({d:addDays(ev.date,Number(m.offset)||0)}, m)).filter(m => m.status!=='done').sort((a,b) => a.d.localeCompare(b.d)).slice(0,6);
  h += '<div class="grid2"><div class="panel"><div class="panel-head"><h2>Next up</h2><button class="btn small ghost" data-act="tab" data-tab="milestones">All deadlines →</button></div><div class="list">';
  if(!next.length) h += '<p class="muted">Nothing open. Every deadline is marked done.</p>';
  next.forEach(m => { const late = m.d < today; h += '<div class="li"><span class="when">'+fmtD(m.d,true)+'</span><button class="btn ghost" style="text-align:left;white-space:normal;justify-content:flex-start;padding:4px 6px" data-act="openMs" data-id="'+m.id+'">'+esc(m.title)+(m.owner?' · '+esc(m.owner):'')+'</button><span>'+(late?'<span class="pill crit">Overdue</span>':m.hard?'<span class="pill accent">Hard</span>':'')+'</span></div>'; });
  h += '</div></div><div class="panel"><div class="panel-head"><h2>Top issues</h2><button class="btn small ghost" data-act="tab" data-tab="checks">All checks →</button></div><div class="checks">';
  const top = list.filter(x => x.level !== 'info').slice(0,4);
  if(!top.length) h += '<p class="muted">No urgent or review items.</p>';
  top.forEach(x => h += checkRow(x));
  h += '</div></div></div>';
  h += approvalsPanelHTML(ev);
  h += '<div class="panel"><div class="panel-head"><div><h2>For people outside the planning</h2><p class="hint">A one- to two-page summary: date, venue, program, who’s involved, where things stand and open issues. No phone numbers unless you’ve made them visible.</p></div><div class="row"><button class="btn primary small" data-act="quickExport" data-which="summary" data-fmt="pdf">Summary as PDF</button><button class="btn small" data-act="quickExport" data-which="summary" data-fmt="word">Summary as Word</button></div></div></div>';
  return h;
}

/* ---------- deadlines ---------- */
function milestonesHTML(ev){
  const today = todayYMD();
  const rows = ev.milestones.map(m => Object.assign({d:addDays(ev.date,Number(m.offset)||0)}, m)).sort((a,b) => (Number(a.offset)||0)-(Number(b.offset)||0));
  let h = '<div class="panel"><div class="panel-head"><div><h2>Deadlines</h2><p class="hint">Stored as days before show day (T−) or after it (T+, for editing and delivery). Drag a card between columns, or click it to open and edit everything. ✉ means the owner gets email reminders 7 days and 1 day before.</p></div><div class="row"><div class="seg" role="group" aria-label="View"><button data-act="msView" data-v="board" aria-pressed="'+(S.msView==='board')+'">Board</button><button data-act="msView" data-v="list" aria-pressed="'+(S.msView==='list')+'">List</button></div>'+saveBtn('milestones')+'<button class="btn small" data-act="personExport">Download by person</button><button class="btn small" data-act="addFrom" data-section="milestones"'+ro()+'>Add from templates</button><button class="btn primary small" data-act="addMs"'+ro()+'>+ Add deadline</button></div></div>';
  if(rows.length && isYMD(ev.date)){
    const nowOff = diffDays(ev.date,today);
    const minOff = Math.min(...rows.map(r => Number(r.offset)||0), nowOff, -1);
    const maxOff = Math.max(0, ...rows.map(r => Number(r.offset)||0));   // deadlines after the show (editing, delivery)
    const span = maxOff - minOff; const pos = o => Math.max(0,Math.min(100,((o - minOff)/span)*100));
    h += '<div class="strip" aria-hidden="true"><div class="line"></div>';
    rows.forEach(r => { const late = r.status!=='done' && r.d<today; h += '<span class="ms '+(late?'late':r.status)+(r.hard?' hard':'')+'" style="left:'+pos(Number(r.offset)||0)+'%" title="'+esc(fmtD(r.d)+': '+r.title)+'"></span>'; });
    if(nowOff <= maxOff) h += '<span class="now" style="left:'+pos(nowOff)+'%"></span><span class="lab" style="left:'+pos(nowOff)+'%;transform:translateX(-50%);color:var(--accent)">Today</span>';
    h += '<span class="show" style="left:'+pos(0)+'%">★</span>'+(nowOff <= maxOff && pos(nowOff) < 10 ? '' : '<span class="lab" style="left:0">'+fmtD(addDays(ev.date,minOff))+'</span>')+'<span class="lab" style="right:0">'+fmtD(addDays(ev.date,maxOff))+'</span></div>';
  }
  h += '</div>';
  if(S.msView === 'board'){
    h += '<div class="board">';
    MS_STATUS.forEach(([k,l]) => {
      const col = rows.filter(r => (r.status||'todo') === k);
      h += '<div class="col" data-col="'+k+'"><div class="col-head"><span>'+l+'</span><span class="count">'+col.length+'</span></div>';
      col.forEach(m => {
        const late = m.status!=='done' && m.d < today; const cl = m.checklist||[]; const cd = cl.filter(x => x.done).length;
        h += '<button class="card'+(late?' late':'')+'" draggable="'+(!S.readOnly)+'" data-act="openMs" data-id="'+m.id+'" data-drag="'+m.id+'"><span class="ct">'+esc(m.title||'Untitled deadline')+'</span>';
        if(m.desc) h += '<span class="hint" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+esc(m.desc)+'</span>';
        h += '<span class="cm"><span class="mono">'+fmtD(m.d,true)+'</span><span class="tcode">'+tcode(m.offset)+'</span>'+(late?'<span class="pill crit">Overdue</span>':'')+(m.hard?'<span class="pill accent">Hard</span>':'')+'</span>';
        h += '<span class="cm"><span class="pill">'+esc(m.phase||PHASES[0])+'</span>'+(m.owner?'<span>'+esc(m.owner)+ownerMark(ev,m.owner)+'</span>':'<span class="hint">No owner</span>')+(cl.length?'<span class="mono">☑ '+cd+'/'+cl.length+'</span>':'')+'</span></button>';
      });
      if(!col.length) h += '<p class="hint" style="padding:8px">Drop cards here.</p>';
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div class="tablewrap"><table><thead><tr><th>Due</th><th>Days out</th><th style="width:40%">Task</th><th>Owner</th><th>Phase</th><th>Status</th><th></th></tr></thead><tbody>';
    rows.forEach(m => { const late = m.status!=='done' && m.d < today;
      h += '<tr class="'+(m.status==='done'?'done':'')+(late?' late':'')+'"><td class="mono" style="white-space:nowrap;padding-left:10px">'+fmtD(m.d,true)+'</td><td class="tcode">'+tcode(m.offset)+'</td><td><button class="btn ghost" style="white-space:normal;text-align:left;justify-content:flex-start;width:100%" data-act="openMs" data-id="'+m.id+'">'+esc(m.title)+(m.hard?' <span class="pill accent">Hard</span>':'')+'</button></td><td>'+esc(m.owner||'—')+(m.owner?ownerMark(ev,m.owner):'')+'</td><td>'+esc(m.phase||'')+'</td><td>'+sel('milestones',m.id,'status',m.status,MS_STATUS,'status '+m.status)+'</td><td><button class="btn small ghost" data-act="openMs" data-id="'+m.id+'">Open</button></td></tr>'; });
    if(!rows.length) h += '<tr><td colspan="7" class="muted" style="padding:16px">No deadlines yet.</td></tr>';
    h += '</tbody></table></div>';
  }
  return h;
}
function msDrawer(ev,m){
  const d = addDays(ev.date,Number(m.offset)||0);
  let h = '<div class="dh"><div><div class="eyebrow">Deadline · '+tcode(m.offset)+'</div><h3 style="margin-top:2px">'+esc(fmtD(d,true))+'</h3></div><button class="iconbtn" data-act="closeDrawer" aria-label="Close">✕</button></div><div class="db">';
  h += '<div class="field"><label for="d-title">Task</label><textarea id="d-title" rows="2" data-edit="milestones|'+m.id+'|title"'+ro()+'>'+esc(m.title)+'</textarea></div>';
  h += '<div class="field"><label for="d-desc">Description</label><textarea id="d-desc" rows="4" placeholder="What needs to happen, who to call, links…" data-edit="milestones|'+m.id+'|desc"'+ro()+'>'+esc(m.desc)+'</textarea></div>';
  h += '<div class="facts two"><div class="field"><label for="d-status">Status</label>'+sel('milestones',m.id,'status',m.status,MS_STATUS,'status '+m.status).replace('<select','<select id="d-status"')+'</div><div class="field"><label for="d-owner">Owner</label><input id="d-owner" list="people-dl" data-edit="milestones|'+m.id+'|owner" value="'+esc(m.owner)+'"'+ro()+'>'+ownerHint(ev,m.owner)+'</div>';
  const off = Number(m.offset)||0;
  h += '<div class="field"><label for="d-days">When</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input id="d-days" type="number" min="0" style="width:80px" data-edit="milestones|'+m.id+'|_days" value="'+Math.abs(off)+'"'+ro()+' aria-label="Days">'+'<select data-edit="milestones|'+m.id+'|_side" aria-label="Before or after show day"'+ro()+'>'+[['before','days before show'],['on','on show day'],['after','days after show']].map(([v,l]) => '<option value="'+v+'"'+((off<0&&v==='before')||(off===0&&v==='on')||(off>0&&v==='after')?' selected':'')+'>'+l+'</option>').join('')+'</select></div></div><div class="field"><label for="d-date">Due date</label><input id="d-date" type="date" data-edit="milestones|'+m.id+'|_date" value="'+d+'"'+ro()+'></div>';
  h += '<div class="field"><label for="d-phase">Phase</label>'+sel('milestones',m.id,'phase',m.phase||PHASES[0],PHASES).replace('<select','<select id="d-phase"')+'</div><div class="field"><span class="lbl">Type</span><label class="toggle" style="padding-top:8px"><input type="checkbox" data-edit="milestones|'+m.id+'|hard"'+(m.hard?' checked':'')+ro()+'> Hard deadline</label></div></div>';
  if(m.status === 'done') h += '<div class="field"><label for="d-doneAt">Completed on</label><input id="d-doneAt" type="date" data-edit="milestones|'+m.id+'|doneAt" value="'+esc(m.doneAt||'')+'"'+ro()+'><span class="hint">Recorded automatically when marked done. Past-event reports use it to spot tasks that run late.</span></div>';
  h += '<div class="field"><span class="lbl">Checklist</span>';
  (m.checklist||[]).forEach(c => { h += '<div class="subtask"><input type="checkbox" data-sub="'+m.id+'|'+c.id+'|done"'+(c.done?' checked':'')+ro()+' aria-label="Done"><input type="text" class="inline-in" data-sub="'+m.id+'|'+c.id+'|text" value="'+esc(c.text)+'"'+ro()+' aria-label="Step"><button class="iconbtn del" data-act="delSub" data-ms="'+m.id+'" data-id="'+c.id+'" aria-label="Remove step"'+ro()+'>✕</button></div>'; });
  h += '<div class="subtask"><input type="text" class="inline-in" id="newSub" placeholder="Add a step and press Enter"'+ro()+'><button class="btn small" data-act="addSub" data-ms="'+m.id+'"'+ro()+'>Add</button></div></div>';
  h += peopleDatalist(ev)+'</div><div class="df"><button class="btn ghost danger" data-act="del" data-list="milestones" data-id="'+m.id+'"'+ro()+'>Delete deadline</button><button class="btn primary" data-act="closeDrawer">Done</button></div>';
  return h;
}

/* ---------- run of show ---------- */
function showHTML(ev){
  let h = '<div class="panel"><div class="panel-head"><div><h2>Run of show</h2><p class="hint">'+({sheet:'The whole day in time order. Click any line to edit it. To reorder the program or add a spot in the middle, switch to Edit.',timeline:'One row per item so every label is readable. The red dashed line is doors.',edit:'Edit setup times directly. Program times calculate from the first cue and each segment’s length. Drag ⠿ to reorder the program.'})[S.showView]+'</p></div><div class="row"><div class="seg" role="group" aria-label="View"><button data-act="showView" data-v="sheet" aria-pressed="'+(S.showView==='sheet')+'">Run sheet</button><button data-act="showView" data-v="timeline" aria-pressed="'+(S.showView==='timeline')+'">Timeline</button><button data-act="showView" data-v="edit" aria-pressed="'+(S.showView==='edit')+'">Edit</button></div>'+saveBtn('show')+'</div></div></div>';
  if(S.showView === 'sheet') h += runSheetHTML(ev);
  else if(S.showView === 'timeline') h += timelineHTML(ev);
  else h += showEditHTML(ev);
  return h;
}
function nowMinutes(ev){
  if(S.previewTime != null) return S.previewTime;
  const d = new Date(); if(todayYMD() === ev.date) return d.getHours()*60+d.getMinutes();
  return toMin(ev.doors) == null ? 19*60 : toMin(ev.doors);
}
function runSheetHTML(ev){
  const all = daySchedule(ev), t = nowMinutes(ev);
  const cur = all.filter(x => x.s <= t && t < x.e), next = all.filter(x => x.s > t).slice(0,2);
  const trackName = x => x.kind === 'program' ? 'Program' : x.track;
  let h = '<div class="panel"><div class="panel-head"><div><h3>Now and next</h3><p class="hint">'+(todayYMD()===ev.date && S.previewTime==null?'Live for show day.':'On show day this follows the clock. Until then, pick a time to preview it.')+'</p></div><div class="row"><label class="toggle" for="prevTime">Preview at</label><input id="prevTime" class="inline-in" type="time" value="'+toHHMM(t)+'"></div></div><div class="nownext">';
  h += '<div class="nn now"><span class="eyebrow">Now · '+fmt12(t)+'</span>'+(cur.length?cur.map(x => '<span class="big">'+esc(x.who?x.who+': '+x.title:x.title)+'</span><span class="hint">'+esc(trackName(x))+' · until '+fmt12(x.e)+'</span>').join(''):'<span class="big">Nothing scheduled</span>')+'</div>';
  next.forEach(x => { h += '<div class="nn"><span class="eyebrow">Next · '+fmt12(x.s)+' <span class="mono">(in '+(x.s-t)+' min)</span></span><span class="big">'+esc(x.who?x.who+': '+x.title:x.title)+'</span><span class="hint">'+esc(trackName(x))+'</span></div>'; });
  h += '</div></div>';
  h += '<div class="panel"><div class="legend">'+['Production','Food & bar','Doors & security','Program & talent','Program'].map(tk => '<span><i class="tk-'+trackKey(tk)+'"></i>'+(tk==='Program'?'Program (the show)':tk)+'</span>').join('')+'</div><div class="runsheet">';
  if(!all.length) h += '<p class="muted">Nothing scheduled yet. Switch to Edit to add setup items and program segments.</p>';
  all.forEach(x => {
    const on = x.s <= t && t < x.e;
    h += '<button class="rs'+(on?' current':'')+'" data-act="openItem" data-id="'+x.id+'"><span class="tm">'+fmt12(x.s)+'<small>'+(x.kind==='setup'?'to '+fmt12(x.e):(x.e-x.s)+' min')+'</small></span><span class="sw tk-'+trackKey(x.kind==='program'?'Program':x.track)+'"></span><span><span class="ti">'+esc(x.title)+'</span><div class="sub">'+esc([x.who, trackName(x)].filter(Boolean).join(' · '))+'</div></span><span class="chips">'+(x.audiences||[]).filter(a => a!=='Internal').map(a => '<span class="pill">'+a+'</span>').join('')+'</span></button>';
  });
  return h + '</div></div>';
}
function timelineHTML(ev){
  const all = daySchedule(ev);
  if(!all.length) return '<div class="panel"><p class="muted">Nothing scheduled yet.</p></div>';
  const lo = Math.floor(Math.min(...all.map(x => x.s))/60)*60, hi = Math.ceil(Math.max(...all.map(x => x.e))/60)*60, span = Math.max(60, hi-lo);
  const X = m => ((m-lo)/span*100).toFixed(2)+'%';
  let ticks = ''; for(let m=lo;m<=hi;m+=60) ticks += '<i style="left:'+X(m)+'"></i>';
  let head = ''; for(let m=lo;m<=hi;m+=60) head += '<span style="left:'+X(m)+(m===hi?';transform:translateX(-100%)':m===lo?';transform:none':'')+'">'+fmt12(m).replace(':00','')+'</span>';
  const doors = toMin(ev.doors), dl = doors!=null && doors>=lo && doors<=hi ? '<span class="doors" style="left:'+X(doors)+'"></span>' : '';
  let h = '<div class="panel"><div style="overflow-x:auto"><div class="tl"><span class="tl-h"></span><div class="tl-h">'+head+'</div>';
  all.forEach(x => {
    const color = 'var(--'+({Production:'t2',Food:'t3',Doors:'t4',Talent:'t5',Program:'t1'})[trackKey(x.kind==='program'?'Program':x.track)]+')';
    h += '<button class="tl-l row-btn" data-act="openItem" data-id="'+x.id+'"><span class="mono">'+fmt12(x.s)+'</span><span>'+esc(x.who? x.who+' · '+x.title : x.title)+'</span></button>';
    h += '<div class="tl-r">'+ticks+dl+'<button class="b" data-act="openItem" data-id="'+x.id+'" style="left:'+X(x.s)+';width:'+((Math.max(x.e-x.s,5))/span*100).toFixed(2)+'%;background:'+color+'" title="'+esc(fmt12(x.s)+'–'+fmt12(x.e)+' '+x.title)+'" aria-label="'+esc(x.title)+'"></button></div>';
  });
  return h + '</div></div></div>';
}
/* A thin row between two table rows with a "+ Add here" button. It shows when you point
   at it (always on touch screens), so a new line can go anywhere in the order. */
function insRow(cols, act, index, label){ return S.readOnly ? '' : '<tr class="insrow"><td colspan="'+cols+'"><button data-act="'+act+'" data-index="'+index+'" aria-label="'+esc(label)+'"><span>+ '+esc(label)+'</span></button></td></tr>'; }
/* The ⠿ handle at the start of a row: drag it (mouse or finger) to move the row, or focus it and press the up/down arrow keys. */
function gripCell(list, id){ return '<td class="gripcell">'+(S.readOnly ? '' : '<button class="grip" data-grip="'+list+'|'+id+'" aria-label="Move this row: drag, or press the up and down arrow keys" title="Drag to move">⠿</button>')+'</td>'; }
function showEditHTML(ev){
  const pt = programTimes(ev);
  let h = '<div class="panel"><div class="panel-head"><div><h2>Setup &amp; load-in</h2><p class="hint">Tag who needs each item. Tags decide which share page shows it. These sort themselves by start time; point between two rows to add one there.</p></div><div class="row"><button class="btn small" data-act="addFrom" data-section="setup"'+ro()+'>Add from templates</button><button class="btn primary small" data-act="addSetup"'+ro()+'>+ Add item</button></div></div>';
  h += '<div class="tablewrap"><table><thead><tr><th>Start</th><th>End</th><th style="width:30%">Item</th><th>Track</th><th>Shown to</th><th></th></tr></thead><tbody>';
  const setup = ev.setup.slice().sort((a,b) => (toMin(a.start)||0)-(toMin(b.start)||0));
  setup.forEach((s,i) => { h += insRow(6,'addSetupAt',i,'Add an item here')+'<tr><td>'+inp('setup',s.id,'start',s.start,'time')+'</td><td>'+inp('setup',s.id,'end',s.end,'time')+'</td><td>'+inp('setup',s.id,'title',s.title,'',' class="wide"')+'</td><td>'+sel('setup',s.id,'track',s.track,TRACKS)+'</td><td>'+audChips('setup',s.id,s.audiences)+'</td><td><button class="iconbtn del" data-act="del" data-list="setup" data-id="'+s.id+'" aria-label="Delete item"'+ro()+'>✕</button></td></tr>'; });
  if(!ev.setup.length) h += '<tr><td colspan="6" class="muted" style="padding:16px">No setup items yet.</td></tr>';
  else h += insRow(6,'addSetupAt',setup.length,'Add an item here');
  h += '</tbody></table></div></div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>Program</h2><p class="hint">Lengths in minutes. Drag the ⠿ handle to move a segment up or down, or point between two rows to add one there. Everything after it shifts on its own.</p></div><div class="row"><label class="toggle" for="progStart">First cue</label><input id="progStart" class="inline-in" type="time" data-edit="program||start" value="'+esc(ev.program.start)+'"'+ro()+'><button class="btn small" data-act="addFrom" data-section="program"'+ro()+'>Add from templates</button><button class="btn primary small" data-act="addProg"'+ro()+'>+ Add segment</button></div></div>';
  h += '<div class="tablewrap"><table><thead><tr><th></th><th>Time</th><th>Min</th><th style="width:26%">Segment</th><th>Who</th><th>Shown to</th><th>Order</th><th></th></tr></thead><tbody data-reorder="program">';
  pt.forEach((p,i) => { h += insRow(8,'addProgAt',i,'Add a segment here')+'<tr data-row="'+p.id+'">'+gripCell('program',p.id)+'<td class="mono" style="white-space:nowrap">'+fmt12(p.s)+' – '+fmt12(p.e)+'</td><td>'+inp('program',p.id,'dur',p.dur,'number',' min="0"')+'</td><td>'+inp('program',p.id,'title',p.title,'',' class="wide"')+'</td><td>'+inp('program',p.id,'who',p.who,'',' placeholder="Performer or host" list="people-dl"')+'</td><td>'+audChips('program',p.id,p.audiences)+'</td><td style="white-space:nowrap"><button class="iconbtn" data-act="move" data-id="'+p.id+'" data-dir="-1" aria-label="Move up"'+(i===0||S.readOnly?' disabled':'')+'>↑</button><button class="iconbtn" data-act="move" data-id="'+p.id+'" data-dir="1" aria-label="Move down"'+(i===pt.length-1||S.readOnly?' disabled':'')+'>↓</button></td><td><button class="iconbtn del" data-act="del" data-list="program" data-id="'+p.id+'" aria-label="Delete segment"'+ro()+'>✕</button></td></tr>'; });
  if(!pt.length) h += '<tr><td colspan="8" class="muted" style="padding:16px">No program segments yet.</td></tr>';
  else h += insRow(8,'addProgAt',pt.length,'Add a segment here');
  return h + '</tbody></table></div>'+peopleDatalist(ev)+'</div>';
}
function itemDrawer(ev,id){
  const s = ev.setup.find(x => x.id === id), pt = programTimes(ev), p = pt.find(x => x.id === id);
  if(!s && !p) return '';
  let h = '<div class="dh"><div><div class="eyebrow">'+(s?'Setup · '+esc(s.track):'Program segment')+'</div><h3 style="margin-top:2px">'+(s?fmt12(toMin(s.start))+' – '+fmt12(spanOf(s)?spanOf(s).e:null):fmt12(p.s)+' – '+fmt12(p.e))+'</h3></div><button class="iconbtn" data-act="closeDrawer" aria-label="Close">✕</button></div><div class="db">';
  if(s){
    h += '<div class="field"><label for="i-title">Item</label><textarea id="i-title" rows="2" data-edit="setup|'+s.id+'|title"'+ro()+'>'+esc(s.title)+'</textarea></div>';
    h += '<div class="facts two"><div class="field"><label for="i-start">Start</label><input id="i-start" type="time" data-edit="setup|'+s.id+'|start" value="'+esc(s.start)+'"'+ro()+'></div><div class="field"><label for="i-end">End</label><input id="i-end" type="time" data-edit="setup|'+s.id+'|end" value="'+esc(s.end)+'"'+ro()+'></div><div class="field wide"><label for="i-track">Track</label>'+sel('setup',s.id,'track',s.track,TRACKS).replace('<select','<select id="i-track"')+'</div></div>';
    h += '<div class="field"><span class="lbl">Shown to</span>'+audChips('setup',s.id,s.audiences)+'<span class="hint">'+pagesLine(s.audiences)+'</span></div><div class="field"><label for="i-notes">Notes</label><textarea id="i-notes" rows="3" data-edit="setup|'+s.id+'|notes"'+ro()+'>'+esc(s.notes)+'</textarea></div>';
    h += '<div class="row"><button class="btn small" data-act="dupSetup" data-id="'+s.id+'"'+ro()+'>Duplicate this item</button></div>';
    h += '</div><div class="df"><button class="btn ghost danger" data-act="del" data-list="setup" data-id="'+s.id+'"'+ro()+'>Delete item</button><button class="btn primary" data-act="closeDrawer">Done</button></div>';
  } else {
    const i = pt.findIndex(x => x.id === id);
    h += '<div class="field"><label for="i-title">Segment</label><textarea id="i-title" rows="2" data-edit="program|'+p.id+'|title"'+ro()+'>'+esc(p.title)+'</textarea></div>';
    h += '<div class="facts two"><div class="field"><label for="i-who">Who</label><input id="i-who" list="people-dl" data-edit="program|'+p.id+'|who" value="'+esc(p.who)+'"'+ro()+'></div><div class="field"><label for="i-dur">Length (min)</label><input id="i-dur" type="number" min="0" data-edit="program|'+p.id+'|dur" value="'+esc(p.dur)+'"'+ro()+'></div></div>';
    h += '<div class="field"><span class="lbl">Shown to</span>'+audChips('program',p.id,p.audiences)+'<span class="hint">'+pagesLine(p.audiences)+'</span></div><div class="field"><label for="i-notes">Notes (stage needs, mics, cues)</label><textarea id="i-notes" rows="3" data-edit="program|'+p.id+'|notes"'+ro()+'>'+esc(p.notes)+'</textarea></div>';
    h += '<div class="row"><button class="btn small" data-act="move" data-id="'+p.id+'" data-dir="-1"'+(i===0||S.readOnly?' disabled':'')+'>Move earlier</button><button class="btn small" data-act="move" data-id="'+p.id+'" data-dir="1"'+(i===pt.length-1||S.readOnly?' disabled':'')+'>Move later</button><button class="btn small" data-act="addProgAt" data-index="'+i+'"'+ro()+'>+ Add a segment before</button><button class="btn small" data-act="addProgAt" data-index="'+(i+1)+'"'+ro()+'>+ Add a segment after</button></div>';
    h += peopleDatalist(ev)+'</div><div class="df"><button class="btn ghost danger" data-act="del" data-list="program" data-id="'+p.id+'"'+ro()+'>Delete segment</button><button class="btn primary" data-act="closeDrawer">Done</button></div>';
  }
  return h;
}

/* ---------- equipment ---------- */
function equipmentHTML(ev){
  const E = ev.equipment, n = st => E.filter(e => e.status === st).length;
  const sec = E.filter(e => e.status !== 'needed').length;
  let h = '<div class="stats">';
  h += '<div class="stat"><span>Items</span><b class="mono">'+E.length+'</b><span>'+E.reduce((a,e) => a+(Number(e.qty)||0),0)+' pieces in total</span></div>';
  h += '<div class="stat"><span>Still needed</span><b class="mono" style="color:'+(n('needed')?'var(--warn)':'var(--good)')+'">'+n('needed')+'</b><span>not secured yet</span></div>';
  h += '<div class="stat"><span>Secured or better</span><b class="mono">'+sec+'/'+E.length+'</b><div class="bar"><i style="width:'+(E.length?sec/E.length*100:0)+'%"></i></div></div>';
  h += '<div class="stat"><span>Loaded in</span><b class="mono">'+(n('loaded')+n('returned'))+'/'+E.length+'</b><span>show-day check</span></div></div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>Equipment check</h2><p class="hint">Everything it takes to put on the show. Tap the box to move an item along: Needed → Secured → Packed → Loaded in → Returned.</p></div><div class="row">'+saveBtn('equipment')+'<button class="btn small" data-act="addFrom" data-section="equipment"'+ro()+'>Add from templates</button></div></div>';
  h += '<div class="row"><select id="eqCat" class="inline-in" aria-label="Category">'+EQ_CATS.map(c => '<option>'+c+'</option>').join('')+'</select><input id="eqNew" class="inline-in" style="flex:1;min-width:180px" placeholder="Add an item, e.g. Extra XLR cables"'+ro()+'><button class="btn primary small" data-act="addEq"'+ro()+'>+ Add</button></div>';
  h += '<div class="row"><span class="hint">Show:</span><div class="seg" role="group" aria-label="Filter">'+[['all','All']].concat(EQ_STATUS).map(([k,l]) => '<button data-act="eqFilter" data-v="'+k+'" aria-pressed="'+(S.eqFilter===k)+'">'+l+'</button>').join('')+'</div></div>';
  const vis = E.filter(e => S.eqFilter === 'all' || e.status === S.eqFilter);
  h += '<div class="tablewrap"><table style="min-width:1000px"><thead><tr><th></th><th style="width:26%">Item</th><th>Qty</th><th>Source</th><th>Responsible</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>';
  const cats = EQ_CATS.concat([...new Set(E.map(e => e.cat))].filter(c => !EQ_CATS.includes(c)));
  cats.forEach(cat => {
    const items = vis.filter(e => e.cat === cat); if(!items.length) return;
    const all = E.filter(e => e.cat === cat), ok = all.filter(e => e.status !== 'needed').length;
    h += '<tr class="eq-cat"><td colspan="8">'+esc(cat)+' <span class="hint">· '+ok+' of '+all.length+' secured</span></td></tr>';
    items.forEach(e => {
      const stepIdx = EQ_STATUS.findIndex(s => s[0] === e.status);
      h += '<tr class="'+(e.status==='returned'?'done':'')+'"><td><button class="tick '+(stepIdx>=3?'on':stepIdx>=1?'mid':'')+'" data-act="eqStep" data-id="'+e.id+'" title="Move to '+esc((EQ_STATUS[(stepIdx+1)%EQ_STATUS.length])[1])+'" aria-label="Advance status"'+ro()+'>'+(stepIdx>=3?'✓':stepIdx>=1?'•':'')+'</button></td>';
      h += '<td>'+inp('equipment',e.id,'item',e.item,'',' class="wide"')+'</td><td>'+inp('equipment',e.id,'qty',e.qty,'number',' min="0"')+'</td><td>'+sel('equipment',e.id,'source',e.source,EQ_SOURCES)+'</td><td>'+inp('equipment',e.id,'owner',e.owner,'',' list="people-dl" placeholder="Who?"')+'</td><td>'+sel('equipment',e.id,'status',e.status,EQ_STATUS,'status '+e.status)+'</td><td>'+inp('equipment',e.id,'notes',e.notes)+'</td><td><button class="iconbtn del" data-act="del" data-list="equipment" data-id="'+e.id+'" aria-label="Delete item"'+ro()+'>✕</button></td></tr>';
    });
  });
  if(!vis.length) h += '<tr><td colspan="8" class="muted" style="padding:16px">'+(E.length?'Nothing with that status.':'No equipment yet. Add items above or pick from the suggestions below.')+'</td></tr>';
  h += '</tbody></table></div>'+peopleDatalist(ev)+'</div>';
  const have = new Set(E.map(e => norm(e.item)));
  h += '<details class="panel"><summary style="cursor:pointer;font-weight:600">Suggestions: common gear by category</summary><p class="hint">Click to add. Items already on your list are hidden.</p>';
  Object.entries(EQ_CATALOG).forEach(([cat,items]) => { const left = items.filter(i => !have.has(norm(i))); if(!left.length) return; h += '<div class="field"><span class="lbl">'+esc(cat)+'</span><div class="suggest">'+left.map(i => '<button data-act="suggestEq" data-cat="'+esc(cat)+'" data-item="'+esc(i)+'"'+ro()+'>+ '+esc(i)+'</button>').join('')+'</div></div>'; });
  return h + '</details>';
}

/* ---------- people ---------- */
function peopleHTML(ev){
  let h = '<div class="panel"><div class="panel-head"><div><h2>People</h2><p class="hint">Who’s working this event. Tags decide which share pages list each person. Phone numbers stay off outside pages unless you turn them on. Email reminders: “Their tasks” sends deadline and show-day emails; “Team” also sends payment reminders and the Monday summary.</p></div><div class="row">'+saveBtn('people')+'<button class="btn small" data-act="pickPeople"'+ro()+'>Add from contacts</button><button class="btn primary small" data-act="addPerson"'+ro()+'>+ Add person</button></div></div>';
  h += '<div class="tablewrap"><table class="ppl" style="min-width:1430px"><thead><tr><th></th><th>Role</th><th>Name</th><th>Organization</th><th>Phone</th><th>Email</th><th>Shown on</th><th>Phone visible</th><th>Email reminders</th><th>Invoice / quote link</th><th></th></tr></thead><tbody data-reorder="contacts">';
  ev.contacts.forEach(c => {
    const inDir = S.people.some(p => p.id === c.personId || personKey(p) === personKey(c));
    h += '<tr data-row="'+c.id+'">'+gripCell('contacts',c.id)+'<td>'+inp('contacts',c.id,'role',c.role)+'</td><td>'+inp('contacts',c.id,'name',c.name,'',' placeholder="Name"')+'</td><td>'+inp('contacts',c.id,'org',c.org)+'</td><td>'+inp('contacts',c.id,'phone',c.phone,'tel')+'</td><td>'+inp('contacts',c.id,'email',c.email,'email')+'</td><td>'+audChips('contacts',c.id,c.audiences)+'</td>';
    h += '<td><label class="toggle"><input type="checkbox" data-edit="contacts|'+c.id+'|showPhone"'+(c.showPhone?' checked':'')+ro()+'> Show</label></td><td><label class="toggle" title="'+(c.email?'Deadline and show-day emails':'Add an email to send reminders')+'"><input type="checkbox" data-edit="contacts|'+c.id+'|remind"'+(c.remind!==false?' checked':'')+ro()+'> Their tasks'+(c.email?'':' <span class="hint">(no email)</span>')+'</label><label class="toggle" title="Planning team: payment reminders and the Monday summary"><input type="checkbox" data-edit="contacts|'+c.id+'|team"'+(c.team?' checked':'')+ro()+'> Team</label></td><td>'+inp('contacts',c.id,'invoiceUrl',c.invoiceUrl,'url',' placeholder="https://…"')+'</td><td style="white-space:nowrap"><button class="btn small ghost" data-act="send" data-id="'+c.id+'">Send page</button>'+(inDir?'':'<button class="btn small ghost" data-act="saveToDir" data-id="'+c.id+'"'+ro()+'>Save to contacts</button>')+'<button class="iconbtn del" data-act="del" data-list="contacts" data-id="'+c.id+'" aria-label="Remove person"'+ro()+'>✕</button></td></tr>';
  });
  if(!ev.contacts.length) h += '<tr><td colspan="11" class="muted" style="padding:16px">No people yet.</td></tr>';
  return h + '</tbody></table></div></div>';
}

/* ---------- paperwork ---------- */
function complianceHTML(ev){
  const today = todayYMD(), venue = ev.kind === 'venue';
  let h = '<div class="panel"><div class="panel-head"><div><h2>'+(venue?'What promoters owe the venue':'Permits &amp; paperwork')+'</h2><p class="hint">'+(venue?'Contracts, deposits, insurance and riders, each with a due date and the file once it arrives.':'Licenses, insurance, waivers and venue requirements. Upload the actual file so it’s one click away on show day.')+'</p></div><div class="row">'+saveBtn('compliance')+'<button class="btn small" data-act="addFrom" data-section="compliance"'+ro()+'>Add from templates</button><button class="btn primary small" data-act="addCp"'+ro()+'>+ Add item</button></div></div>';
  h += '<div class="tablewrap"><table style="min-width:1180px"><thead><tr><th style="width:22%">Item</th><th>Responsible</th><th>Days out</th><th>Due</th><th>Status</th><th>Expires</th><th style="width:22%">Files</th><th>Approval</th><th>Notes</th><th></th></tr></thead><tbody>';
  ev.compliance.slice().sort((a,b) => (Number(a.offset)||0)-(Number(b.offset)||0)).forEach(c => {
    const d = addDays(ev.date,Number(c.offset)||0), late = c.status!=='approved' && d<today, unknown = c.owner && !contactMatches(ev,c.owner);
    h += '<tr class="'+(late?'late':'')+'"><td>'+inp('compliance',c.id,'item',c.item,'',' class="wide" style="min-width:200px"')+'</td><td>'+inp('compliance',c.id,'owner',c.owner,'',' list="people-dl"'+(unknown?' style="color:var(--warn);font-weight:600" title="Not in People"':''))+'</td>';
    h += '<td><div class="row" style="gap:4px;flex-wrap:nowrap"><span class="tcode">T−</span>'+inp('compliance',c.id,'_neg',Math.max(0,-(Number(c.offset)||0)),'number',' min="0" style="width:64px"')+'</div></td><td class="mono" style="white-space:nowrap">'+fmtD(d,true)+(late?' <span class="pill crit">Late</span>':'')+'</td>';
    h += '<td>'+sel('compliance',c.id,'status',c.status,CP_STATUS,'status '+c.status)+'</td><td>'+inp('compliance',c.id,'expires',c.expires,'date')+'</td><td><div class="files">';
    (c.files||[]).forEach(f => { h += '<div class="file"><span aria-hidden="true">📄</span><a href="'+esc(blobUrl(f.id))+'" target="_blank" rel="noopener" title="'+esc(f.name)+'">'+esc(f.name)+'</a><button class="iconbtn" data-act="dlFile" data-cp="'+c.id+'" data-id="'+f.id+'" aria-label="Download file">⤓</button><button class="iconbtn del" data-act="rmFile" data-cp="'+c.id+'" data-id="'+f.id+'" aria-label="Remove file"'+ro()+'>✕</button></div>'; });
    h += '<label class="btn small ghost" style="align-self:flex-start"'+(canUpload()&&!S.readOnly?'':' aria-disabled="true"')+'>⤒ Upload<input type="file" data-upload="'+c.id+'" hidden'+(canUpload()&&!S.readOnly?'':' disabled')+' accept=".pdf,image/*,.txt,.csv"></label></div></td><td>'+approvalCell(ev,'compliance',c.id,c.item)+'</td>';
    h += '<td>'+inp('compliance',c.id,'notes',c.notes)+'</td><td><button class="iconbtn del" data-act="del" data-list="compliance" data-id="'+c.id+'" aria-label="Delete item"'+ro()+'>✕</button></td></tr>';
  });
  if(!ev.compliance.length) h += '<tr><td colspan="10" class="muted" style="padding:16px">No paperwork items yet.</td></tr>';
  return h + '</tbody></table></div>'+peopleDatalist(ev)+'</div>';
}

/* ---------- layout ---------- */
function layoutHTML(ev){
  let h = '<div class="panel"><div class="panel-head"><div><h2>Layout</h2><p class="hint">The PDF has the room drawn to scale and the floor plan with numbered pins, ready to send. It’s also in the full master event plan. '+(S.layoutView==='build'?'Build the room to scale. Drag pieces to place them; click one to rename, resize, rotate or remove it. Grid lines are every 5 ft.':'Upload the venue’s floor plan, then drop labeled pins on it. Drag pins to move them; click one to edit it.')+'</p></div><div class="row"><div class="seg" role="group" aria-label="Layout view"><button data-act="layoutView" data-v="build" aria-pressed="'+(S.layoutView==='build')+'">Build a layout</button><button data-act="layoutView" data-v="plan" aria-pressed="'+(S.layoutView==='plan')+'">Floor plan + pins</button></div><button class="btn primary small" data-act="quickExport" data-which="layout" data-fmt="pdf">Download layout PDF</button></div></div></div>';
  return h + (S.layoutView === 'build' ? buildLayoutHTML(ev) : planHTML(ev));
}
function buildLayoutHTML(ev){
  const L = ev.layout, W = Number(L.room.w)||60, D = Number(L.room.d)||80;
  let h = '<div class="panel"><div class="row" style="justify-content:space-between"><div class="row"><div class="field" style="width:120px"><label for="roomW">Room width (ft)</label><input id="roomW" type="number" min="10" max="400" data-edit="room||w" value="'+W+'"'+ro()+'></div><div class="field" style="width:120px"><label for="roomD">Room depth (ft)</label><input id="roomD" type="number" min="10" max="400" data-edit="room||d" value="'+D+'"'+ro()+'></div><span class="hint" style="align-self:flex-end;padding-bottom:10px">'+(W*D).toLocaleString()+' sq ft</span></div></div>';
  h += '<div class="field"><span class="lbl">Add a piece</span><div class="palette">'+Object.entries(LAYOUT_PIECES).map(([k,p]) => '<button data-act="addPiece" data-kind="'+k+'"'+ro()+'>'+esc(p.label)+'<small>'+esc(p.sub)+'</small></button>').join('')+'</div></div>';
  const g = []; for(let x=0;x<=W;x+=5) g.push('<line x1="'+x+'" y1="0" x2="'+x+'" y2="'+D+'" stroke="var(--grid)" stroke-width="'+(x%10===0?0.18:0.1)+'"/>'); for(let y=0;y<=D;y+=5) g.push('<line x1="0" y1="'+y+'" x2="'+W+'" y2="'+y+'" stroke="var(--grid)" stroke-width="'+(y%10===0?0.18:0.1)+'"/>');
  const fs = Math.max(1.1, Math.min(W,D)/45);
  let pcs = '';
  const zOrder = p => p.kind === 'zone' ? 0 : p.kind === 'label' ? 2 : 1;
  L.pieces.slice().sort((a,b) => zOrder(a) - zOrder(b)).forEach(p => {
    const def = LAYOUT_PIECES[p.kind] || LAYOUT_PIECES.label, rot = (p.rot||0) % 180 !== 0;
    const w = rot ? p.h : p.w, hh = rot ? p.w : p.h, selected = S.drawer && S.drawer.type === 'piece' && S.drawer.id === p.id;
    let shape;
    if(def.round) shape = '<ellipse cx="'+w/2+'" cy="'+hh/2+'" rx="'+w/2+'" ry="'+hh/2+'" fill="var(--accent-soft)" stroke="'+(selected?'var(--accent)':'var(--ink-3)')+'" stroke-width="'+(selected?0.4:0.18)+'"/>';
    else if(def.text) shape = '<rect width="'+w+'" height="'+hh+'" fill="transparent" stroke="'+(selected?'var(--accent)':'none')+'" stroke-width="0.3" stroke-dasharray="0.6 0.4"/>';
    else if(def.zone) shape = '<rect width="'+w+'" height="'+hh+'" rx="0.6" fill="var(--warn-soft)" fill-opacity="0.7" stroke="'+(selected?'var(--accent)':'var(--warn)')+'" stroke-width="'+(selected?0.4:0.2)+'" stroke-dasharray="1 0.6"/>';
    else if(p.kind === 'door') shape = '<rect width="'+w+'" height="'+hh+'" fill="var(--good)" fill-opacity="0.85" stroke="'+(selected?'var(--accent)':'none')+'" stroke-width="0.4"/>';
    else shape = '<rect width="'+w+'" height="'+hh+'" rx="0.4" fill="'+(p.kind==='stage'?'var(--accent)':p.kind==='bar'?'var(--t3)':p.kind==='speaker'?'var(--ink-2)':'var(--surface)')+'" fill-opacity="'+(p.kind==='stage'||p.kind==='bar'||p.kind==='speaker'?0.85:1)+'" stroke="'+(selected?'var(--accent)':'var(--ink-3)')+'" stroke-width="'+(selected?0.4:0.18)+'"/>';
    const light = p.kind==='stage'||p.kind==='bar'||p.kind==='speaker';
    const lbl = p.label || def.label;
    const vert = !def.round && !def.text && hh > w*1.4, longSide = Math.max(w,hh), fsz = def.text?fs*1.2:Math.min(fs, Math.max(0.7, longSide/Math.max(4,lbl.length)*1.6));
    pcs += '<g data-piece="'+p.id+'" transform="translate('+p.x+' '+p.y+')" style="cursor:'+(S.readOnly?'pointer':'move')+'">'+shape+'<text x="'+w/2+'" y="'+(hh/2+fsz*0.35)+'"'+(vert?' transform="rotate(-90 '+w/2+' '+hh/2+')"':'')+' text-anchor="middle" font-size="'+fsz+'" font-family="IBM Plex Sans, system-ui, sans-serif" font-weight="600" fill="'+(light?'var(--accent-ink)':'var(--ink)')+'" style="pointer-events:none">'+esc(lbl)+'</text></g>';
  });
  h += '<div><svg class="room" id="room" viewBox="-1 -1 '+(W+2)+' '+(D+2)+'" style="width:100%;height:auto;max-height:72vh" role="img" aria-label="Room layout, '+W+' by '+D+' feet"><rect x="0" y="0" width="'+W+'" height="'+D+'" fill="var(--floor)" stroke="var(--ink)" stroke-width="0.35"/>'+g.join('')+pcs+'</svg></div>';
  const tally = {}; L.pieces.forEach(p => { const k = (LAYOUT_PIECES[p.kind]||{}).label || p.kind; tally[k] = (tally[k]||0)+1; });
  h += '<div class="legend">'+(Object.keys(tally).length ? Object.entries(tally).map(([k,v]) => '<span class="mono">'+v+' × '+esc(k)+'</span>').join('') : '<span>Empty room. Add pieces from the list above.</span>')+'</div>';
  const stages = L.pieces.filter(p => p.kind === 'stage').length;
  if(stages) h += '<p class="hint">Stage: '+stages+' module'+(stages>1?'s':'')+' = '+(stages*24)+' sq ft of deck.</p>';
  return h + '</div>';
}
function planHTML(ev){
  const L = ev.layout;
  let h = '<div class="panel"><div class="row"><label class="btn small'+(S.readOnly?'':' ')+'">⤒ '+(L.image?'Replace floor plan':'Upload floor plan')+'<input type="file" id="planUpload" hidden accept="image/*"'+ro()+'></label>'+(L.image?'<button class="btn small '+(S.placing?'primary':'')+'" data-act="placing"'+ro()+'>'+(S.placing?'Click the plan to drop a pin…':'+ Add pin')+'</button>':'')+'<span class="hint">'+L.pins.length+' pin'+(L.pins.length===1?'':'s')+'</span></div>';
  if(!L.image) return h + '<div class="empty"><h3>No floor plan yet</h3><p>Upload a photo or image of the venue map (PNG or JPG). Then drop pins for the stage, bar, vendor tables, entrances and anything else people need to find.</p></div></div>';
  h += '<div class="plan'+(S.placing?' placing':'')+'" id="plan"><img src="'+esc(blobUrl(L.image))+'" alt="Venue floor plan" draggable="false">';
  L.pins.forEach((p,i) => { const selected = S.drawer && S.drawer.type==='pin' && S.drawer.id===p.id; h += '<button class="pin'+(selected?' sel':'')+'" data-pin="'+p.id+'" style="left:'+p.x+'%;top:'+p.y+'%"><span class="pl">'+esc(p.label||p.kind||'Pin')+'</span><span class="pt" style="background:var(--'+['t1','t2','t3','t4','t5'][PIN_KINDS.indexOf(p.kind)%5 < 0 ? 0 : PIN_KINDS.indexOf(p.kind)%5]+')"></span></button>'; });
  h += '</div>';
  if(L.pins.length) h += '<div class="legend">'+L.pins.map(p => '<span>'+esc(p.label||p.kind)+(p.contactId?' · '+esc((ev.contacts.find(c => c.id===p.contactId)||{}).name||''):'')+'</span>').join('')+'</div>';
  return h + '</div>';
}
function pinDrawer(ev,p){
  let h = '<div class="dh"><div><div class="eyebrow">Floor plan pin</div><h3 style="margin-top:2px">'+esc(p.label||'New pin')+'</h3></div><button class="iconbtn" data-act="closeDrawer" aria-label="Close">✕</button></div><div class="db">';
  h += '<div class="field"><label for="p-label">Label</label><input id="p-label" data-edit="pins|'+p.id+'|label" value="'+esc(p.label)+'"'+ro()+'></div>';
  h += '<div class="field"><label for="p-kind">Kind</label>'+sel('pins',p.id,'kind',p.kind,PIN_KINDS).replace('<select','<select id="p-kind"')+'</div>';
  h += '<div class="field"><label for="p-who">Who’s here</label><select id="p-who" data-edit="pins|'+p.id+'|contactId"'+ro()+'><option value="">Nobody linked</option>'+ev.contacts.map(c => '<option value="'+c.id+'"'+(c.id===p.contactId?' selected':'')+'>'+esc((c.name||'To confirm')+(c.role?' · '+c.role:''))+'</option>').join('')+'</select></div>';
  h += '<div class="field"><label for="p-notes">Notes</label><textarea id="p-notes" rows="3" data-edit="pins|'+p.id+'|notes"'+ro()+'>'+esc(p.notes)+'</textarea></div>';
  return h + '</div><div class="df"><button class="btn ghost danger" data-act="del" data-list="pins" data-id="'+p.id+'"'+ro()+'>Delete pin</button><button class="btn primary" data-act="closeDrawer">Done</button></div>';
}
function pieceDrawer(ev,p){
  const def = LAYOUT_PIECES[p.kind] || LAYOUT_PIECES.label;
  let h = '<div class="dh"><div><div class="eyebrow">'+esc(def.label)+'</div><h3 style="margin-top:2px">'+esc(p.label||def.label)+'</h3></div><button class="iconbtn" data-act="closeDrawer" aria-label="Close">✕</button></div><div class="db">';
  h += '<div class="field"><label for="pc-label">Label</label><input id="pc-label" data-edit="pieces|'+p.id+'|label" value="'+esc(p.label)+'" placeholder="'+esc(def.label)+'"'+ro()+'></div>';
  h += '<div class="facts two"><div class="field"><label for="pc-w">Width (ft)</label><input id="pc-w" type="number" min="0.5" step="0.5" data-edit="pieces|'+p.id+'|w" value="'+p.w+'"'+ro()+'></div><div class="field"><label for="pc-h">Depth (ft)</label><input id="pc-h" type="number" min="0.5" step="0.5" data-edit="pieces|'+p.id+'|h" value="'+p.h+'"'+ro()+'></div></div>';
  h += '<div class="row"><button class="btn small" data-act="rotPiece" data-id="'+p.id+'"'+ro()+'>Rotate 90°</button><button class="btn small" data-act="dupPiece" data-id="'+p.id+'"'+ro()+'>Duplicate</button></div>';
  h += '<p class="hint">Position: '+(+p.x).toFixed(1)+' ft from the left wall, '+(+p.y).toFixed(1)+' ft from the top wall.</p>';
  return h + '</div><div class="df"><button class="btn ghost danger" data-act="del" data-list="pieces" data-id="'+p.id+'"'+ro()+'>Remove piece</button><button class="btn primary" data-act="closeDrawer">Done</button></div>';
}

/* ---------- share pages ---------- */
function shareHTML(ev){
  const a = S.shareAud;
  const rows = daySchedule(ev).filter(x => a==='Internal' || (x.audiences||[]).includes(a));
  const people = ev.contacts.filter(c => a==='Internal' || (c.audiences||[]).includes(a));
  const gear = a === 'Vendors' ? ev.equipment.filter(e => e.source === 'Vendor brings') : [];
  let h = '<div class="panel"><div class="panel-head"><div><h2>Share pages</h2><p class="hint">One itinerary per group, built from the tags you set on the Run of show and People tabs. New items show up here the moment they’re tagged. Deadlines and money never appear on share pages.</p></div><div class="seg" role="group" aria-label="Audience">'+AUD.map(x => '<button data-act="shareAud" data-aud="'+x+'" aria-pressed="'+(x===a)+'">'+x+'</button>').join('')+'</div></div>';
  const L = S.links[ev.id]; if(!L) loadLinks(ev.id);
  const link = L && L[a];
  h += '<div class="field"><span class="lbl">Private link for '+esc(a)+'</span>'+(!store.links?noLinksHint('share-page'):link?'<div class="row"><input class="inline-in mono" style="flex:1;min-width:220px;font-size:12.5px" readonly value="'+esc(link.page)+'" aria-label="Share link"><button class="btn primary small" data-act="copyLink" data-url="'+esc(link.page)+'">Copy link</button><a class="btn small" href="'+esc(link.page)+'" target="_blank" rel="noopener">Open</a></div><span class="hint">Anyone with this link sees this page, and it updates whenever you change the event. Text or email it to the group.</span>':'<span class="hint">Making the link…</span>')+'</div>';
  h += '<div class="row"><button class="btn small" data-act="quickExport" data-which="share:'+a+'" data-fmt="pdf">'+esc(a)+' itinerary as PDF</button><button class="btn small" data-act="quickExport" data-which="share:'+a+'" data-fmt="word">As Word</button>'+(link?'<button class="btn small" data-act="copyLink" data-url="'+esc(link.webcal)+'" data-label="Calendar subscription link">Copy calendar subscription link</button>':'')+'<button class="btn small" data-act="icsAud">Calendar file (.ics)</button></div></div>';
  h += '<div class="sheet"><div class="sheet-top"><span class="k">'+esc(ev.series||'Blackmagic Media')+' · '+esc(a)+' itinerary</span><h2>'+esc(ev.name||'Untitled event')+'</h2><div class="m"><span>'+esc(fmtLong(ev.date))+'</span>'+(ev.venue?'<span>'+esc(ev.venue)+'</span>':'')+(ev.address?'<span>'+esc(ev.address)+'</span>':'')+'</div></div><div class="sheet-body">';
  if(ev.about) h += '<p>'+esc(ev.about)+'</p>';
  h += '<div><div class="eyebrow" style="margin-bottom:6px">Your schedule</div>'+(rows.length?'':'<p class="muted">Nothing is tagged for this group yet.</p>');
  rows.forEach(x => h += '<div class="sheet-row"><span class="t">'+fmt12(x.s)+(x.kind==='setup'?' – '+fmt12(x.e):'')+'</span><div>'+esc((x.who?x.who+' · ':'')+x.title)+'<div class="d">'+esc(x.kind==='setup'?x.track:(x.e-x.s)+' min')+'</div></div></div>');
  h += '</div>';
  if(gear.length) h += '<div><div class="eyebrow" style="margin-bottom:6px">Bring with you</div>'+gear.map(e => '<div class="sheet-row"><span class="t">'+e.qty+' ×</span><div>'+esc(e.item)+(e.owner?'<div class="d">'+esc(e.owner)+'</div>':'')+'</div></div>').join('')+'</div>';
  if(ev.kind === 'venue' && ev.houseRules.length) h += '<div><div class="eyebrow" style="margin-bottom:6px">House rules</div>'+ev.houseRules.map(r => '<div class="sheet-row"><span class="t">•</span><div>'+esc(r)+'</div></div>').join('')+'</div>';
  h += '<div><div class="eyebrow" style="margin-bottom:6px">Who to contact</div>'+(people.length?'':'<p class="muted">No contacts are tagged for this group.</p>');
  people.forEach(p => { const phone = (a==='Internal' || p.showPhone) && p.phone ? '<span class="mono">'+esc(p.phone)+'</span>' : '<span class="hint">Number shared on request</span>'; h += '<div class="contact"><div><b>'+esc(p.name||'Name to confirm')+'</b><div class="muted" style="font-size:13px">'+esc([p.role,p.org].filter(Boolean).join(' · '))+'</div></div><div style="text-align:right">'+phone+(p.invoiceUrl && /^https:\/\//.test(p.invoiceUrl) && a!=='Internal' ? '<div><a href="'+esc(p.invoiceUrl)+'" target="_blank" rel="noopener">Your quote or invoice</a></div>':'')+'</div></div>'; });
  return h + '</div></div></div>';
}

/* ---------- calendar ---------- */
function calendarHTML(ev){
  const today = todayYMD();
  if(!S.calMonth) S.calMonth = (today < ev.date ? today : ev.date).slice(0,7);
  const [y,m] = S.calMonth.split('-').map(Number);
  const startDow = new Date(toUTC(S.calMonth+'-01')).getUTCDay(), daysIn = new Date(Date.UTC(y,m,0)).getUTCDate(), cells = Math.ceil((startDow+daysIn)/7)*7;
  const byDate = {}; const push = (d,o) => { (byDate[d] = byDate[d]||[]).push(o); };
  ev.milestones.forEach(ms => { const d = addDays(ev.date,Number(ms.offset)||0); push(d,{t:ms.title, cls:ms.status==='done'?'done':(d<today?'late':''), hard:ms.hard, act:'openMs', id:ms.id}); });
  ev.compliance.forEach(c => { const d = addDays(ev.date,Number(c.offset)||0); push(d,{t:c.item, cls:'cp '+(c.status==='approved'?'done':(d<today?'late':'')), act:'tab', tab:'compliance'}); });
  ev.budget.filter(b => b.kind === 'cost' && isYMD(b.due)).forEach(b => push(b.due,{t:'Pay: '+(b.item||b.cat), cls:'pay '+(b.status==='paid'?'done':(b.due<today?'late':'')), act:'tab', tab:'budget'}));
  let h = '<div class="panel"><div class="panel-head"><div><h2>Calendar</h2><p class="hint">Every deadline, paperwork date and payment due. Download the file to add them all to Google, Outlook or Apple Calendar at once.</p></div><div class="row"><button class="btn small" data-act="cal" data-dir="-1" aria-label="Previous month">←</button><b style="min-width:130px;text-align:center">'+MONL[m-1]+' '+y+'</b><button class="btn small" data-act="cal" data-dir="1" aria-label="Next month">→</button><button class="btn primary small" data-act="icsAll">Download all dates (.ics)</button></div></div>';
  h += '<div style="overflow-x:auto"><div class="cal">'+DOW.map(d => '<div class="dow">'+d+'</div>').join('');
  for(let i=0;i<cells;i++){
    const dn = i-startDow+1;
    if(dn<1 || dn>daysIn){ h += '<div class="day out"></div>'; continue; }
    const d = S.calMonth+'-'+pad(dn);
    h += '<div class="day'+(d===today?' today':'')+(d===ev.date?' showday':'')+'"><span class="n">'+dn+'</span>'+(d===ev.date?'<span class="ev show">★ '+esc(ev.name)+'</span>':'');
    (byDate[d]||[]).forEach(o => h += '<button class="ev '+o.cls+'" data-act="'+o.act+'"'+(o.id?' data-id="'+o.id+'"':'')+(o.tab?' data-tab="'+o.tab+'"':'')+' title="'+esc(o.t)+'">'+(o.hard?'◆ ':'')+esc(o.t)+'</button>');
    h += '</div>';
  }
  h += '</div></div><div class="legend"><span><i style="background:var(--accent)"></i>Show day</span><span><i style="background:var(--good-soft);border:1px solid var(--good)"></i>Done</span><span><i style="background:var(--crit-soft);border:1px solid var(--crit)"></i>Overdue</span><span><i style="background:var(--warn)"></i>Paperwork</span><span><i style="background:var(--t2)"></i>Payment</span><span>◆ Hard deadline</span></div>';
  const L = S.links[ev.id]; if(!L) loadLinks(ev.id);
  h += '<div class="field"><span class="lbl">Live calendar subscription (for your team)</span>'+(!store.links?noLinksHint('calendar subscription'):L?'<div class="row"><input class="inline-in mono" style="flex:1;min-width:220px;font-size:12.5px" readonly value="'+esc(L.Deadlines.calendar)+'" aria-label="Calendar feed link"><button class="btn primary small" data-act="copyLink" data-url="'+esc(L.Deadlines.calendar)+'" data-label="Calendar link">Copy link</button><a class="btn small" href="'+esc(L.Deadlines.webcal)+'">Subscribe</a></div>':'<span class="hint">Making the link…</span>')+'<span class="hint">In Google Calendar: Other calendars → From URL, then paste. In Outlook: Add calendar → Subscribe from web. Calendars refresh on their own every few hours when dates change.</span></div>';
  return h + '</div>' + remindersPanelHTML(ev);
}
function checksHTML(ev){
  const list = runChecks(ev), c = counts(list);
  let h = '<div class="panel"><div class="panel-head"><div><h2>Checks</h2><p class="hint">The app reads the whole event and flags conflicts before anything goes out: overdue items, names that don’t match, gear not secured, timing that runs long.</p></div><div class="row"><span class="pill crit">'+c.critical+' urgent</span><span class="pill warn">'+c.warning+' to review</span><span class="pill">'+c.info+' FYI</span></div></div><div class="checks">';
  if(!list.length) h += '<p class="muted">Nothing flagged. This event is consistent.</p>';
  list.forEach(x => h += checkRow(x));
  return h + '</div></div>';
}

/* ---------- drawers & modals ---------- */
function notesBtnHTML(){ const open = S.notes.filter(n => !n.done).length; return '<button class="btn primary notesbtn" data-act="notes">✎ Notes'+(open?' <span class="count" style="background:var(--accent-ink);color:var(--accent)">'+open+'</span>':'')+'</button>'; }
function drawerHTML(){
  if(!S.drawer) return '';
  if(S.drawer === 'notes'){
    let h = '<aside class="drawer'+(S.drawerStill?' still':'')+'" aria-label="Testing notes"><div class="dh"><div><h3>Testing notes</h3><span class="hint">Jot what works, what’s missing, what confused you. Each note records the screen you were on.</span></div><button class="iconbtn" data-act="closeDrawer" aria-label="Close notes">✕</button></div><div class="db">';
    h += '<div class="field"><label for="noteText">New note</label><textarea id="noteText" rows="3" placeholder="e.g. Need a place for vendor parking info"></textarea></div><button class="btn primary" data-act="saveNote"'+ro()+'>Save note</button>';
    if(!S.notes.length) h += '<p class="muted">No notes yet.</p>';
    S.notes.forEach(n => { h += '<div class="note'+(n.done?' done':'')+'"><div class="nm"><span>'+esc(n.where||'')+' · '+(n.createdAt?fmtD(new Date(n.createdAt).toISOString().slice(0,10)):'')+'</span><span class="row" style="gap:4px"><label class="toggle"><input type="checkbox" data-note="'+n.id+'"'+(n.done?' checked':'')+'> Handled</label><button class="iconbtn del" data-act="delNote" data-id="'+n.id+'" aria-label="Delete note">✕</button></span></div><p>'+esc(n.text)+'</p></div>'; });
    return h + '</div></aside>';
  }
  const ev = curEv(); if(!ev) return '';
  let inner = '';
  if(S.drawer.type === 'ms'){ const m = ev.milestones.find(x => x.id === S.drawer.id); if(m) inner = msDrawer(ev,m); }
  if(S.drawer.type === 'item') inner = itemDrawer(ev, S.drawer.id);
  if(S.drawer.type === 'pin'){ const p = ev.layout.pins.find(x => x.id === S.drawer.id); if(p) inner = pinDrawer(ev,p); }
  if(S.drawer.type === 'piece'){ const p = ev.layout.pieces.find(x => x.id === S.drawer.id); if(p) inner = pieceDrawer(ev,p); }
  return inner ? '<aside class="drawer'+(S.drawerStill?' still':'')+'" aria-label="Details">'+inner+'</aside>' : '';
}
function modalHTML(){
  const M = S.modal; if(!M) return '';
  const ev = curEv();
  let h = '<div class="scrim" data-act="closeModal"><div class="modal'+(WIDE_MODALS.has(M.type)?' wide':'')+'" role="dialog" aria-modal="true" aria-labelledby="mt" data-stop="1">';
  if(MODALS[M.type]) return h + MODALS[M.type](ev, M) + '</div></div>';
  if(M.type === 'new' || M.type === 'clone'){
    const src = M.type==='clone' ? ev : null;
    h += '<div><h2 id="mt">'+(src?'Clone for the next show':'New event')+'</h2><p class="hint">'+(src?'Copies deadlines, run of show, equipment, people, paperwork, budget lines and layout. Statuses, payments and approvals reset; every date moves to the new show day.':'Deadlines are counted back from the show date, so pick the date first.')+'</p></div>';
    h += '<div class="facts"><div class="field wide"><label for="nName">Event name</label><input id="nName" value="'+esc(src?nextName(src.name):'')+'" placeholder="e.g. Mystic Music Ep. 5"></div><div class="field"><label for="nDate">Show date</label><input id="nDate" type="date"></div><div class="field"><label for="nSeries">Series</label><input id="nSeries" value="'+esc(src?src.series:'')+'" placeholder="Optional"></div><div class="field wide"><label for="nVenue">Venue</label><input id="nVenue" value="'+esc(src?src.venue:'')+'"></div></div>';
    if(!src){
      const pick = M.tpl || (S.templates[0] ? 'lib:'+S.templates[0].id : 'showcase');
      h += '<fieldset class="opts" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">Start from</legend>';
      S.templates.forEach(t => h += '<label class="opt"><input type="radio" name="nFrom" value="lib:'+t.id+'"'+('lib:'+t.id===pick?' checked':'')+'><span><b>'+esc(t.name)+'</b> <span class="hint">· your template</span><br><span class="hint">'+esc(t.desc ? t.desc+' ' : '')+tplCounts(t.data||{})+'.</span></span></label>');
      TEMPLATES.forEach(t => h += '<label class="opt"><input type="radio" name="nFrom" value="'+t.key+'"'+(t.key===pick?' checked':'')+'><span><b>'+esc(t.label)+'</b> <span class="hint">· '+esc(t.scale)+'</span><br><span class="hint">'+esc(t.desc)+' '+t.ms.length+' deadlines, '+t.eq.length+' gear items.</span></span></label>');
      sortedEvents().forEach(e => h += '<label class="opt"><input type="radio" name="nFrom" value="ev:'+e.id+'"><span><b>Copy of '+esc(e.name)+'</b><br><span class="hint">Everything from that event, moved to the new date.</span></span></label>');
      h += '<label class="opt"><input type="radio" name="nFrom" value="pick"'+(pick==='pick'?' checked':'')+'><span><b>Start empty and pick pieces</b><br><span class="hint">Creates an empty event, then lets you tick the deadlines, setup, program, paperwork, gear and budget lines you want from any template or past event.</span></span></label>';
      h += '<label class="opt"><input type="radio" name="nFrom" value="blank"><span><b>Blank</b><br><span class="hint">Just you as event lead. Add everything yourself.</span></span></label></fieldset>';
    }
    h += '<p class="hint" id="nErr" style="color:var(--crit)"></p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="createFromModal">'+(src?'Create copy':'Create event')+'</button></div>';
  }
  if(M.type === 'export'){
    const pages = {milestones:'Deadlines',show:'Run of show',budget:'Budget',equipment:'Equipment',people:'People (with phone numbers)',compliance:'Paperwork',layout:'Layout'};
    const def = M.which || 'summary';
    h += '<div><h2 id="mt">Download PDF or Word</h2><p class="hint">Pick what to save. Files open in any PDF reader or in Word and Google Docs, ready to print or send.</p></div><fieldset class="opts" style="border:0;padding:0;margin:0">';
    const opt = (v,l,d) => '<label class="opt"><input type="radio" name="exWhich" value="'+v+'"'+(v===def?' checked':'')+'><span><b>'+l+'</b><br><span class="hint">'+d+'</span></span></label>';
    h += opt('summary','Event summary','High-level, for people outside the planning: date, venue, program, who’s involved, status and open issues.');
    h += opt('full','Full master event plan','Everything: facts, the layout, deadlines, schedule, equipment, people, paperwork, budget, approvals and open issues.');
    Object.entries(pages).forEach(([k,l]) => h += opt(k,l,k==='layout'?'The room drawn to scale and the floor plan with numbered pins. The drawing is in the PDF.':k==='budget'?'Just this section. For a spreadsheet, use Excel or CSV on the Budget tab.':'Just this section.'));
    h += '</fieldset><p class="hint">Need one file per person? Use <button class="btn small ghost" data-act="personExport" style="display:inline-flex">Download by person</button></p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-act="doExport" data-fmt="word">Download Word</button><button class="btn primary" data-act="doExport" data-fmt="pdf">Download PDF</button></div>';
  }
  if(M.type === 'pick'){
    const q = norm(M.q||''); const inEv = new Set(ev.contacts.map(c => c.personId).filter(Boolean)); const keys = new Set(ev.contacts.map(personKey));
    const list = S.people.filter(p => !inEv.has(p.id) && !keys.has(personKey(p)) && (!q || norm([p.name,p.org,p.role].join(' ')).includes(q)));
    h += '<div><h2 id="mt">Add from contacts</h2><p class="hint">Pick people to add to this event. You can set their role and tags after.</p></div><div class="field"><label for="pickQ">Search</label><input id="pickQ" value="'+esc(M.q||'')+'" placeholder="Name or organization"></div><div class="opts">';
    list.forEach(p => h += '<label class="opt"><input type="checkbox" name="pickP" value="'+p.id+'"><span><b>'+esc(p.name||p.org)+'</b><br><span class="hint">'+esc([p.role,p.org,p.phone].filter(Boolean).join(' · '))+'</span></span></label>');
    if(!list.length) h += '<p class="muted">'+(S.people.length?'Everyone matching is already on this event.':'Your contacts directory is empty. Save people from any event, or import them on the Contacts page.')+'</p>';
    h += '</div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doPick"'+ro()+'>Add selected</button></div>';
  }
  if(M.type === 'send'){
    const c = ev.contacts.find(x => x.id === M.id); if(!c) return '';
    const a = (c.audiences||[]).find(x => x !== 'Internal') || 'Internal';
    const L = S.links[ev.id]; if(!L) loadLinks(ev.id);
    const pk = ev.id+'|'+c.id; if(store.links && !S.personLinks[pk]) loadPersonLink(ev.id, c.id);
    const mine = personTasks(ev, c.name || c.org), hasTasks = mine.deadlines.length + mine.paperwork.length + mine.equipment.length > 0;
    const msg = sendMessage(ev,c,a,L && L[a] ? L[a].page : '', hasTasks ? S.personLinks[pk] : '');
    h += '<div><h2 id="mt">Send '+esc(c.name||'this person')+' their page</h2><p class="hint">Copy this message into a text or email. It includes their private link, which always shows the latest plan.</p></div>';
    if(hasTasks) h += '<div class="banner info">'+esc(c.name||'This person')+' owns '+(mine.deadlines.length+mine.paperwork.length+mine.equipment.length)+' task'+(mine.deadlines.length+mine.paperwork.length+mine.equipment.length>1?'s':'')+'. '+(store.links?(S.personLinks[pk]?'Their private “My tasks” link is in the message; they can mark things done there without logging in.':'Making their “My tasks” link…'):'On the live site, the message also includes their private “My tasks” link.')+' <button class="btn small ghost" data-act="quickExport" data-which="person:'+esc(c.name||c.org)+'" data-fmt="pdf">Their tasks as PDF</button></div>';
    h += '<textarea class="aiout" id="sendText" style="min-height:220px">'+esc(msg)+'</textarea><div class="row">'+(c.phone?'<span class="hint">Phone: <span class="mono">'+esc(c.phone)+'</span></span>':'')+(c.email?'<span class="hint">Email: <span class="mono">'+esc(c.email)+'</span></span>':'')+'</div>';
    h += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn" data-act="quickExport" data-which="share:'+a+'" data-fmt="pdf">'+esc(a)+' itinerary PDF</button><button class="btn" data-act="icsFor" data-aud="'+a+'">Calendar file</button><button class="btn primary" data-act="copySend">Copy message</button></div>';
  }
  return h + '</div></div>';
}
function sendMessage(ev,c,a,link,taskLink){
  const lead = ev.contacts.find(x => /lead|manager/i.test(x.role||'') && x.name) || ev.contacts[0] || {};
  const rows = daySchedule(ev).filter(x => a==='Internal' || (x.audiences||[]).includes(a));
  let t = 'Hi '+(c.name ? c.name.split(/[ &]/)[0] : 'there')+',\n\nHere are the details for '+ev.name+' on '+fmtLong(ev.date)+(ev.venue?' at '+ev.venue:'')+(ev.address?', '+ev.address:'')+'.\n';
  if(c.role) t += 'You’re with us as: '+c.role+'.\n';
  if(rows.length) t += '\nYour schedule:\n'+rows.map(x => '- '+fmt12(x.s)+(x.kind==='setup'?'–'+fmt12(x.e):'')+' '+(x.who?x.who+': ':'')+x.title).join('\n')+'\n';
  const gear = ev.equipment.filter(e => e.source === 'Vendor brings' && e.owner && (norm(e.owner).includes(norm(c.name)) || (c.org && norm(e.owner).includes(norm(c.org)))));
  if(gear.length) t += '\nPlease bring:\n'+gear.map(e => '- '+e.qty+' × '+e.item).join('\n')+'\n';
  if(link) t += '\nYour page (always up to date): '+link+'\n';
  if(taskLink) t += '\nYour tasks for this event (mark them done here): '+taskLink+'\n';
  if(c.invoiceUrl) t += '\nYour quote or invoice: '+c.invoiceUrl+'\n';
  t += '\nQuestions? Reach '+(lead.name||'me')+(lead.phone && lead !== c?' at '+lead.phone:'')+'.\n\nThanks!';
  return t;
}
function nextName(n){ const m = String(n||'').match(/^(.*?)(\d+)(\D*)$/); return m ? m[1]+(Number(m[2])+1)+m[3] : (n ? n+' (copy)' : ''); }
function cloneEvent(src){
  const c = normalize(clone(src), src.id);
  ['milestones','setup','contacts','compliance','equipment','budget'].forEach(k => c[k].forEach(x => x.id = uid()));
  c.program.items.forEach(x => x.id = uid());
  c.layout.pins.forEach(x => { x.id = uid(); x.contactId = ''; }); c.layout.pieces.forEach(x => x.id = uid());
  c.milestones.forEach(x => { x.status = 'todo'; x.doneAt = ''; x.checklist.forEach(s => s.done = false); });
  c.budget.forEach(b => { b.actual = ''; b.paid = ''; b.due = ''; b.files = []; b.status = b.kind === 'income' ? 'expected' : 'estimated'; });
  c.approvals = []; c.wrapup = {ratings:{}};
  c.compliance.forEach(x => { x.status = 'needed'; x.expires = ''; x.files = []; });
  c.equipment.forEach(x => x.status = 'needed');
  delete c.aiSummary; delete c.createdAt;   // aiSummary: left over from the old AI meeting summary
  return c;
}
