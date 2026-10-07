/* ==========================================================================
   wrapup.js — the Wrap-up tab: what actually happened, filled in after the show.

   ev.wrapup = {attendance, ticketsSold, rating (1–5), worked, change,
                ratings:{contactId:{score, note}}, completedAt}
   Money comes from the Budget tab, and "late" comes from the date each deadline
   was marked done (doneAt). The Past events report reads all of this.
   ========================================================================== */

/* The final numbers for one event (also used by the Past events report). */
function wrapupStats(ev){
  const W = ev.wrapup || {}, B = budgetSummary(ev);
  const attendance = hasAmt(W.attendance) ? Number(W.attendance) : null;
  // Income: real ticket lines win; otherwise tickets sold × advance price; otherwise the projection.
  const ticketLines = ev.budget.filter(b => b.kind === 'income' && b.cat === 'Tickets' && (hasAmt(b.est) || hasAmt(b.actual)));
  const soldIncome = hasAmt(W.ticketsSold) && Number(ev.priceAdv) > 0 ? Number(W.ticketsSold) * Number(ev.priceAdv) : null;
  const ticketIncome = ticketLines.length ? B.ticketIncome : soldIncome != null ? soldIncome : B.ticketIncome;
  const income = B.otherIncome + ticketIncome, cost = B.projCost;
  const late = [], open = [];
  ev.milestones.forEach(m => {
    const due = addDays(ev.date, Number(m.offset)||0);
    if(m.status === 'done' && isYMD(m.doneAt) && m.doneAt > due) late.push({title:m.title, owner:m.owner, days:diffDays(due, m.doneAt)});
    else if(m.status !== 'done') open.push({title:m.title, owner:m.owner});
  });
  const tracked = ev.milestones.filter(m => m.status === 'done' && isYMD(m.doneAt)).length;
  return {attendance, target:Number(ev.target)||null, cost, income, net:income - cost, perHead: attendance ? cost / attendance : null,
    late, open, tracked, onTime: tracked - late.length, rating:Number(W.rating)||null, cap:B.cap};
}

function wrapupHTML(ev){
  const W = ev.wrapup, X = wrapupStats(ev), today = todayYMD();
  const before = isYMD(ev.date) && ev.date > today;
  let h = '';
  if(before) h += '<div class="banner info">Fill this in after the show. It takes about five minutes, and it’s what the <b>Past events</b> report learns from: attendance, final costs, late tasks and which vendors to book again.</div>';
  else if(W.completedAt) h += '<div class="banner info">Wrap-up finished on '+fmtD(new Date(W.completedAt).toISOString().slice(0,10),true)+'. You can still edit it.</div>';

  const tile = (label, val, sub, color) => '<div class="stat"><span>'+label+'</span><b class="mono"'+(color?' style="color:'+color+'"':'')+'>'+val+'</b><span>'+(sub||'')+'</span></div>';
  h += '<div class="stats">';
  h += tile('Attendance', X.attendance != null ? X.attendance : '—', X.target ? 'target '+X.target+(X.attendance != null ? ' ('+Math.round(X.attendance/X.target*100)+'%)' : '') : 'no target set');
  h += tile('Final cost', usd(X.cost), X.cap ? (X.cost > X.cap ? usd(X.cost - X.cap)+' over budget' : usd(X.cap - X.cost)+' under budget') : 'from the Budget tab', X.cap && X.cost > X.cap ? 'var(--crit)' : null);
  h += tile('Income', usd(X.income), hasAmt(W.ticketsSold) ? W.ticketsSold+' tickets sold' : '');
  h += tile('Net', usd(X.net), 'income minus cost', X.net < 0 ? 'var(--crit)' : X.net > 0 ? 'var(--good)' : null);
  h += tile('Cost per attendee', X.perHead != null ? usd(Math.round(X.perHead*100)/100) : '—', 'final cost ÷ attendance');
  h += '</div>';

  const num = (k, label, hint) => '<div class="field"><label for="w-'+k+'">'+label+'</label><input id="w-'+k+'" type="number" min="0" data-wrap="'+k+'" value="'+esc(W[k])+'"'+ro()+'>'+(hint?'<span class="hint">'+hint+'</span>':'')+'</div>';
  h += '<div class="panel"><div class="panel-head"><div><h2>How it went</h2><p class="hint">The numbers and the lessons. Next year’s planning starts here.</p></div>'+(W.completedAt?'<button class="btn small ghost" data-act="wrapDone" data-v="0"'+ro()+'>Reopen</button>':'<button class="btn primary small" data-act="wrapDone" data-v="1"'+ro()+'>Mark wrap-up finished</button>')+'</div><div class="facts">';
  h += num('attendance','Attendance','Headcount through the door.') + num('ticketsSold','Tickets sold','Used for income if you didn’t enter ticket amounts in Budget.');
  h += '<div class="field"><span class="lbl">Overall rating</span><div class="stars" role="group" aria-label="Overall rating">'+[1,2,3,4,5].map(n => '<button class="star" data-act="wrapRate" data-v="'+n+'" aria-pressed="'+(Number(W.rating) >= n)+'" aria-label="'+n+' of 5"'+ro()+'>★</button>').join('')+'</div></div>';
  h += '<div class="field wide"><label for="w-worked">What worked</label><textarea id="w-worked" rows="3" data-wrap="worked" placeholder="Keep doing these"'+ro()+'>'+esc(W.worked)+'</textarea></div>';
  h += '<div class="field wide"><label for="w-change">Change next time</label><textarea id="w-change" rows="3" data-wrap="change" placeholder="One idea per line. These roll up into the Past events report."'+ro()+'>'+esc(W.change)+'</textarea></div>';
  h += '</div></div>';

  h += '<div class="grid2"><div class="panel"><div class="panel-head"><div><h2>Deadlines</h2><p class="hint">Late means marked done after its due date. The app records the day each one is marked done.</p></div></div>';
  h += '<p><b class="mono">'+X.onTime+'</b> of '+X.tracked+' tracked deadlines done on time'+(X.open.length?' · <b class="mono">'+X.open.length+'</b> never marked done':'')+'.</p>';
  if(X.late.length) h += '<div class="list">'+X.late.sort((a,b) => b.days - a.days).map(l => '<div class="li"><span class="when"><span class="pill warn">'+l.days+'d late</span></span><span>'+esc(l.title)+(l.owner?' <span class="hint">· '+esc(l.owner)+'</span>':'')+'</span><span></span></div>').join('')+'</div>';
  if(X.open.length) h += '<p class="hint" style="margin-top:8px">Not marked done: '+X.open.slice(0,6).map(o => esc(o.title)).join(', ')+(X.open.length>6?'…':'')+'</p>';
  if(!X.late.length && !X.open.length) h += '<p class="muted">Everything tracked was done on time.</p>';
  h += '</div>';

  const rated = ev.contacts.filter(c => (c.name || c.org) && !c.team && !(c.audiences||[]).every(a => a === 'Internal'));
  h += '<div class="panel"><div class="panel-head"><div><h2>Rate the people you worked with</h2><p class="hint">Everyone outside the planning team. Ratings show up in the Past events report so you know who to book again.</p></div></div>';
  if(!rated.length) h += '<p class="muted">No outside people on this event. Add them in People and tag them Performers, Vendors, Venue or Security.</p>';
  else {
    h += '<div class="list">';
    rated.forEach(c => {
      const r = W.ratings[c.id] || {};
      h += '<div class="li rate"><span><b>'+esc(c.name||c.org)+'</b><br><span class="hint">'+esc([c.role,c.org && c.name ? c.org : ''].filter(Boolean).join(' · '))+'</span></span>';
      h += '<span class="stars small" role="group" aria-label="Rating for '+esc(c.name||c.org)+'">'+[1,2,3,4,5].map(n => '<button class="star" data-act="wrapPerson" data-id="'+c.id+'" data-v="'+n+'" aria-pressed="'+(Number(r.score) >= n)+'" aria-label="'+n+' of 5"'+ro()+'>★</button>').join('')+'</span>';
      h += '<input class="inline-in" data-rate="'+c.id+'" value="'+esc(r.note||'')+'" placeholder="A note (optional)" aria-label="Note"'+ro()+'></div>';
    });
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

TAB_VIEWS.wrapup = wrapupHTML;
Object.assign(actions, {
  wrapRate(el){ const ev = curEv(); const v = Number(el.dataset.v); ev.wrapup.rating = Number(ev.wrapup.rating) === v ? '' : v; touch(ev); },
  wrapPerson(el){ const ev = curEv(); const r = ev.wrapup.ratings[el.dataset.id] = ev.wrapup.ratings[el.dataset.id] || {}; const v = Number(el.dataset.v); r.score = Number(r.score) === v ? '' : v; touch(ev); },
  wrapDone(el){ const ev = curEv(); ev.wrapup.completedAt = el.dataset.v === '1' ? Date.now() : null; touch(ev); if(ev.wrapup.completedAt) toast('Wrap-up saved. It now counts in the Past events report.'); }
});
document.addEventListener('change', e => {
  const el = e.target; if(S.readOnly || !el.dataset) return;
  const ev = curEv(); if(!ev) return;
  if(el.dataset.wrap){ const k = el.dataset.wrap; ev.wrapup[k] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value; touch(ev); }
  else if(el.dataset.rate){ const r = ev.wrapup.ratings[el.dataset.rate] = ev.wrapup.ratings[el.dataset.rate] || {}; r.note = el.value; touch(ev); }
});
