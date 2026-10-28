/* ==========================================================================
   reminders.js — who gets an email, when, and what it says.

   The real emails are sent by the server once a day (planner/reminders.py,
   run by "python manage.py send_reminders"). That file follows the SAME rules
   as reminderPlan() below, so the preview on the Calendar tab shows exactly
   what will go out.

   The rules:
     • Deadlines and paperwork: the owner gets an email 7 days before and
       1 day before the due date (paperwork only until it's marked Submitted). If it's overdue: once the day after, then
       once a week until it's done. Never every day.
     • Show day: everyone with an email who is on a share page gets their
       itinerary link 7 days and 1 day before the show.
     • Payments: the planning team (People, the Team box) gets the same
       7-day / 1-day / weekly-overdue emails.
     • Approvals: the approver gets a nudge each week it's still waiting.
     • Mondays: the team gets one summary of what's overdue or due this week.
     • One email per person per day, listing everything for them.
     • Nothing is sent once the show AND every later deadline (editing, delivery)
       are past, or to people with reminders turned off.
   ========================================================================== */

function reminderTag(delta){
  if(delta === 7) return 'Due in one week';
  if(delta === 1) return 'Due tomorrow';
  if(delta < 0 && ((-delta) - 1) % 7 === 0) return 'Overdue';
  return null;
}
function teamContacts(ev){ return ev.contacts.filter(c => c.email && c.remind !== false && c.team); }

function reminderPlan(ev, fromYMD, days){
  const out = new Map();
  if(!isYMD(ev.date)) return [];
  const add = (date, who, email, item) => {
    const k = date+'|'+email.toLowerCase();
    if(!out.has(k)) out.set(k, {date, name:who, email, items:[]});
    out.get(k).items.push(item);
  };
  const team = teamContacts(ev), last = lastActiveDay(ev);
  for(let i = 0; i < days; i++){
    const D = addDays(fromYMD, i);
    if(D > last) break;
    ev.milestones.filter(m => m.status !== 'done').forEach(m => {
      const due = addDays(ev.date, Number(m.offset)||0), tag = reminderTag(diffDays(D, due));
      const r = ownerReach(ev, m.owner);
      if(tag && r.ok) add(D, r.contact.name || r.contact.org, r.contact.email, {kind:'Deadline', tag, text:m.title, due, done:true, id:m.id});
      // [beta] checklist steps with their own date: same 7-day / 1-day / weekly-overdue rule, to the deadline's owner
      if(r.ok) openSteps(ev, m).forEach(st => { const stag = reminderTag(diffDays(D, st.d)); if(stag) add(D, r.contact.name || r.contact.org, r.contact.email, {kind:'Step', tag:stag, text:st.text+' (part of “'+m.title+'”)', due:st.d}); });
    });
    ev.compliance.filter(c => c.status === 'needed').forEach(c => {
      const due = addDays(ev.date, Number(c.offset)||0), tag = reminderTag(diffDays(D, due));
      const r = ownerReach(ev, c.owner);
      if(tag && r.ok) add(D, r.contact.name || r.contact.org, r.contact.email, {kind:'Paperwork', tag, text:c.item, due, id:c.id});
    });
    const showDelta = diffDays(D, ev.date);
    if(showDelta === 7 || showDelta === 1){
      ev.contacts.filter(c => c.email && c.remind !== false).forEach(c => {
        const groups = (c.audiences||[]).filter(a => a !== 'Internal');
        const label = showDelta === 7 ? 'Show in one week' : 'Show tomorrow';
        if(groups.length) add(D, c.name || c.org, c.email, {kind:'Show', tag:label, text:'Your '+gname(ev, groups[0])+' itinerary for '+ev.name, due:ev.date});
        else if((c.audiences||[]).includes('Internal')) add(D, c.name || c.org, c.email, {kind:'Show', tag:label, text:ev.name+': full plan', due:ev.date});
      });
    }
    ev.budget.filter(b => b.kind === 'cost' && b.status !== 'paid' && isYMD(b.due)).forEach(b => {
      const tag = reminderTag(diffDays(D, b.due));
      if(tag) team.forEach(t => add(D, t.name, t.email, {kind:'Payment', tag, text:(b.item||b.cat)+(b.payee?' to '+b.payee:'')+' · '+usd(hasAmt(b.actual)?b.actual:b.est), due:b.due}));
    });
    ev.approvals.filter(a => a.status === 'pending' && a.approverEmail && a.requestedAt).forEach(a => {
      const since = diffDays(new Date(a.requestedAt).toISOString().slice(0,10), D);
      if(since > 0 && since % 7 === 0) add(D, a.approver, a.approverEmail, {kind:'Approval', tag:'Still waiting', text:a.label, due:''});
    });
    if(new Date(toUTC(D)).getUTCDay() === 1){
      const soon = [];
      ev.milestones.filter(m => m.status !== 'done').forEach(m => { const due = addDays(ev.date, Number(m.offset)||0), dd = diffDays(D, due); if(dd <= 7) soon.push({kind:'Deadline', tag:dd < 0 ? 'Overdue' : 'This week', text:m.title+(m.owner?' ('+m.owner+')':''), due}); openSteps(ev, m).forEach(st => { if(diffDays(D, st.d) <= 7) soon.push({kind:'Step', tag:st.d < D ? 'Overdue' : 'This week', text:'Step: '+st.text+' ('+m.title+')', due:st.d}); }); });
      ev.compliance.filter(c => c.status !== 'approved').forEach(c => { const due = addDays(ev.date, Number(c.offset)||0), dd = diffDays(D, due); if(dd <= 7) soon.push({kind:'Paperwork', tag:dd < 0 ? 'Overdue' : 'This week', text:c.item, due}); });
      ev.budget.filter(b => b.kind === 'cost' && b.status !== 'paid' && isYMD(b.due) && diffDays(D, b.due) <= 7).forEach(b => soon.push({kind:'Payment', tag:diffDays(D,b.due) < 0 ? 'Overdue' : 'This week', text:b.item||b.cat, due:b.due}));
      if(soon.length) team.forEach(t => add(D, t.name, t.email, {kind:'Weekly summary', tag:'Monday summary', text:soon.length+' item'+(soon.length>1?'s':'')+' overdue or due this week', due:'', list:soon}));
    }
  }
  return [...out.values()].sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

function remindersPanelHTML(ev){
  const from = S.remFrom || todayYMD();
  const plan = reminderPlan(ev, from, 14);
  const unreachable = [];
  ev.milestones.filter(m => m.status !== 'done' && m.owner).forEach(m => { const r = ownerReach(ev, m.owner); if(!r.ok) unreachable.push({who:m.owner, why:r.why}); });
  ev.compliance.filter(c => c.status === 'needed' && c.owner).forEach(c => { const r = ownerReach(ev, c.owner); if(!r.ok) unreachable.push({who:c.owner, why:r.why}); });
  const unique = [...new Map(unreachable.map(u => [u.who+u.why, u])).values()];
  const noOwner = ev.milestones.filter(m => m.status !== 'done' && !m.owner).length;
  let h = '<div class="panel"><div class="panel-head"><div><h2>Reminder emails</h2><p class="hint">'+(store.email?'Sent automatically once a day.':'A preview. On the live site these send automatically once a day.')+' Owners hear 7 days and 1 day before each due date; overdue items repeat weekly, not daily. One email per person per day. Each email has a “Mark done” button that works without logging in.</p></div><div class="row"><label class="toggle" for="remFrom">Preview from</label><input id="remFrom" class="inline-in" type="date" value="'+from+'"></div></div>';
  if(unique.length || noOwner) h += '<div class="banner">'+(unique.length?'<b>Won’t get reminders:</b> '+unique.map(u => esc(u.who)+' ('+u.why.toLowerCase()+')').join(', ')+'. Add them in People with an email. ':'')+(noOwner?noOwner+' open deadline'+(noOwner>1?'s have':' has')+' no owner.':'')+'</div>';
  if(!plan.length) h += '<p class="muted">No emails in the 14 days from '+fmtD(from,true)+'. Try a date closer to a deadline or the show.</p>';
  else {
    let lastDate = '';
    h += '<div class="remlist">';
    plan.forEach(p => {
      if(p.date !== lastDate){ h += '<div class="eyebrow" style="margin-top:6px">'+esc(fmtD(p.date,true))+(p.date===todayYMD()?' · today':'')+'</div>'; lastDate = p.date; }
      h += '<div class="remcard"><div class="spread"><b>'+esc(p.name)+'</b><span class="hint mono">'+esc(p.email)+'</span></div><ul>';
      p.items.forEach(it => { h += '<li><span class="pill '+(it.tag==='Overdue'?'crit':it.tag==='Due tomorrow'||it.tag==='Show tomorrow'?'warn':'')+'">'+esc(it.tag)+'</span> <span class="hint">'+esc(it.kind)+':</span> '+esc(it.text)+(it.due && it.kind!=='Show'?' <span class="hint">· due '+fmtD(it.due,true)+'</span>':'')+(it.list?'<ul>'+it.list.slice(0,5).map(x => '<li class="hint">'+esc(x.tag)+': '+esc(x.text)+'</li>').join('')+(it.list.length>5?'<li class="hint">…and '+(it.list.length-5)+' more</li>':'')+'</ul>':'')+'</li>'; });
      h += '</ul></div>';
    });
    h += '</div>';
  }
  return h + '</div>';
}
document.addEventListener('change', e => { if(e.target.id === 'remFrom'){ S.remFrom = isYMD(e.target.value) ? e.target.value : null; render(); } });
