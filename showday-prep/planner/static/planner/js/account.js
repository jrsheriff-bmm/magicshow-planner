/* ==========================================================================
   account.js — [final] the Account pop-up (the "Account" button in the left menu).

   • Your name and the email you log in with
   • A link to change your password
   • The workspace's name
   • Support access: the workspace's owner decides whether the Blackmagic Media
     team may open this workspace to help build events. Retainer clients switch
     it on (or tick the box when they sign up); anyone can switch it off again.

   The server side is planner/accounts.py, planner/access.py and the
   /api/account/ and /api/org/settings/ addresses in planner/api.py.
   ========================================================================== */
function canManageOrg(){ return !S.orgRole || S.orgRole === 'owner' || S.orgRole === 'support'; }
const PLAN_LABELS = {internal:'Blackmagic workspace', subscription:'Subscription', retainer:'Retainer client'};

MODALS.account = (ev, M) => {
  const u = S.user || {}, info = S.orgInfo || {}, team = (S.features && S.features.supportTeam) || 'Blackmagic Media';
  let h = '<div><h2 id="mt">Account</h2><p class="hint">Your login, and the workspace you’re in.</p></div>';
  h += '<div class="facts two"><div class="field"><label for="acName">Your name</label><input id="acName" value="'+esc(M.name != null ? M.name : (u.name||''))+'" autocomplete="name"></div><div class="field"><label for="acEmail">Email</label><input id="acEmail" type="email" value="'+esc(M.email != null ? M.email : (u.email||''))+'" autocomplete="email"><span class="hint">You log in with this.</span></div></div>';
  h += '<div class="row"><a class="btn small" href="/account/password/">Change password</a></div>';
  h += '<div class="field"><label for="acOrg">Workspace name'+(info.plan && PLAN_LABELS[info.plan] ? ' <span class="pill" style="margin-left:6px">'+PLAN_LABELS[info.plan]+'</span>' : '')+'</label><input id="acOrg" value="'+esc(M.org != null ? M.org : (S.org ? S.org.name : ''))+'"'+(canManageOrg() && !S.readOnly ? '' : ' disabled')+'>'+(canManageOrg() ? '' : '<span class="hint">Only the workspace owner can rename it.</span>')+'</div>';
  if(info.plan !== 'internal' || info.supportAccess){
    h += '<div style="display:flex;flex-direction:column;gap:6px"><span class="eyebrow">Help from '+esc(team)+'</span>';
    if(S.orgRole === 'support') h += '<div class="banner info">You’re in this client’s workspace through support access. The client can switch it off at any time, and it then leaves your workspace list.</div>';
    else if(S.orgRole === 'owner') h += '<label class="opt"><input type="checkbox" id="acSupport"'+(info.supportAccess ? ' checked' : '')+(M.busy ? ' disabled' : '')+'><span><b>Let the '+esc(team)+' team into this workspace</b><br><span class="hint">For retainer clients. While this is on, their team can open this workspace, see everything in it and build events with you. Switch it off whenever you like; nothing is deleted.</span></span></label>';
    else h += '<p class="muted">'+(info.supportAccess ? 'The '+esc(team)+' team can open this workspace to help. The workspace owner controls this.' : 'Off. The workspace owner can switch it on.')+'</p>';
    h += '</div>';
  }
  h += '<p class="hint" id="acErr" style="color:var(--crit)">'+esc(M.err||'')+'</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn primary" data-act="saveAccount"'+(M.busy ? ' disabled' : '')+'>'+(M.busy ? 'Saving…' : 'Save')+'</button></div>';
  return h;
};

Object.assign(actions, {
  account(){ S.modal = {type:'account'}; render(); },
  async saveAccount(){
    const M = S.modal; if(!M) return;
    const name = $('#acName').value.trim(), email = $('#acEmail').value.trim(), org = $('#acOrg').value.trim();
    Object.assign(M, {name, email, org});   // keep what was typed if the pop-up redraws
    if(!name){ M.err = 'Type your name.'; render(); return; }
    M.busy = true; M.err = ''; render();
    try {
      if(name !== S.user.name || email !== (S.user.email||'')){ const r = await store.saveAccount({name, email}); S.user.name = r.name; S.user.email = r.email; }
      if(canManageOrg() && S.org && org && org !== S.org.name){
        const r = await store.saveOrgSettings({name:org}); S.org.name = r.name;
        const o = (S.orgs||[]).find(x => String(x.id) === String(S.org.id)); if(o) o.name = r.name;
      }
      S.modal = null; render(); toast('Account saved.');
    } catch(e){ M.busy = false; M.err = e.message || 'Couldn’t save. Try again.'; render(); }
  }
});
document.addEventListener('change', async e => {
  const el = e.target; if(el.id !== 'acSupport' || !S.modal) return;
  const M = S.modal, on = el.checked, team = (S.features && S.features.supportTeam) || 'Blackmagic Media';
  Object.assign(M, {name:$('#acName').value, email:$('#acEmail').value, org:$('#acOrg').value, busy:true, err:''}); render();
  try {
    const r = await store.saveOrgSettings({supportAccess:on});
    S.orgInfo = {plan:r.plan, supportAccess:r.supportAccess};
    toast(r.supportAccess ? 'The '+team+' team can now open this workspace.' : 'Support access is off. The '+team+' team can no longer open this workspace.');
  } catch(x){ M.err = x.message || 'Couldn’t change that. Try again.'; }
  M.busy = false; render();
});
