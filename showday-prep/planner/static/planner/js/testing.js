/* ==========================================================================
   testing.js — [beta] the testing program, on the screens' side.

   1. A small usage log. Every few seconds the page sends the server a short
      list of what happened: the NAME of each button pressed ("newEvent"), the
      screen opened ("event/budget"), pop-ups started, finished or given up on,
      and any error the page hit. Nothing anyone types is ever sent.
   2. "How easy was that?" After a big task (creating an event, importing a
      list, emailing a group) a small card asks for 1 to 5. One click, or ignore it.
   3. The Testing report page (Blackmagic team only): who's testing, what they
      use, where they get stuck, errors, ratings, and the feedback inbox (notes
      testers sent with "Send to the MagicShow team").

   The server side is planner/testing.py. Only the live site sends anything;
   the prototype has no store.telemetry, so none of this runs there.
   ========================================================================== */
const TM = {queue:[], session: Math.random().toString(36).slice(2, 12), screen:'', modal:'', modalDone:false, asked:{}};
function tmOn(){ return typeof store.telemetry === 'function' && S.mode === 'live'; }
function tmScreen(){ return S.view === 'event' ? 'event/'+(String(S.tab).startsWith('ct:') ? 'custom-tab' : S.tab) : S.view; }
function tmLog(kind, name, detail){
  if(!tmOn() || !name) return;
  TM.queue.push({kind, name:String(name).slice(0, 120), screen:tmScreen(), detail:String(detail == null ? '' : detail).slice(0, 300)});
  if(TM.queue.length >= 50) tmFlush();
}
function tmFlush(){
  if(!TM.queue.length || !tmOn()) return;
  const events = TM.queue.splice(0, 60);
  store.telemetry({session:TM.session, events});
}
setInterval(tmFlush, 8000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') tmFlush(); });
window.addEventListener('pagehide', tmFlush);

/* Buttons pressed, screens opened, pop-ups finished or abandoned. Runs after the button has done its work. */
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-act]'); if(!el || !tmOn()) return;
  const act = el.dataset.act, inModal = !!el.closest('.modal'), primary = el.classList.contains('primary');
  if(act !== 'closeModal' || !el.classList.contains('scrim') || e.target === el) tmLog('action', act);
  if(inModal && primary) TM.modalDone = true;   // the pop-up's main button (Create, Import, Send, or Done on pop-ups without one)
  setTimeout(tmAfter, 0);
}, true);
document.addEventListener('keydown', e => { if(e.key === 'Escape') setTimeout(tmAfter, 0); });
function tmAfter(){
  const scr = tmScreen(); if(scr !== TM.screen){ TM.screen = scr; tmLog('view', scr); }
  const m = S.modal ? S.modal.type : '';
  if(m !== TM.modal){
    const quiet = x => x === 'helpGuide';   // reading pop-ups have nothing to finish
    if(TM.modal && !quiet(TM.modal)) tmLog('flow', (TM.modalDone ? 'done:' : 'abandon:')+TM.modal);
    if(m && !quiet(m)) tmLog('flow', 'start:'+m);
    TM.modal = m; TM.modalDone = false;
  }
}
/* Errors: the message and where, so they can be fixed. */
window.addEventListener('error', e => { tmLog('error', (e.message || 'Script error').slice(0, 120), (e.filename ? e.filename.split('/').pop() : '')+':'+(e.lineno||'')+':'+(e.colno||'')); });
window.addEventListener('unhandledrejection', e => { const r = e.reason; tmLog('error', String(r && r.message || r || 'Unhandled error').slice(0, 120), r && r.stack ? String(r.stack).split('\n').slice(1, 3).join(' | ') : ''); });

/* ---------- "How easy was that?" ---------- */
function askRating(name, what){
  if(!tmOn() || TM.asked[name]) return;
  TM.asked[name] = true;
  setTimeout(() => {
    let el = document.getElementById('rateCard'); if(el) el.remove();
    el = document.createElement('div'); el.id = 'rateCard'; el.className = 'ratecard'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'How easy was that?');
    el.innerHTML = '<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>How easy was '+esc(what)+'?</b><button class="iconbtn" data-rate="x" aria-label="No thanks">✕</button></div><div class="row rate">'+[1,2,3,4,5].map(n => '<button class="btn small" data-rate="'+n+'" aria-label="'+n+' out of 5">'+n+'</button>').join('')+'</div><div class="row hint" style="justify-content:space-between"><span>Hard</span><span>Easy</span></div>';
    el.dataset.name = name; document.body.appendChild(el);
    setTimeout(() => { const c = document.getElementById('rateCard'); if(c && c.dataset.name === name) c.remove(); }, 30000);
  }, 900);
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rate]'); if(!b) return;
  const card = document.getElementById('rateCard'); if(!card) return;
  if(b.dataset.rate !== 'x'){ tmLog('rating', card.dataset.name, b.dataset.rate); tmFlush(); toast(Number(b.dataset.rate) <= 2 ? 'Thanks. Use ✎ Notes to tell us what was hard; it goes straight to the team.' : 'Thanks for rating it.'); }
  card.remove();
});
/* Ask after a new event is made (the New event pop-up's Create button). */
(function(){
  const make = actions.createFromModal;
  actions.createFromModal = function(){ const n = Object.keys(S.events).length; const r = make.apply(this, arguments); if(Object.keys(S.events).length > n) askRating('new-event', 'creating that event'); return r; };
})();

/* ---------- the Testing report (Blackmagic team) ---------- */
const ACTION_NAMES = {newEvent:'+ New event', createFromModal:'Create event', addMs:'+ Add deadline', openMs:'Open a deadline', addSub:'Add a step', export:'Download PDF / Word', doExport:'Download (from the pop-up)', quickExport:'Quick download', importList:'Import a list', doImportList:'Import (confirm)', emailGroup:'Email a group', doEmailGroup:'Send group email', emailOne:'Email one person', editGroups:'Edit groups', addPiece:'Add a layout piece', addPerson:'+ Add person', pickPeople:'Add from contacts', send:'Send page', copySend:'Copy message', notes:'✎ Notes', saveNote:'Save note', cloneThis:'Clone for next show', nextInSeries:'Add next in series', openSeries:'Open a series', tabsModal:'Tabs', addTab:'Add a tab', team:'Team page', askJoin:'Ask to join', makeInvite:'Make invite link', decideJoin:'Approve or decline', helpPop:'? help', helpGuide:'Help guide', budgetXlsx:'Budget to Excel', budgetCsv:'Budget to CSV', layoutView:'Layout view', tab:'Switch tab', open:'Open an event', home:'All events',
  closeModal:'Close a pop-up', closeDrawer:'Close a side panel', contacts:'Contacts page', dirTag:'Filter contacts by tag', pplView:'People: team / group lists', rosterGroup:'Group list filter', viewList:'Open a group list', shareAud:'Pick a share page', addGroup:'Add a group', festivalGroups:'Add festival groups', msView:'Board / list', showView:'Run of show view', reports:'Reports page', library:'Templates page', hours:'Hours page', testing:'Testing report', gsHide:'Hide Getting started', addRoster:'Add one to a list', toTeam:'Move to team', openTask:'Open an assigned task', copyLink:'Copy a link', icsAud:'Calendar file', saveAsTemplate:'Save as template', logTime:'Log time', account:'Account'};
const FLOW_NAMES = {'new':'New event', clone:'Clone for next show', importList:'Import a list', emailGroup:'Email a group', editGroups:'Edit groups', export:'Download PDF / Word', pick:'Add from contacts', send:'Send page', tabs:'Tabs', joinOrg:'Ask to join', newWorkspace:'New organization', helpGuide:'Help guide', approval:'Approval request', account:'Account', pieces:'Pick pieces'};
const RATING_NAMES = {'new-event':'Creating an event', 'import-list':'Importing a list', 'email-group':'Emailing a group'};

async function loadReport(){
  if(!store.testingReport || S.repLoading) return;
  S.repLoading = true;
  try { S.testRep = await store.testingReport(S.repDays || 7); } catch(e){ S.testRep = {error:e.message || 'Couldn’t load the report.'}; }
  S.repLoading = false; softRender();
}
function weeklyText(R){
  const L = [];
  L.push('MagicShow testing report: last '+R.days+' days');
  L.push(R.people+' people tested in '+R.sessions+' sessions'+(R.workspaces.length ? ', in '+R.workspaces.map(w => w.name).join(', ') : '')+'.');
  if(R.ratings.length) L.push('', 'How easy it was (1–5):', ...R.ratings.map(r => '- '+(RATING_NAMES[r.name]||r.name)+': '+r.avg+' from '+r.count+' answers'+(r.low ? ' ('+r.low+' said 1 or 2)' : '')));
  const stuck = R.stuck.filter(s => s.abandon);
  if(stuck.length) L.push('', 'Where people gave up:', ...stuck.slice(0, 6).map(s => '- '+(FLOW_NAMES[s.name]||s.name)+': '+s.abandon+' of '+s.start+' closed without finishing ('+s.rate+'%)'));
  if(R.errors.length) L.push('', 'Errors:', ...R.errors.slice(0, 6).map(x => '- '+x.message+' ('+x.count+' times, '+x.people+' people, on '+x.screen+')'));
  L.push('', 'Most used:', ...R.actions.slice(0, 8).map(a => '- '+(ACTION_NAMES[a.name]||a.name)+': '+a.count));
  const fb = R.feedback.filter(f => !f.done);
  if(fb.length) L.push('', 'Open feedback ('+fb.length+'):', ...fb.slice(0, 15).map(f => '- '+f.by+(f.org ? ' ('+f.org+')' : '')+', '+f.where+': '+f.text));
  return L.join('\n');
}
function testingHTML(){
  if(!S.user || !S.user.team) return '<div class="empty"><h2>For the Blackmagic team</h2><p>The testing report is only for the MagicShow team.</p></div>';
  const R = S.testRep; if(!R) loadReport();
  let h = '<div class="head"><div><div class="eyebrow">Beta testing</div><h1>Testing report</h1><p class="muted" style="margin-top:6px;max-width:66ch">What testers did, where they got stuck, and what they told us, across every workspace. It records the names of buttons and screens only, never what anyone typed.</p></div><div class="row"><div class="seg" role="group" aria-label="Period">'+[7,30,90].map(d => '<button data-act="repDays" data-v="'+d+'" aria-pressed="'+((S.repDays||7)===d)+'">'+d+' days</button>').join('')+'</div>'+(R && !R.error ? '<button class="btn primary" data-act="copyReport">Copy weekly summary</button>' : '')+'</div></div>';
  if(!R) return h + '<div class="empty"><p>Loading the report…</p></div>';
  if(R.error) return h + '<div class="banner">'+esc(R.error)+'</div>';
  const fbOpen = R.feedback.filter(f => !f.done).length;
  h += '<div class="stats"><div class="stat"><b>'+R.people+'</b><span>People testing</span></div><div class="stat"><b>'+R.sessions+'</b><span>Sessions</span></div><div class="stat"><b>'+R.errors.reduce((a,x) => a + x.count, 0)+'</b><span>Errors</span></div><div class="stat"><b>'+fbOpen+'</b><span>Feedback to read</span></div></div>';

  h += '<div class="panel"><div class="panel-head"><div><h2>Feedback inbox</h2><p class="hint">Notes testers sent with “Send to the MagicShow team”, newest first. Tick Handled when it’s been dealt with.</p></div><div class="seg" role="group" aria-label="Show"><button data-act="fbShow" data-v="open" aria-pressed="'+(S.fbShow!=='all')+'">To read ('+fbOpen+')</button><button data-act="fbShow" data-v="all" aria-pressed="'+(S.fbShow==='all')+'">All ('+R.feedback.length+')</button></div></div>';
  const fb = R.feedback.filter(f => S.fbShow === 'all' || !f.done);
  if(!fb.length) h += '<p class="muted">'+(R.feedback.length ? 'Everything has been handled.' : 'No feedback in this period yet.')+'</p>';
  fb.forEach(f => h += '<div class="note'+(f.done?' done':'')+'"><div class="nm"><span><b>'+esc(f.by||'Someone')+'</b>'+(f.org ? ' · '+esc(f.org) : '')+' · '+esc(f.where||'')+' · '+esc(fmtD(new Date(f.at).toISOString().slice(0,10)))+'</span><label class="toggle"><input type="checkbox" data-fb="'+esc(f.id)+'"'+(f.done?' checked':'')+'> Handled</label></div><p>'+esc(f.text)+'</p></div>');
  h += '</div>';

  h += '<div class="grid2">';
  h += '<div class="panel"><h2>How easy it was</h2><p class="hint">Answers to “How easy was that?” after big tasks, from 1 (hard) to 5 (easy). Lowest first.</p>'+(R.ratings.length ? '<div class="tablewrap"><table><thead><tr><th>Task</th><th>Average</th><th>Answers</th><th>Said 1–2</th></tr></thead><tbody>'+R.ratings.map(r => '<tr><td>'+esc(RATING_NAMES[r.name]||r.name)+'</td><td class="mono"><b>'+r.avg+'</b></td><td class="mono">'+r.count+'</td><td class="mono">'+(r.low ? '<span class="pill warn">'+r.low+'</span>' : '0')+'</td></tr>').join('')+'</tbody></table></div>' : '<p class="muted">No ratings yet.</p>')+'</div>';
  h += '<div class="panel"><h2>Where people gave up</h2><p class="hint">Pop-ups that were opened and then closed without pressing the main button.</p>'+(R.stuck.length ? '<div class="tablewrap"><table><thead><tr><th>Pop-up</th><th>Opened</th><th>Finished</th><th>Gave up</th></tr></thead><tbody>'+R.stuck.map(s => '<tr><td>'+esc(FLOW_NAMES[s.name]||s.name)+'</td><td class="mono">'+s.start+'</td><td class="mono">'+s.done+'</td><td class="mono">'+(s.abandon ? '<span class="pill '+(s.rate >= 50 ? 'crit' : 'warn')+'">'+s.abandon+' · '+s.rate+'%</span>' : '0')+'</td></tr>').join('')+'</tbody></table></div>' : '<p class="muted">Nothing yet.</p>')+'</div>';
  h += '</div>';

  h += '<div class="panel"><h2>Errors</h2><p class="hint">Problems the page ran into, grouped by message. Give the message and screen to the programmer.</p>'+(R.errors.length ? '<div class="tablewrap"><table><thead><tr><th>Message</th><th>Times</th><th>People</th><th>Screen</th><th>Where in the code</th><th>Last seen</th></tr></thead><tbody>'+R.errors.map(x => '<tr><td>'+esc(x.message)+'</td><td class="mono">'+x.count+'</td><td class="mono">'+x.people+'</td><td>'+esc(x.screen)+'</td><td class="mono hint">'+esc(x.detail)+'</td><td class="mono">'+esc(fmtD(new Date(x.last).toISOString().slice(0,10)))+'</td></tr>').join('')+'</tbody></table></div>' : '<p class="muted">No errors. Good.</p>')+'</div>';

  const top = R.actions.slice(0, 15), max = top.length ? top[0].count : 1;
  h += '<div class="grid2"><div class="panel"><h2>Most used buttons</h2>'+(top.length ? '<div class="usage">'+top.map(a => '<div class="urow"><span>'+esc(ACTION_NAMES[a.name]||a.name)+'</span><span class="ubar"><i style="width:'+Math.max(3, Math.round(a.count/max*100))+'%"></i></span><span class="mono">'+a.count+'</span></div>').join('')+'</div>' : '<p class="muted">Nothing yet.</p>')+'</div>';
  const used = new Set(R.actions.map(a => a.name)), unused = Object.keys(ACTION_NAMES).filter(k => !used.has(k));
  h += '<div class="panel"><h2>Screens opened</h2>'+ (R.views.length ? '<div class="tablewrap"><table><tbody>'+R.views.map(v => '<tr><td>'+esc(v.name)+'</td><td class="mono" style="text-align:right">'+v.count+'</td></tr>').join('')+'</tbody></table></div>' : '<p class="muted">Nothing yet.</p>')+(unused.length && R.actions.length ? '<p class="hint"><b>Not pressed by anyone in this period:</b> '+unused.map(k => esc(ACTION_NAMES[k])).join(', ')+'.</p>' : '')+'</div></div>';
  if(R.workspaces.length) h += '<p class="hint">Activity by workspace: '+R.workspaces.map(w => esc(w.name)+' ('+w.events+')').join(', ')+'.</p>';
  return h;
}
Object.assign(actions, {
  testing(){ S.view = 'testing'; S.modal = null; S.drawer = null; S.testRep = null; render(); window.scrollTo(0,0); },
  repDays(el){ S.repDays = Number(el.dataset.v) || 7; S.testRep = null; render(); },
  fbShow(el){ S.fbShow = el.dataset.v; render(); },
  copyReport(){ if(S.testRep && !S.testRep.error) copyText(weeklyText(S.testRep), 'Weekly summary'); }
});
document.addEventListener('change', async e => {
  const el = e.target; if(!el.dataset || !el.dataset.fb) return;
  const f = S.testRep && S.testRep.feedback.find(x => String(x.id) === el.dataset.fb); if(f) f.done = el.checked;
  try { await store.feedbackDone(el.dataset.fb, el.checked); } catch(x){ toast(x.message || 'Couldn’t save that.'); }
  render();
});
