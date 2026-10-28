/* ==========================================================================
   series.js — [beta] series pages and an event's own tabs.

   • Series: events with the same "Series" name (Overview tab) belong together.
     The strip under the event's title shows its place in the series with links
     to the one before and after. "Add next in series" copies the latest event in
     the series to a new date. The Series page lists them all in date order.
   • Tabs: each event can hide tabs it doesn't use (ev.hiddenTabs) and add its
     own notes tabs (ev.customTabs: [{id, name, body}]). Overview is always shown.
   ========================================================================== */

/* ---------- series ---------- */
function seriesKey(s){ return norm(s); }
function seriesEvents(name){ const k = seriesKey(name); return k ? sortedEvents().filter(e => seriesKey(e.series) === k) : []; }
function allSeries(){
  const m = new Map();
  sortedEvents().forEach(e => { const k = seriesKey(e.series); if(!k) return; if(!m.has(k)) m.set(k, {name:e.series, events:[]}); m.get(k).events.push(e); });
  return [...m.values()];
}
/* Days between shows in the series (the most common gap), for the next one's date. */
function seriesGap(list){
  const gaps = []; for(let i = 1; i < list.length; i++) if(isYMD(list[i].date) && isYMD(list[i-1].date)) gaps.push(diffDays(list[i-1].date, list[i].date));
  if(!gaps.length) return 7;
  const c = {}; gaps.forEach(g => c[g] = (c[g]||0) + 1);
  return Number(Object.entries(c).sort((a,b) => b[1]-a[1] || a[0]-b[0])[0][0]) || 7;
}
function seriesStripHTML(ev){
  if(!ev.series) return '';
  const list = seriesEvents(ev.series), i = list.findIndex(e => e.id === ev.id);
  const prev = list[i-1], next = list[i+1];
  let h = '<div class="seriesstrip"><span class="eyebrow">'+esc(ev.series)+'</span>';
  if(list.length > 1) h += '<span class="mono hint">'+(i+1)+' of '+list.length+'</span>';
  if(prev) h += '<button class="btn small ghost" data-act="open" data-id="'+prev.id+'">← '+esc(prev.name)+' · '+esc(fmtD(prev.date))+'</button>';
  if(next) h += '<button class="btn small ghost" data-act="open" data-id="'+next.id+'">'+esc(next.name)+' · '+esc(fmtD(next.date))+' →</button>';
  h += '<span class="spacer"></span>'+(list.length > 1 ? '<button class="btn small" data-act="openSeries" data-name="'+esc(ev.series)+'">See the whole series</button>' : '')+'<button class="btn small" data-act="nextInSeries" data-name="'+esc(ev.series)+'"'+ro()+'>+ Add next in series</button> '+help('series');
  return h + '</div>';
}
function seriesChipsHTML(){
  const list = allSeries().filter(s => s.events.length > 1); if(!list.length) return '';
  return '<div class="row seriesrow"><span class="eyebrow">Series</span>'+list.map(s => '<button class="chip" data-act="openSeries" data-name="'+esc(s.name)+'">'+esc(s.name)+' <span class="count">'+s.events.length+'</span></button>').join('')+'</div>';
}
function seriesHTML(){
  const list = seriesEvents(S.seriesName), today = todayYMD();
  if(!list.length) return '<div class="empty"><h2>No events in this series</h2><p>Events join a series when they share the same Series name on their Overview tab.</p><button class="btn" data-act="home">All events</button></div>';
  const name = list[0].series;
  let h = '<div class="head"><div><div class="eyebrow">Series</div><h1>'+esc(name)+'</h1><p class="muted" style="margin-top:6px;max-width:62ch">'+list.length+' events, in date order. Every event with “'+esc(name)+'” as its series is listed here.</p></div><div class="row"><button class="btn" data-act="home">All events</button><button class="btn primary" data-act="nextInSeries" data-name="'+esc(name)+'"'+ro()+'>+ Add next in series</button></div></div>';
  const upcoming = list.filter(e => !isYMD(e.date) || e.date >= today), past = list.filter(e => isYMD(e.date) && e.date < today);
  h += '<div class="stats"><div class="stat"><b>'+list.length+'</b><span>Events in the series</span></div><div class="stat"><b>'+upcoming.length+'</b><span>Coming up</span></div><div class="stat"><b>'+past.length+'</b><span>Done</span></div><div class="stat"><b>'+(list.length > 1 ? 'Every '+seriesGap(list)+' days' : '—')+'</b><span>Usual gap between shows</span></div></div>';
  h += '<div class="panel"><div class="tablewrap"><table><thead><tr><th>#</th><th>Event</th><th>Date</th><th>Venue</th><th>Deadlines done</th><th>Open issues</th><th>Budget (net)</th><th></th></tr></thead><tbody>';
  list.forEach((e, i) => {
    const done = e.milestones.filter(m => m.status === 'done').length, tot = e.milestones.length, c = counts(runChecks(e));
    const B = typeof budgetSummary === 'function' ? budgetSummary(e) : null;
    const days = isYMD(e.date) ? diffDays(today, e.date) : null;
    h += '<tr'+(days != null && days < 0 ? ' class="past"' : '')+'><td class="mono">'+(i+1)+'</td><td><b>'+esc(e.name||'Untitled event')+'</b></td><td class="mono" style="white-space:nowrap">'+esc(fmtD(e.date, true))+(days != null && days >= 0 ? ' <span class="hint">· T−'+days+'</span>' : '')+'</td><td>'+esc(e.venue||'')+'</td>';
    h += '<td style="min-width:130px"><span class="minibar"><i style="width:'+(tot ? Math.round(done/tot*100) : 0)+'%"></i></span> <span class="mono hint">'+done+'/'+tot+'</span></td><td>'+(c.critical ? '<span class="pill crit">'+c.critical+' urgent</span> ' : '')+(c.warning ? '<span class="pill warn">'+c.warning+'</span>' : '')+(!c.critical && !c.warning ? '<span class="pill good">None</span>' : '')+'</td>';
    h += '<td class="mono">'+(B && (B.projCost || B.projIncome) ? usd(B.net) : '—')+'</td><td><button class="btn small" data-act="open" data-id="'+e.id+'">Open</button></td></tr>';
  });
  return h + '</tbody></table></div></div>';
}

/* ---------- an event's tabs ---------- */
function eventTabs(ev){
  const hidden = new Set(ev.hiddenTabs || []);
  return TABS.filter(([k]) => k === 'overview' || !hidden.has(k)).concat((ev.customTabs||[]).map(t => ['ct:'+t.id, t.name || 'Notes']));
}
function customTabHTML(ev, id){
  const t = (ev.customTabs||[]).find(x => x.id === id);
  if(!t) return overviewHTML(ev);
  let h = '<div class="panel"><div class="panel-head"><div><h2>'+esc(t.name || 'Notes')+'</h2><p class="hint">Your own notes for this event. They’re included in the full master plan, and only your team sees them.</p></div><div class="row"><button class="btn small" data-act="quickExport" data-which="tab:'+esc(t.id)+'" data-fmt="pdf">Save as PDF</button><button class="btn small" data-act="tabsModal">Rename or remove</button></div></div>';
  h += '<div class="field"><label for="ct-body" class="sr">'+esc(t.name || 'Notes')+'</label><textarea id="ct-body" class="ctbody" rows="16" data-ct="'+esc(t.id)+'" placeholder="Parking instructions, a vendor FAQ, load-in rules, anything that doesn’t fit the other tabs."'+ro()+'>'+esc(t.body||'')+'</textarea></div>';
  return h + '</div>';
}
MODALS.tabs = (ev, M) => {
  const hidden = new Set(ev.hiddenTabs || []);
  let h = '<div><h2 id="mt">Tabs for this event '+help('tabs')+'</h2><p class="hint">Untick a tab this event doesn’t use to hide it. Nothing in it is deleted, and you can show it again here.</p></div>';
  h += '<div class="tabgrid">'+TABS.map(([k, l]) => '<label class="toggle"><input type="checkbox" data-tabshow="'+k+'"'+(k === 'overview' || !hidden.has(k) ? ' checked' : '')+(k === 'overview' || S.readOnly ? ' disabled' : '')+'> '+esc(l)+'</label>').join('')+'</div>';
  h += '<div><span class="eyebrow">Your own tabs</span></div>';
  (ev.customTabs||[]).forEach(t => h += '<div class="row"><input class="inline-in" style="flex:1" data-ctname="'+esc(t.id)+'" value="'+esc(t.name)+'" aria-label="Tab name"'+ro()+'>'+(M.confirm === t.id ? '<button class="btn small danger" data-act="delTab" data-id="'+esc(t.id)+'">Delete it and its notes</button>' : '<button class="iconbtn del" data-act="askDelTab" data-id="'+esc(t.id)+'" aria-label="Delete tab"'+ro()+'>✕</button>')+'</div>');
  if(!(ev.customTabs||[]).length) h += '<p class="muted">None yet.</p>';
  if((ev.customTabs||[]).length < 12) h += '<div class="row"><input class="inline-in" style="flex:1" id="ctNew" placeholder="New tab name, e.g. Parking or Vendor FAQ"'+ro()+'><button class="btn" data-act="addTab"'+ro()+'>Add tab</button></div>';
  h += '<div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="closeModal">Done</button></div>';
  return h;
};

Object.assign(actions, {
  openSeries(el){ S.view = 'series'; S.seriesName = el.dataset.name; S.modal = null; S.drawer = null; render(); window.scrollTo(0,0); },
  nextInSeries(el){
    const list = seriesEvents(el.dataset.name); if(!list.length) return;
    const last = list[list.length-1];
    if(S.view !== 'event' || S.eventId !== last.id) S.tab = 'overview';
    S.view = 'event'; S.eventId = last.id; S.drawer = null;
    S.modal = {type:'clone'}; render();
    const date = isYMD(last.date) ? addDays(last.date, seriesGap(list)) : '';
    setTimeout(() => { const d = $('#nDate'); if(d && date) d.value = date; const s = $('#nSeries'); if(s) s.value = last.series; const n = $('#nName'); if(n){ n.focus(); n.select(); } }, 0);
  },
  tabsModal(){ S.modal = {type:'tabs'}; render(); },
  addTab(){
    const ev = curEv(), t = $('#ctNew'), name = t && t.value.trim(); if(!name){ if(t) t.focus(); return; }
    const tab = {id:uid(), name:name.slice(0, 60), body:''};
    ev.customTabs = (ev.customTabs||[]).concat(tab); touch(ev); focusNew('#ctNew');
    toast('Added the '+tab.name+' tab. It’s at the end of the tab row.');
  },
  askDelTab(el){ S.modal.confirm = el.dataset.id; render(); },
  delTab(el){ const ev = curEv(); ev.customTabs = (ev.customTabs||[]).filter(t => t.id !== el.dataset.id); if(S.tab === 'ct:'+el.dataset.id) S.tab = 'overview'; S.modal.confirm = null; touch(ev); }
});
document.addEventListener('change', e => {
  const el = e.target, ev = curEv(); if(!ev || S.readOnly || !el.dataset) return;
  if(el.dataset.tabshow){ const k = el.dataset.tabshow, set = new Set(ev.hiddenTabs || []); if(el.checked) set.delete(k); else set.add(k); ev.hiddenTabs = [...set]; if(!el.checked && S.tab === k) S.tab = 'overview'; touch(ev); return; }
  if(el.dataset.ctname){ const t = (ev.customTabs||[]).find(x => x.id === el.dataset.ctname); if(t){ t.name = el.value.trim().slice(0, 60) || 'Notes'; touch(ev); } return; }
  if(el.dataset.ct){ const t = (ev.customTabs||[]).find(x => x.id === el.dataset.ct); if(t){ t.body = el.value; touch(ev, true); } return; }
});
/* Long notes save while typing, without redrawing the page under the cursor. */
let ctTimer = null;
document.addEventListener('input', e => {
  const el = e.target; if(!el.dataset || !el.dataset.ct || S.readOnly) return;
  const ev = curEv(), t = ev && (ev.customTabs||[]).find(x => x.id === el.dataset.ct); if(!t) return;
  t.body = el.value; clearTimeout(ctTimer); ctTimer = setTimeout(() => touch(ev, true), 600);
});
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'ctNew'){ e.preventDefault(); actions.addTab(); } });
