/* ==========================================================================
   reports.js — the Reports page: every event on one screen.

   "Current" is for supervisors: is each upcoming event on track, behind, or
   at risk, and what's the money picture. "Past" learns from finished events:
   attendance vs target, cost per attendee, which tasks run late most often,
   what to change, and how vendors rated.
   ========================================================================== */

/* One status for an event: behind (something urgent), at risk (things to review), or on track. */
function eventHealth(ev){
  const c = counts(runChecks(ev));
  if(c.critical) return {key:'behind', label:'Behind', cls:'crit', c};
  if(c.warning) return {key:'risk', label:'At risk', cls:'warn', c};
  return {key:'ok', label:'On track', cls:'good', c};
}
function currentRow(ev){
  const today = todayYMD(), B = budgetSummary(ev), H = eventHealth(ev);
  const open = ev.milestones.filter(m => m.status !== 'done').map(m => Object.assign({d:addDays(ev.date,Number(m.offset)||0)}, m)).sort((a,b) => a.d.localeCompare(b.d));
  return {ev, H, B, days: isYMD(ev.date) ? diffDays(today, ev.date) : null,
    done: ev.milestones.filter(m => m.status === 'done').length, total: ev.milestones.length,
    overdue: open.filter(m => m.d < today).length,
    paper: ev.compliance.filter(c => c.status === 'approved').length+'/'+ev.compliance.length,
    gear: ev.equipment.filter(e => e.status !== 'needed').length+'/'+ev.equipment.length,
    pending: ev.approvals.filter(a => a.status === 'pending').length,
    next: open.find(m => m.d >= today) || null};
}
// "Current" = the show is ahead, or work after it (editing, delivery, payments) is still open.
function currentEvents(){ const t = todayYMD(); return sortedEvents().filter(ev => !isYMD(ev.date) || lastActiveDay(ev) >= t); }
function pastEvents(){ const t = todayYMD(); return sortedEvents().filter(ev => isYMD(ev.date) && lastActiveDay(ev) < t).reverse(); }

/* A past event reduced to the numbers the Past report compares. */
function pastRow(ev){
  const X = wrapupStats(ev), W = ev.wrapup || {};
  const ratings = Object.entries(W.ratings||{}).map(([id,r]) => { const c = contactById(ev, id); return c && Number(r.score) ? {who:c.name||c.org, role:c.role||'', score:Number(r.score), note:r.note||''} : null; }).filter(Boolean);
  return {id:ev.id, name:ev.name, date:ev.date, attendance:X.attendance, target:X.target, cost:X.cost, income:X.income, net:X.net, perHead:X.perHead,
    rating:X.rating, late:X.late.map(l => l.title), lateCount:X.late.length, tracked:X.tracked, change:String(W.change||'').split('\n').map(s => s.trim()).filter(Boolean),
    ratings, finished:!!W.completedAt};
}
/* Made-up rows so the Past report can be previewed before any event is finished. Never saved. */
function examplePastRows(){
  const r = (who, role, score, note) => ({who, role, score, note});
  return [
    {name:'Example: Spring Showcase', date:'2026-04-18', attendance:92, target:100, cost:3150, income:3400, net:250, perHead:34.24, rating:4, late:['Launch promotion and open ticket sales','Final flyers, promo clips and social assets'], lateCount:2, tracked:11, change:['Open ticket sales 6 weeks out, not 5','Book security earlier'], ratings:[r('Northside Sound','Sound',5,'On time, great mix'), r('Tasty Truck','Food vendor',3,'Ran out of food by 9'), r('Venue staff','Venue',4,'')], finished:true},
    {name:'Example: Winter Comedy Night', date:'2026-01-24', attendance:61, target:80, cost:1480, income:1220, net:-260, perHead:24.26, rating:3, late:['Launch promotion','Comic headshots and bios collected'], lateCount:2, tracked:8, change:['Promotion started too late','Smaller room would feel fuller'], ratings:[r('Northside Sound','Sound',4,''), r('Laugh Track Co.','Host',5,'Crowd loved him')], finished:true},
    {name:'Example: Fall Showcase', date:'2025-10-11', attendance:118, target:100, cost:3600, income:4700, net:1100, perHead:30.51, rating:5, late:['Launch promotion and open ticket sales'], lateCount:1, tracked:12, change:['Add a second bar line','Book security earlier'], ratings:[r('Northside Sound','Sound',5,''), r('Tasty Truck','Food vendor',4,'')], finished:true}
  ];
}
function pastRollup(rows){
  const withAtt = rows.filter(x => x.attendance != null);
  const lateMap = new Map(); rows.forEach(x => x.late.forEach(t => { const k = norm(t); const o = lateMap.get(k) || {title:t, n:0}; o.n++; lateMap.set(k, o); }));
  const changeMap = new Map(); rows.forEach(x => x.change.forEach(t => { const k = norm(t); const o = changeMap.get(k) || {text:t, n:0, from:[]}; o.n++; o.from.push(x.name); changeMap.set(k, o); }));
  const vendMap = new Map(); rows.forEach(x => x.ratings.forEach(r => { const k = norm(r.who); const o = vendMap.get(k) || {who:r.who, role:r.role, scores:[], notes:[]}; o.scores.push(r.score); if(r.note) o.notes.push(r.note); vendMap.set(k, o); }));
  const avg = a => a.length ? a.reduce((s,v) => s+v, 0) / a.length : null;
  return {
    events: rows.length,
    avgAttendance: avg(withAtt.map(x => x.attendance)),
    hitTarget: withAtt.filter(x => x.target && x.attendance >= x.target).length, withTarget: withAtt.filter(x => x.target).length,
    avgPerHead: avg(rows.filter(x => x.perHead != null).map(x => x.perHead)),
    totalNet: rows.reduce((s,x) => s + (x.net||0), 0),
    lateRate: (() => { const t = rows.reduce((s,x) => s + x.tracked, 0); return t ? rows.reduce((s,x) => s + x.lateCount, 0) / t : null; })(),
    oftenLate: [...lateMap.values()].sort((a,b) => b.n - a.n).slice(0,8),
    changes: [...changeMap.values()].sort((a,b) => b.n - a.n),
    vendors: [...vendMap.values()].map(v => Object.assign(v, {avg:avg(v.scores)})).sort((a,b) => b.avg - a.avg || b.scores.length - a.scores.length)
  };
}

function reportsHTML(){
  let h = '<div class="head"><div><div class="eyebrow">For supervisors and planning</div><h1>Reports</h1><p class="muted" style="margin-top:6px;max-width:64ch">All your events on one page. Current shows where each upcoming event stands. Past shows what finished events teach you.</p></div>';
  h += '<div class="seg" role="group" aria-label="Report"><button data-act="reportTab" data-v="current" aria-pressed="'+(S.reportTab==='current')+'">Current events</button><button data-act="reportTab" data-v="past" aria-pressed="'+(S.reportTab==='past')+'">Past events</button></div></div>';
  return h + (S.reportTab === 'past' ? pastReportHTML() : currentReportHTML());
}

function currentReportHTML(){
  const rows = currentEvents().map(currentRow);
  const tile = (label, val, sub, color) => '<div class="stat"><span>'+label+'</span><b class="mono"'+(color?' style="color:'+color+'"':'')+'>'+val+'</b><span>'+(sub||'')+'</span></div>';
  const behind = rows.filter(r => r.H.key === 'behind').length, risk = rows.filter(r => r.H.key === 'risk').length;
  let h = '<div class="stats">';
  h += tile('Upcoming events', rows.length, rows.length ? 'next: '+esc(rows[0].ev.name) : '');
  h += tile('Behind', behind, 'something urgent', behind ? 'var(--crit)' : null);
  h += tile('At risk', risk, 'items to review', risk ? 'var(--warn)' : null);
  h += tile('Overdue deadlines', rows.reduce((s,r) => s + r.overdue, 0), 'across all events');
  h += tile('Still owed', usd(rows.reduce((s,r) => s + r.B.owed, 0)), 'committed or invoiced, not paid');
  h += '</div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>Where every event stands</h2><p class="hint">Behind = an urgent check (overdue deadline, late payment or paperwork). At risk = items to review. Click an event to open it.</p></div><div class="row"><button class="btn small" data-act="reportExport" data-fmt="pdf">PDF</button><button class="btn small" data-act="reportExport" data-fmt="word">Word</button><button class="btn small" data-act="reportCsv">Spreadsheet (CSV)</button><button class="btn primary small" data-act="aiPortfolio">AI status summary</button></div></div>';
  if(!rows.length) return h + '<p class="muted">No upcoming events. Create one from All events.</p></div>';
  h += '<div class="tablewrap"><table class="report" style="min-width:1180px"><thead><tr><th>Event</th><th>Show day</th><th>Status</th><th>Deadlines</th><th>Overdue</th><th>Paperwork</th><th>Gear</th><th>Projected cost</th><th>Projected net</th><th>Approvals</th><th>Next deadline</th></tr></thead><tbody>';
  rows.forEach(r => {
    const B = r.B, over = B.cap && B.projCost > B.cap;
    h += '<tr><td><button class="btn ghost" style="text-align:left;justify-content:flex-start;white-space:normal" data-act="open" data-id="'+r.ev.id+'"><b>'+esc(r.ev.name||'Untitled')+'</b></button></td>';
    h += '<td class="mono" style="white-space:nowrap">'+fmtD(r.ev.date,true)+'<br><span class="hint">'+(r.days==null?'':r.days===0?'today':'T−'+r.days)+'</span></td>';
    h += '<td><span class="light '+r.H.cls+'"></span><span class="pill '+r.H.cls+'">'+r.H.label+'</span>'+(r.H.c.critical||r.H.c.warning?'<br><span class="hint">'+(r.H.c.critical?r.H.c.critical+' urgent ':'')+(r.H.c.warning?r.H.c.warning+' to review':'')+'</span>':'')+'</td>';
    h += '<td class="mono">'+r.done+'/'+r.total+'<div class="bar"><i style="width:'+(r.total?r.done/r.total*100:0)+'%"></i></div></td>';
    h += '<td class="mono"'+(r.overdue?' style="color:var(--crit);font-weight:600"':'')+'>'+r.overdue+'</td><td class="mono">'+r.paper+'</td><td class="mono">'+r.gear+'</td>';
    h += '<td class="mono"'+(over?' style="color:var(--crit)"':'')+'>'+usd(B.projCost)+(B.cap?'<br><span class="hint">of '+usd(B.cap)+'</span>':'')+'</td>';
    h += '<td class="mono"'+(B.net<0?' style="color:var(--crit)"':'')+'>'+usd(B.net)+'</td><td>'+(r.pending?'<span class="pill warn">'+r.pending+' waiting</span>':'<span class="hint">—</span>')+'</td>';
    h += '<td>'+(r.next?esc(r.next.title)+'<br><span class="hint">'+fmtD(r.next.d,true)+(r.next.owner?' · '+esc(r.next.owner):'')+'</span>':'<span class="hint">—</span>')+'</td></tr>';
  });
  return h + '</tbody></table></div></div>';
}

function pastReportHTML(){
  const real = pastEvents().map(pastRow);
  const useExample = S.reportExample;
  const rows = useExample ? examplePastRows() : real;
  let h = '';
  if(useExample) h += '<div class="banner"><b>Example data.</b> These three events are made up, to show what this report looks like once you have history. Nothing here is saved. <button class="btn small" data-act="reportExample" data-v="0" style="margin-left:8px">Show my real events</button></div>';
  else if(!real.length || !real.some(x => x.finished)) h += '<div class="banner info">'+(real.length?'None of your past events has a finished wrap-up yet.':'No past events yet.')+' After each show, fill in its Wrap-up tab (attendance, final costs, ratings, what to change). <button class="btn small" data-act="reportExample" data-v="1" style="margin-left:8px">Preview with example data</button></div>';
  if(!rows.length) return h;
  const R = pastRollup(rows);
  const tile = (label, val, sub, color) => '<div class="stat"><span>'+label+'</span><b class="mono"'+(color?' style="color:'+color+'"':'')+'>'+val+'</b><span>'+(sub||'')+'</span></div>';
  h += '<div class="stats">';
  h += tile('Past events', R.events, useExample ? 'example' : '');
  h += tile('Average attendance', R.avgAttendance != null ? Math.round(R.avgAttendance) : '—', R.withTarget ? R.hitTarget+' of '+R.withTarget+' hit target' : '');
  h += tile('Average cost per attendee', R.avgPerHead != null ? usd(Math.round(R.avgPerHead*100)/100) : '—', '');
  h += tile('Total net', usd(R.totalNet), 'all past events', R.totalNet < 0 ? 'var(--crit)' : R.totalNet > 0 ? 'var(--good)' : null);
  h += tile('Deadlines done late', R.lateRate != null ? Math.round(R.lateRate*100)+'%' : '—', 'of tracked deadlines');
  h += '</div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>Event by event</h2><p class="hint">Attendance against target, what it cost, and what came in.</p></div>'+(useExample?'':'<button class="btn small" data-act="reportCsv" data-which="past">Spreadsheet (CSV)</button>')+'</div>';
  h += '<div class="tablewrap"><table class="report" style="min-width:980px"><thead><tr><th>Event</th><th>Date</th><th>Attendance</th><th>Final cost</th><th>Income</th><th>Net</th><th>Per attendee</th><th>Late tasks</th><th>Rating</th></tr></thead><tbody>';
  rows.forEach(x => {
    const pct = x.attendance != null && x.target ? Math.round(x.attendance / x.target * 100) : null;
    h += '<tr><td>'+(x.id?'<button class="btn ghost" style="text-align:left;justify-content:flex-start;white-space:normal" data-act="open" data-id="'+x.id+'"><b>'+esc(x.name)+'</b></button>':'<b style="padding-left:10px">'+esc(x.name)+'</b>')+(x.finished?'':'<br><span class="hint" style="padding-left:10px">wrap-up not finished</span>')+'</td>';
    h += '<td class="mono">'+fmtD(x.date)+'</td><td class="mono">'+(x.attendance!=null?x.attendance:'—')+(x.target?' <span class="hint">/ '+x.target+'</span>':'')+(pct!=null?'<div class="bar"><i style="width:'+Math.min(100,pct)+'%;background:'+(pct>=100?'var(--good)':'var(--accent)')+'"></i></div>':'')+'</td>';
    h += '<td class="mono">'+usd(x.cost)+'</td><td class="mono">'+usd(x.income)+'</td><td class="mono" style="color:'+(x.net<0?'var(--crit)':x.net>0?'var(--good)':'inherit')+'">'+usd(x.net)+'</td>';
    h += '<td class="mono">'+(x.perHead!=null?usd(Math.round(x.perHead*100)/100):'—')+'</td><td class="mono">'+x.lateCount+(x.tracked?' <span class="hint">of '+x.tracked+'</span>':'')+'</td><td>'+(x.rating?'<span class="stars small ro">'+'★'.repeat(x.rating)+'<span class="off">'+'★'.repeat(5-x.rating)+'</span></span>':'—')+'</td></tr>';
  });
  h += '</tbody></table></div></div>';

  h += '<div class="grid2"><div class="panel"><div class="panel-head"><div><h2>Tasks that run late most often</h2><p class="hint">Start these earlier next time, or give them a different owner.</p></div></div>';
  h += R.oftenLate.length ? '<div class="list">'+R.oftenLate.map(o => '<div class="li"><span class="when"><span class="pill '+(o.n>1?'warn':'')+'">'+o.n+'×</span></span><span>'+esc(o.title)+'</span><span></span></div>').join('')+'</div>' : '<p class="muted">Nothing ran late. Or the dates weren’t tracked: the app records the day each deadline is marked done.</p>';
  h += '</div><div class="panel"><div class="panel-head"><div><h2>Change next time</h2><p class="hint">From each wrap-up. Ideas that come up more than once are at the top.</p></div></div>';
  h += R.changes.length ? '<div class="list">'+R.changes.slice(0,10).map(c => '<div class="li"><span class="when">'+(c.n>1?'<span class="pill accent">'+c.n+'×</span>':'')+'</span><span>'+esc(c.text)+'<br><span class="hint">'+esc(c.from.join(', '))+'</span></span><span></span></div>').join('')+'</div>' : '<p class="muted">No lessons recorded yet.</p>';
  h += '</div></div>';

  h += '<div class="panel"><div class="panel-head"><div><h2>Vendor and performer ratings</h2><p class="hint">Average of the ratings in each wrap-up. Use it to decide who to book again.</p></div></div>';
  if(!R.vendors.length) h += '<p class="muted">No ratings yet.</p>';
  else {
    h += '<div class="tablewrap"><table style="min-width:640px"><thead><tr><th>Who</th><th>Role</th><th>Average</th><th>Events</th><th>Notes</th></tr></thead><tbody>';
    R.vendors.forEach(v => h += '<tr><td style="padding-left:10px"><b>'+esc(v.who)+'</b></td><td>'+esc(v.role)+'</td><td><span class="mono">'+v.avg.toFixed(1)+'</span> <span class="stars small ro">'+'★'.repeat(Math.round(v.avg))+'<span class="off">'+'★'.repeat(5-Math.round(v.avg))+'</span></span></td><td class="mono">'+v.scores.length+'</td><td class="hint">'+esc(v.notes.join(' · '))+'</td></tr>');
    h += '</tbody></table></div>';
  }
  return h + '</div>';
}

/* The same Current table as a PDF/Word document or a CSV spreadsheet. */
function portfolioDoc(){
  const rows = currentEvents().map(currentRow);
  const sections = [{h:'', items:[{p:'Status of every upcoming event as of '+fmtLong(todayYMD())+'.'}]}];
  sections.push({h:'At a glance', items:[{table:{head:['Event','Show day','Status','Deadlines','Overdue','Proj. cost','Proj. net','Next deadline'], widths:[.2,.1,.1,.1,.08,.12,.1,.2], rows:rows.map(r => [r.ev.name, fmtD(r.ev.date), r.H.label, r.done+'/'+r.total, String(r.overdue), usd(r.B.projCost)+(r.B.cap?' of '+usd(r.B.cap):''), usd(r.B.net), r.next ? r.next.title+' ('+fmtD(r.next.d)+')' : ''])}}]});
  rows.filter(r => r.H.key !== 'ok').forEach(r => sections.push({h:r.ev.name+': '+r.H.label, items:[{list:runChecks(r.ev).filter(x => x.level !== 'info').slice(0,8).map(x => x.text)}]}));
  return {title:'Event status report', subtitle:(S.org?S.org.name:'Blackmagic Media')+' · '+fmtLong(todayYMD()), sections};
}
function csvCell(v){ const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
function portfolioCSV(which){
  let head, lines;
  if(which === 'past'){
    head = ['Event','Date','Attendance','Target','Final cost','Income','Net','Cost per attendee','Late tasks','Tracked tasks','Rating'];
    lines = pastEvents().map(pastRow).map(x => [x.name, x.date, x.attendance, x.target, x.cost, x.income, x.net, x.perHead != null ? x.perHead.toFixed(2) : '', x.lateCount, x.tracked, x.rating]);
  } else {
    head = ['Event','Show day','Days out','Status','Deadlines done','Deadlines total','Overdue','Paperwork approved','Gear secured','Budget','Projected cost','Paid','Still owed','Projected income','Projected net','Approvals waiting','Next deadline','Next due'];
    lines = currentEvents().map(currentRow).map(r => [r.ev.name, r.ev.date, r.days, r.H.label, r.done, r.total, r.overdue, r.paper, r.gear, r.B.cap||'', r.B.projCost, r.B.paid, r.B.owed, r.B.projIncome, r.B.net, r.pending, r.next ? r.next.title : '', r.next ? r.next.d : '']);
  }
  return [head].concat(lines).map(l => l.map(csvCell).join(',')).join('\r\n');
}
/* What the AI gets for the cross-event summary (the real site builds the same thing in planner/ai.py). */
function portfolioInput(){
  const L = currentEvents().map(currentRow).map(r => {
    const issues = runChecks(r.ev).filter(x => x.level !== 'info').slice(0,6).map(x => x.text).join(' | ');
    return '- '+r.ev.name+' on '+fmtLong(r.ev.date)+' ('+(r.days==null?'no date':'T-'+r.days)+'): '+r.H.label+'; deadlines '+r.done+'/'+r.total+' done, '+r.overdue+' overdue; paperwork '+r.paper+'; budget '+(r.B.cap?usd(r.B.cap):'not set')+', projected cost '+usd(r.B.projCost)+', projected net '+usd(r.B.net)+'; approvals waiting: '+r.pending+(r.next?'; next: '+r.next.title+' due '+fmtD(r.next.d):'')+(issues?'. Issues: '+issues:'');
  });
  return 'You are writing a short status update for a supervisor who oversees several events. Using ONLY the facts below, write plain text with no markdown symbols. Headings on their own lines: Overall, Needs attention, On track, Money, Decisions needed. Under each heading use short lines starting with "- ". Under 300 words. Do not invent anything.\n\nToday is '+fmtLong(todayYMD())+'.\nEvents:\n'+(L.join('\n')||'- No upcoming events.');
}

MODALS.aiPortfolio = (ev, M) => {
  let h = '<div><h2 id="mt">AI status summary</h2><p class="hint">Claude writes a short update across all upcoming events, for a supervisor. Review it before you send it.</p></div>';
  if(!store.aiAvailable()) h += '<div class="banner">AI drafting isn’t turned on here. You can still download the report as PDF, Word or CSV.</div>';
  h += '<textarea class="aiout" id="aiPText" placeholder="Click Draft with AI.">'+esc(M.text||'')+'</textarea><p class="hint">'+(M.busy?'Drafting… this takes 10–40 seconds.':esc(M.err||''))+'</p>';
  h += '<div class="row" style="justify-content:space-between"><button class="btn primary" data-act="aiPortfolioGo"'+(store.aiAvailable()&&!M.busy?'':' disabled')+'>'+(M.text?'Draft again':'Draft with AI')+'</button><div class="row"><button class="btn" data-act="aiPortfolioExport" data-fmt="word">Word</button><button class="btn" data-act="aiPortfolioExport" data-fmt="pdf">PDF</button><button class="btn ghost" data-act="closeModal">Close</button></div></div>';
  return h;
};
WIDE_MODALS.add('aiPortfolio');

Object.assign(actions, {
  reports(){ S.view = 'reports'; S.modal = null; S.drawer = null; render(); window.scrollTo(0,0); },
  reportTab(el){ S.reportTab = el.dataset.v; render(); },
  reportExample(el){ S.reportExample = el.dataset.v === '1'; render(); },
  async reportExport(el){ await exportAs(portfolioDoc(), el.dataset.fmt, 'event-status-report-'+todayYMD()); },
  async reportCsv(el){ await saveFile((el.dataset.which === 'past' ? 'past-events-' : 'event-status-')+todayYMD()+'.csv', portfolioCSV(el.dataset.which)); },
  aiPortfolio(){ S.modal = {type:'aiPortfolio'}; render(); },
  async aiPortfolioGo(){
    const M = S.modal; if(!M) return;
    M.busy = true; M.err = null; render();
    try {
      M.text = await store.aiPortfolio(t => { const a = $('#aiPText'); if(a) a.value = t; });
    } catch(e){ M.err = e.message || 'The draft didn’t finish. Try again.'; }
    M.busy = false; render();
  },
  async aiPortfolioExport(el){ const t = $('#aiPText'); const text = t ? t.value : ''; if(!text.trim()){ toast('Draft the summary first.'); return; } await exportAs(docFromText('Event status summary', fmtLong(todayYMD()), text), el.dataset.fmt, 'event-status-summary-'+todayYMD()); }
});
