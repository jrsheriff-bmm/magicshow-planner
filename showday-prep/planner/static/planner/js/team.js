/* ==========================================================================
   team.js — [beta] organizations: the Team page, joining, and invite links.

   How it works (the server side is planner/teams.py):
   • Everyone gets a personal workspace when they sign up. Typing an
     organization's name at sign-up creates that organization with them as owner.
   • Others can find an organization by name or city and ask to join. Its owners
     get an email and approve or decline on the Team page.
   • Owners can also make an invite link (good for 14 days). Anyone who opens it
     and logs in or signs up joins straight away.
   • Members appear in every event's Owner box, so picking one fills in their
     email for reminders (addMemberToPeople in actions.js).
   • The home page shows banners for requests waiting on you, or your own
     requests waiting on someone else, and "Assigned to you".
   ========================================================================== */
const ROLE_LABELS = {owner:'Owner', member:'Member', support:'Blackmagic support'};

async function loadTeam(force){
  if(!store.team || (S.teamData && !force) || S.teamLoading) return;
  S.teamLoading = true;
  try { S.teamData = await store.team(); S.pendingRequests = (S.teamData.requests || []).length; }
  catch(e){ S.teamData = {error: e.message || 'Couldn’t load the team.'}; }
  S.teamLoading = false; softRender();
}

function teamHTML(){
  const T = S.teamData; if(!T) loadTeam();
  const orgName = S.org ? S.org.name : 'this workspace', personal = !!(S.orgInfo && S.orgInfo.personal);
  let h = '<div class="head"><div><div class="eyebrow">'+(personal ? 'Personal workspace' : 'Organization')+'</div><h1>'+esc(orgName)+'</h1><p class="muted" style="margin-top:6px;max-width:64ch">'+(personal ? 'Only you can see the events in your personal workspace. To plan with other people, create an organization or ask to join one below.' : 'Everyone in the organization sees its events, contacts and templates, and can be picked as an owner of a deadline.')+'</p></div><div class="row"><button class="btn primary" data-act="newWorkspace">+ New organization</button></div></div>';
  if(!T) return h + '<div class="empty"><p>Loading the team…</p></div>';
  if(T.error) return h + '<div class="banner">'+esc(T.error)+' <button class="btn small" data-act="reloadTeam">Try again</button></div>';
  const manage = T.canManage;

  if(manage && (T.requests||[]).length){
    h += '<div class="panel"><div class="panel-head"><div><h2>Asking to join <span class="count warn">'+T.requests.length+'</span></h2><p class="hint">Approve people you know. They join as members and see everything in '+esc(orgName)+'. Declining sends them a short note; nothing else changes.</p></div></div>';
    T.requests.forEach(r => h += '<div class="reqrow"><div><b>'+esc(r.name)+'</b> <span class="hint mono">'+esc(r.email)+'</span>'+(r.message ? '<p class="muted">“'+esc(r.message)+'”</p>' : '')+'<span class="hint">Asked '+esc(fmtD(new Date(r.at).toISOString().slice(0,10)))+'</span></div><div class="row"><button class="btn small" data-act="decideJoin" data-id="'+r.id+'" data-v="declined">Decline</button><button class="btn small primary" data-act="decideJoin" data-id="'+r.id+'" data-v="approved">Approve</button></div></div>');
    h += '</div>';
  }

  h += '<div class="panel"><div class="panel-head"><div><h2>Members</h2><p class="hint">Owners approve requests, make invite links and change roles. Members plan events. '+(manage ? '' : 'Only owners can change members.')+'</p></div></div><div class="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>';
  (T.members||[]).forEach(m => {
    const canEdit = manage && m.role !== 'support';
    h += '<tr><td><b>'+esc(m.name)+'</b>'+(m.you ? ' <span class="pill">You</span>' : '')+'</td><td class="mono">'+esc(m.email)+'</td><td>'+(canEdit ? '<select data-mrole="'+m.id+'" aria-label="Role">'+['owner','member'].map(r => '<option value="'+r+'"'+(r === m.role ? ' selected' : '')+'>'+ROLE_LABELS[r]+'</option>').join('')+'</select>' : esc(ROLE_LABELS[m.role] || m.role))+'</td>';
    h += '<td>'+(m.role === 'support' ? '<span class="hint">Switched on and off under Account</span>' : (canEdit || m.you) && !personal ? (S.teamConfirm === m.id ? '<button class="btn small danger" data-act="removeMember" data-id="'+m.id+'">'+(m.you ? 'Leave '+esc(orgName) : 'Remove '+esc(m.name.split(' ')[0]))+'</button>' : '<button class="btn small ghost" data-act="askRemoveMember" data-id="'+m.id+'">'+(m.you ? 'Leave' : 'Remove')+'</button>') : '')+'</td></tr>';
  });
  h += '</tbody></table></div></div>';

  if(manage && !personal){
    h += '<div class="panel"><div class="panel-head"><div><h2>Invite links</h2><p class="hint">Send a link to someone you want on the team. When they open it and log in or sign up, they join right away. Links work for 14 days; switch one off any time.</p></div><div class="row"><button class="btn small" data-act="makeInvite" data-role="member">New member link</button><button class="btn small" data-act="makeInvite" data-role="owner">New owner link</button></div></div>';
    if(!(T.invites||[]).length) h += '<p class="muted">No open invite links.</p>';
    (T.invites||[]).forEach(i => h += '<div class="row invrow"><span class="pill">'+ROLE_LABELS[i.role]+'</span><input class="inline-in mono" style="flex:1;min-width:220px;font-size:12.5px" readonly value="'+esc(i.url)+'" aria-label="Invite link"><button class="btn small primary" data-act="copyLink" data-url="'+esc(i.url)+'" data-label="Invite link">Copy</button><span class="hint">Used '+i.uses+' time'+(i.uses===1?'':'s')+' · until '+esc(fmtD(new Date(i.expires).toISOString().slice(0,10)))+'</span><button class="btn small ghost danger" data-act="revokeInvite" data-code="'+esc(i.code)+'">Switch off</button></div>');
    h += '</div>';
    h += '<div class="panel"><div class="panel-head"><div><h2>Finding '+esc(orgName)+'</h2><p class="hint">When this is on, people can find '+esc(orgName)+' by name or city and ask to join. You approve each request.</p></div></div><div class="facts two"><div class="field"><label for="tmCity">City</label><input id="tmCity" value="'+esc(T.city||'')+'" placeholder="e.g. Sacramento"></div><div class="field"><span class="lbl">Search</span><label class="toggle" style="padding-top:8px"><input type="checkbox" id="tmFind"'+(T.discoverable ? ' checked' : '')+'> Let people find us and ask to join</label></div></div></div>';
  }

  h += '<div class="panel"><div class="panel-head"><div><h2>Join an organization</h2><p class="hint">Search for your organization by name or city. Its owners get an email and approve you. Until then you keep working in the workspace you’re in.</p></div></div>';
  h += '<div class="field" style="max-width:420px"><label for="orgQ">Organization name or city</label><input id="orgQ" value="'+esc(S.orgQ||'')+'" placeholder="At least 2 letters" autocomplete="off"></div>';
  const R = S.orgResults;
  if(R && R.q === S.orgQ && S.orgQ && S.orgQ.length >= 2){
    if(!R.results.length) h += '<p class="muted">No organizations match “'+esc(S.orgQ)+'”. If yours isn’t on MagicShow yet, create it with “+ New organization”.</p>';
    R.results.forEach(o => h += '<div class="reqrow"><div><b>'+esc(o.name)+'</b>'+(o.city ? ' <span class="hint">· '+esc(o.city)+'</span>' : '')+' <span class="hint">· '+o.members+' member'+(o.members===1?'':'s')+'</span></div>'+(o.status === 'member' ? '<span class="pill good">You’re in it</span>' : o.status === 'pending' ? '<span class="pill warn">Waiting for approval</span>' : '<button class="btn small primary" data-act="askJoin" data-id="'+o.id+'" data-name="'+esc(o.name)+'">Ask to join</button>')+'</div>');
  }
  if((S.myRequests||[]).length) h += '<p class="hint">Waiting for approval: '+S.myRequests.map(r => esc(r.org)).join(', ')+'.</p>';
  return h + '</div>';
}

MODALS.joinOrg = (ev, M) => {
  let h = '<div><h2 id="mt">Ask to join '+esc(M.name)+'</h2><p class="hint">The owners of '+esc(M.name)+' get an email with your name and email address, and your note. You’ll get an email when they answer.</p></div>';
  h += '<div class="field"><label for="joinMsg">Note to the owners (optional)</label><textarea id="joinMsg" rows="3" placeholder="e.g. I’m the new volunteer coordinator."></textarea></div>';
  if(M.err) h += '<div class="banner">'+esc(M.err)+'</div>';
  return h + '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doJoin"'+(M.busy ? ' disabled' : '')+'>'+(M.busy ? 'Sending…' : 'Send request')+'</button></div>';
};

/* The "+ New organization" pop-up (replaces the old client-workspace one). */
MODALS.newWorkspace = (ev, M) => {
  const team = S.features && S.features.clientWorkspace;
  let h = '<div><h2 id="mt">New organization</h2><p class="hint">A shared space for one organization: its own events, contacts, templates and hours. You’ll be its owner, and you can invite people from the Team page. Your personal workspace stays as it is.</p></div>';
  h += '<div class="facts two"><div class="field"><label for="wsName">Organization name</label><input id="wsName" placeholder="e.g. Eastside Youth Arts" value="'+esc(M.name||'')+'"></div><div class="field"><label for="wsCity">City (optional)</label><input id="wsCity" placeholder="Helps people find you" value="'+esc(M.city||'')+'"></div></div>';
  if(team) h += '<label class="opt"><input type="checkbox" id="wsClient"><span><b>Client workspace (Blackmagic team)</b><br><span class="hint">For a retainer client. It’s hidden from search, and it shows up in the Hours page’s retainer totals.</span></span></label>';
  h += '<p class="hint" id="wsErr" style="color:var(--crit)">'+esc(M.err||'')+'</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doNewWorkspace">Create and switch</button></div>';
  return h;
};

/* ---------- home page: banners and "Assigned to you" ---------- */
function homeBannersHTML(){
  if(!S.user) return '';
  let h = '';
  (S.joinSuggestions||[]).forEach(o => h += '<div class="banner info row" style="justify-content:space-between"><span><b>'+esc(o.name)+'</b>'+(o.city ? ' ('+esc(o.city)+')' : '')+' is already on MagicShow. If that’s your organization, ask to join it. Meanwhile you can plan in your own workspace.</span><span class="row"><button class="btn small ghost" data-act="dismissSuggest" data-id="'+o.id+'">Not mine</button><button class="btn small primary" data-act="askJoin" data-id="'+o.id+'" data-name="'+esc(o.name)+'">Ask to join</button></span></div>');
  if(S.pendingRequests) h += '<div class="banner row" style="justify-content:space-between"><span>'+S.pendingRequests+' '+(S.pendingRequests === 1 ? 'person is' : 'people are')+' asking to join '+esc(S.org ? S.org.name : 'your organization')+'.</span><button class="btn small primary" data-act="team">Review</button></div>';
  (S.myRequests||[]).forEach(r => h += '<div class="banner info">You asked to join '+esc(r.org)+'. You’ll get an email when an owner approves it.</div>');
  return h;
}
function myTasks(){
  if(!S.user) return [];
  const me = norm(S.user.name), mail = String(S.user.email||'').toLowerCase(), today = todayYMD(), soon = addDays(today, 14), out = [];
  Object.values(S.events).forEach(ev => {
    if(!isYMD(ev.date)) return;
    const mine = name => { if(!name) return false; if(norm(name) === me) return true; const c = findContact(ev, name); return !!(c && mail && String(c.email||'').toLowerCase() === mail); };
    ev.milestones.forEach(m => {
      if(m.status === 'done' || !mine(m.owner)) return;
      const d = addDays(ev.date, Number(m.offset)||0);
      if(d <= soon) out.push({ev, m, d, text:m.title, kind:'Deadline'});
      openSteps(ev, m).forEach(st => { if(st.d <= soon) out.push({ev, m, d:st.d, text:st.text, kind:'Step'}); });
    });
  });
  return out.sort((a,b) => a.d.localeCompare(b.d));
}
function assignedHTML(){
  const list = myTasks(); if(!list.length) return '';
  const today = todayYMD();
  let h = '<div class="panel"><div class="panel-head"><div><h2>Assigned to you</h2><p class="hint">Your deadlines and steps due in the next two weeks, or overdue, across every event.</p></div></div><div class="assigned">';
  list.slice(0, 10).forEach(x => h += '<button class="asgrow" data-act="openTask" data-ev="'+x.ev.id+'" data-id="'+x.m.id+'"><span class="mono'+(x.d < today ? ' late' : '')+'">'+(x.d < today ? 'Overdue · ' : '')+esc(fmtD(x.d, true))+'</span><span><b>'+esc(x.text)+'</b>'+(x.kind === 'Step' ? ' <span class="hint">· step of “'+esc(x.m.title)+'”</span>' : '')+'</span><span class="hint">'+esc(x.ev.name)+'</span></button>');
  if(list.length > 10) h += '<p class="hint">and '+(list.length - 10)+' more</p>';
  return h + '</div></div>';
}

Object.assign(actions, {
  team(){ S.view = 'team'; S.modal = null; S.drawer = null; S.teamConfirm = null; render(); window.scrollTo(0,0); loadTeam(true); },
  reloadTeam(){ S.teamData = null; loadTeam(true); render(); },
  openTask(el){ openEvent(el.dataset.ev); S.tab = 'milestones'; S.drawer = {type:'ms', id:el.dataset.id}; render(); },
  async decideJoin(el){
    el.disabled = true;
    try { await store.decideRequest(el.dataset.id, el.dataset.v); toast(el.dataset.v === 'approved' ? 'Approved. They’ve been emailed and can open '+(S.org ? S.org.name : 'the organization')+' now.' : 'Declined. They’ve been told.'); await loadTeam(true); refreshMembers(); }
    catch(e){ el.disabled = false; toast(e.message || 'Couldn’t save that. Try again.'); }
  },
  askRemoveMember(el){ S.teamConfirm = Number(el.dataset.id); render(); },
  async removeMember(el){
    const id = Number(el.dataset.id), me = (S.teamData.members||[]).find(m => m.you);
    try { await store.removeMember(id); if(me && me.id === id){ location.href = '/'; return; } S.teamConfirm = null; toast('Removed.'); await loadTeam(true); refreshMembers(); }
    catch(e){ S.teamConfirm = null; render(); toast(e.message || 'Couldn’t remove them.'); }
  },
  async makeInvite(el){
    try { const r = await store.createInvite(el.dataset.role); await loadTeam(true); copyText(r.url, 'Invite link'); }
    catch(e){ toast(e.message || 'Couldn’t make a link.'); }
  },
  async revokeInvite(el){ try { await store.revokeInvite(el.dataset.code); toast('That link no longer works.'); await loadTeam(true); } catch(e){ toast(e.message || 'Couldn’t switch it off.'); } },
  askJoin(el){ S.modal = {type:'joinOrg', id:el.dataset.id, name:el.dataset.name}; render(); setTimeout(() => { const t = $('#joinMsg'); if(t) t.focus(); }, 0); },
  async doJoin(){
    const M = S.modal; if(!M || M.busy) return;
    const msg = ($('#joinMsg')||{}).value || '';
    M.busy = true; M.err = ''; render();
    try {
      await store.orgJoin(M.id, msg);
      S.myRequests = (S.myRequests||[]).filter(r => r.org !== M.name).concat({org:M.name, at:Date.now()});
      S.joinSuggestions = (S.joinSuggestions||[]).filter(o => String(o.id) !== String(M.id));
      if(S.orgResults) S.orgResults.results.forEach(o => { if(String(o.id) === String(M.id)) o.status = 'pending'; });
      S.modal = null; render(); toast('Request sent to the owners of '+M.name+'.');
    } catch(e){ M.busy = false; M.err = e.message || 'Couldn’t send the request.'; render(); }
  },
  dismissSuggest(el){ S.joinSuggestions = (S.joinSuggestions||[]).filter(o => String(o.id) !== el.dataset.id); render(); },
  newWorkspace(){ S.modal = {type:'newWorkspace'}; render(); setTimeout(() => { const i = $('#wsName'); if(i) i.focus(); }, 0); },
  async doNewWorkspace(){
    const M = S.modal, name = $('#wsName').value.trim(), city = ($('#wsCity')||{}).value || '', client = !!($('#wsClient')||{}).checked;
    Object.assign(M, {name, city});
    if(!name){ M.err = 'Type the organization’s name.'; render(); return; }
    try { await store.createWorkspace(name, city.trim(), client); } catch(e){ M.err = e.message || 'Couldn’t create it.'; render(); }
  }
});
/* After someone joins or leaves, the Owner box picks up the change. */
function refreshMembers(){
  if(!S.teamData || !S.teamData.members) return;
  S.members = S.teamData.members.filter(m => m.role !== 'support').map(m => ({name:m.name, email:m.email, role:m.role}));
}

let orgQTimer = null;
document.addEventListener('input', e => {
  if(e.target.id !== 'orgQ') return;
  S.orgQ = e.target.value.trim(); clearTimeout(orgQTimer);
  if(S.orgQ.length < 2){ S.orgResults = null; return; }
  orgQTimer = setTimeout(async () => {
    const q = S.orgQ;
    try { const r = await store.orgSearch(q); if(q === S.orgQ){ S.orgResults = {q, results:r.results || []}; render(); refocus('orgQ'); } }
    catch(x){ toast(x.message || 'Couldn’t search.'); }
  }, 300);
});
document.addEventListener('change', async e => {
  const el = e.target;
  if(el.dataset && el.dataset.mrole){ try { await store.setMemberRole(el.dataset.mrole, el.value); toast('Role changed.'); await loadTeam(true); refreshMembers(); } catch(x){ toast(x.message || 'Couldn’t change that.'); await loadTeam(true); } return; }
  if(el.id === 'tmCity'){ try { S.teamData = await store.teamUpdate({city:el.value}); toast('City saved.'); } catch(x){ toast(x.message); } return; }
  if(el.id === 'tmFind'){ try { S.teamData = await store.teamUpdate({discoverable:el.checked}); if(S.orgInfo) S.orgInfo.discoverable = S.teamData.discoverable; toast(el.checked ? 'People can now find you and ask to join.' : 'Hidden from search. Invite links still work.'); render(); } catch(x){ toast(x.message); } return; }
});
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'wsName'){ e.preventDefault(); actions.doNewWorkspace(); } });
