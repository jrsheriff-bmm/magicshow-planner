/* ==========================================================================
   hours.js — [v4] the Hours page: time spent for this client, against the
   monthly retainer, and the client workspace switcher.

   Each entry is {id, date, hours, cat, eventId, note, who}. Entries belong to
   the workspace (client) you're in, like events do. The retainer settings
   (hours included per month, hourly rate) are per workspace too.
   ========================================================================== */

const HOUR_CATS = ['Capture','Teach','Plan','Meetings','Admin'];

function monthLabel(m){ const [y, mo] = m.split('-').map(Number); return MONL[mo-1]+' '+y; }
function shiftMonth(m, n){ let [y, mo] = m.split('-').map(Number); mo += n; while(mo < 1){ mo += 12; y--; } while(mo > 12){ mo -= 12; y++; } return y+'-'+pad(mo); }
function hoursIn(month){ return S.hours.filter(h => isYMD(h.date) && h.date.slice(0,7) === month); }

/* Totals for one month: used, included, left, value, over. */
function hoursSummary(month){
  const list = hoursIn(month);
  const used = list.reduce((a,h) => a + amt(h.hours), 0);
  const inc = amt(S.orgSettings.retainerHours), rate = amt(S.orgSettings.hourlyRate);
  const byCat = HOUR_CATS.map(c => ({cat:c, hours:list.filter(h => (h.cat||'Admin') === c).reduce((a,h) => a + amt(h.hours), 0)})).filter(c => c.hours);
  const byEvent = new Map(); list.forEach(h => { const k = h.eventId || ''; byEvent.set(k, (byEvent.get(k)||0) + amt(h.hours)); });
  return {list, used, inc, rate, left:inc - used, over:Math.max(0, used - inc), value:used * rate, byCat, byEvent};
}
function fmtH(n){ n = Math.round(n*100)/100; return (n % 1 ? n.toFixed(2).replace(/0$/,'') : String(n)) + ' h'; }

function hoursHTML(){
  const month = S.hoursMonth || todayYMD().slice(0,7);
  const H = hoursSummary(month);
  const wsName = S.org ? S.org.name : 'this workspace';
  let h = '<div class="head"><div><div class="eyebrow">Time for '+esc(wsName)+'</div><h1>Hours</h1><p class="muted" style="margin-top:6px;max-width:64ch">Log time as you work. The page shows how much of this month’s retainer is used, split by the kind of work and by event, so the monthly check-in and invoice take minutes.</p></div>';
  h += '<div class="row"><button class="btn small" data-act="hoursMonth" data-dir="-1" aria-label="Previous month">←</button><b style="min-width:130px;text-align:center">'+monthLabel(month)+'</b><button class="btn small" data-act="hoursMonth" data-dir="1" aria-label="Next month">→</button><button class="btn small" data-act="hoursCsv">Spreadsheet (CSV)</button><button class="btn primary small" data-act="addHour"'+ro()+'>+ Log time</button></div></div>';

  const pct = H.inc ? Math.round(H.used / H.inc * 100) : null;
  h += '<div class="stats">';
  h += '<div class="stat"><span>Hours used</span><b class="mono"'+(H.inc && H.used > H.inc ? ' style="color:var(--crit)"' : '')+'>'+fmtH(H.used)+'</b>'+(pct!=null?'<div class="bar"><i style="width:'+Math.min(100,pct)+'%;background:'+(pct>100?'var(--crit)':pct>85?'var(--warn)':'var(--accent)')+'"></i></div><span>'+pct+'% of '+fmtH(H.inc)+' included</span>':'<span>set the retainer below to track it</span>')+'</div>';
  h += '<div class="stat"><span>'+(H.over ? 'Over the retainer' : 'Hours left')+'</span><b class="mono"'+(H.over?' style="color:var(--crit)"':'')+'>'+(H.inc ? fmtH(H.over || H.left) : '—')+'</b><span>'+(H.over && H.rate ? usd(H.over*H.rate)+' beyond the retainer' : 'this month')+'</span></div>';
  h += '<div class="stat"><span>Value of time</span><b class="mono">'+(H.rate ? usd(H.value) : '—')+'</b><span>'+(H.rate ? 'at '+usd(H.rate)+'/hour' : 'set an hourly rate below')+'</span></div>';
  h += '<div class="stat"><span>Entries</span><b class="mono">'+H.list.length+'</b><span>'+monthLabel(month)+'</span></div>';
  h += '</div>';

  // where the time went
  const max = Math.max(1, ...H.byCat.map(c => c.hours));
  h += '<div class="grid2"><div class="panel"><div class="panel-head"><div><h2>By kind of work</h2><p class="hint">Capture = shooting and editing. Teach = training. Plan = event planning.</p></div></div>';
  h += H.byCat.length ? '<div class="catbars">'+H.byCat.sort((a,b) => b.hours - a.hours).map(c => '<div class="catbar"><span class="cb-l">'+c.cat+'</span><span class="cb-t"><i style="width:'+(c.hours/max*100).toFixed(1)+'%"></i></span><span class="cb-v mono">'+fmtH(c.hours)+'</span></div>').join('')+'</div>' : '<p class="muted">No time logged this month.</p>';
  h += '</div><div class="panel"><div class="panel-head"><div><h2>By event</h2><p class="hint">Time not tied to an event shows as General.</p></div></div>';
  if(!H.byEvent.size) h += '<p class="muted">No time logged this month.</p>';
  else h += '<div class="list">'+[...H.byEvent.entries()].sort((a,b) => b[1]-a[1]).map(([id,n]) => '<div class="li"><span class="when">'+fmtH(n)+'</span><span>'+(id && S.events[id] ? '<button class="btn ghost" style="padding:2px 4px" data-act="open" data-id="'+id+'">'+esc(S.events[id].name)+'</button>' : 'General')+'</span><span></span></div>').join('')+'</div>';
  h += '</div></div>';

  // entries
  const evOpts = [['','General (no event)']].concat(sortedEvents().map(e => [e.id, e.name+' · '+fmtD(e.date)]));
  h += '<div class="panel"><div class="panel-head"><div><h2>Time log</h2><p class="hint">Changes save as you go.</p></div></div>';
  h += '<div class="tablewrap"><table style="min-width:860px"><thead><tr><th>Date</th><th>Hours</th><th>Kind</th><th>Event</th><th style="width:34%">What you did</th><th></th></tr></thead><tbody>';
  H.list.slice().sort((a,b) => b.date.localeCompare(a.date)).forEach(x => {
    const f = (k, type, extra) => '<input'+(type?' type="'+type+'"':'')+' data-hour="'+x.id+'|'+k+'" value="'+esc(x[k])+'"'+(extra||'')+ro()+' aria-label="'+k+'">';
    const s = (k, opts) => '<select data-hour="'+x.id+'|'+k+'"'+ro()+' aria-label="'+k+'">'+opts.map(o => { const v = Array.isArray(o)?o[0]:o, l = Array.isArray(o)?o[1]:o; return '<option value="'+esc(v)+'"'+(v===(x[k]||'')?' selected':'')+'>'+esc(l)+'</option>'; }).join('')+'</select>';
    h += '<tr><td>'+f('date','date')+'</td><td>'+f('hours','number',' min="0" step="0.25" style="width:80px"')+'</td><td>'+s('cat',HOUR_CATS)+'</td><td>'+s('eventId',evOpts)+'</td><td>'+f('note','',' class="wide" placeholder="e.g. Edited festival clips"')+'</td><td><button class="iconbtn del" data-act="delHour" data-id="'+x.id+'" aria-label="Delete entry"'+ro()+'>✕</button></td></tr>';
  });
  if(!H.list.length) h += '<tr><td colspan="6" class="muted" style="padding:16px">Nothing logged in '+monthLabel(month)+'. Use + Log time.</td></tr>';
  h += '</tbody></table></div></div>';

  // retainer settings
  h += '<div class="panel"><div class="panel-head"><div><h2>Retainer for '+esc(wsName)+'</h2><p class="hint">Hours included each month and the hourly rate, used for the totals above.'+(canManageOrg() ? '' : ' Only the workspace owner can change these.')+'</p></div></div><div class="facts">';
  const canSet = !S.readOnly && canManageOrg();
  h += '<div class="field"><label for="o-ret">Hours included per month</label><input id="o-ret" type="number" min="0" step="0.5" data-orgset="retainerHours" value="'+esc(S.orgSettings.retainerHours)+'"'+(canSet?'':' disabled')+'></div>';
  h += '<div class="field"><label for="o-rate">Hourly rate ($)</label><input id="o-rate" type="number" min="0" step="1" data-orgset="hourlyRate" value="'+esc(S.orgSettings.hourlyRate)+'"'+(canSet?'':' disabled')+'></div>';
  return h + '</div></div>';
}

/* ---------- client workspaces ---------- */
function workspaceHTML(){
  if(!store.workspaces) return '';
  const list = S.orgs || [];
  let h = '<div class="railsec"><div class="eyebrow">Workspace</div>';
  if(list.length > 1) h += '<select id="orgPick" class="inline-in" style="margin:0 10px;max-width:calc(100% - 20px)" aria-label="Switch workspace">'+list.map(o => '<option value="'+o.id+'"'+(S.org && String(o.id) === String(S.org.id) ? ' selected' : '')+'>'+esc(o.name)+'</option>').join('')+'</select>';
  // [final] Client workspaces are a Blackmagic team tool; people who signed up on their own have just their workspace.
  const canAdd = !S.features || S.features.newWorkspace !== false;
  if(canAdd) h += '<button class="navbtn" data-act="newWorkspace">+ New client workspace</button>';
  return list.length > 1 || canAdd ? h + '</div>' : '';
}
MODALS.newWorkspace = () => {
  let h = '<div><h2 id="mt">New client workspace</h2><p class="hint">A separate space for one client: their own events, people, templates, hours and reports. You’ll be its owner.</p><p class="hint"><b>Easier for a new retainer client:</b> have them create their own account on the sign-up page and tick “I’m working with Blackmagic Media on a retainer”. Their workspace then appears in your workspace list on its own, and they keep their own login.</p></div>';
  h += '<div class="field"><label for="wsName">Client name</label><input id="wsName" placeholder="e.g. Eastside Youth Arts"></div>';
  h += '<p class="hint" id="wsErr" style="color:var(--crit)"></p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doNewWorkspace">Create and switch</button></div>';
  return h;
};

Object.assign(actions, {
  hours(){ S.view = 'hours'; S.modal = null; S.drawer = null; render(); window.scrollTo(0,0); },
  hoursMonth(el){ S.hoursMonth = shiftMonth(S.hoursMonth || todayYMD().slice(0,7), Number(el.dataset.dir)); render(); },
  async addHour(el){
    const month = S.hoursMonth || todayYMD().slice(0,7);
    const date = todayYMD().slice(0,7) === month ? todayYMD() : month+'-01';
    const x = {id:uid(), date, hours:1, cat:'Capture', eventId:(el && el.dataset.event) || '', note:'', who:S.user ? S.user.name : ''};
    S.hours.push(x); S.view = 'hours'; S.hoursMonth = date.slice(0,7); render();
    try { await store.saveHour(x); } catch(e){ writeFailed(e); }
    setTimeout(() => { const i = document.querySelector('[data-hour="'+x.id+'|note"]'); if(i) i.focus(); }, 0);
  },
  logTime(){ actions.addHour({dataset:{event:S.eventId}}); },
  async delHour(el){ S.hours = S.hours.filter(x => x.id !== el.dataset.id); render(); try { await store.deleteHour(el.dataset.id); } catch(e){ writeFailed(e); } },
  async hoursCsv(){
    const month = S.hoursMonth || todayYMD().slice(0,7);
    const rows = [['Date','Hours','Kind','Event','What you did','Who']].concat(hoursIn(month).sort((a,b) => a.date.localeCompare(b.date)).map(x => [x.date, x.hours, x.cat, x.eventId && S.events[x.eventId] ? S.events[x.eventId].name : 'General', x.note, x.who||'']));
    await saveFile((S.org ? slug(S.org.name)+'-' : '')+'hours-'+month+'.csv', rows.map(r => r.map(csvCell).join(',')).join('\r\n'));
  },
  newWorkspace(){ S.modal = {type:'newWorkspace'}; render(); setTimeout(() => { const i = $('#wsName'); if(i) i.focus(); }, 0); },
  async doNewWorkspace(){
    const name = $('#wsName').value.trim(), err = $('#wsErr');
    if(!name){ err.textContent = 'Type the client’s name.'; return; }
    try { await store.createWorkspace(name); } catch(e){ err.textContent = e.message || 'Couldn’t create it.'; }
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  if(el.id === 'orgPick'){ try { await store.switchWorkspace(el.value); } catch(x){ toast(x.message); } return; }
  if(S.readOnly || !el.dataset) return;
  if(el.dataset.hour){
    const [id, k] = el.dataset.hour.split('|'); const x = S.hours.find(h => h.id === id); if(!x) return;
    x[k] = k === 'hours' ? (el.value === '' ? 0 : Math.max(0, Number(el.value))) : el.value;
    if(k === 'date' && isYMD(el.value)) S.hoursMonth = el.value.slice(0,7);
    renderInput();
    try { await store.saveHour(x); } catch(err){ writeFailed(err); }
  }
  if(el.dataset.orgset){
    S.orgSettings[el.dataset.orgset] = el.value === '' ? '' : Number(el.value); renderInput();
    try { await store.saveOrgSettings(S.orgSettings); } catch(err){ writeFailed(err); }
  }
});
