/* ==========================================================================
   store-django.js — how the screens save and load, on the real site.

   Every other screen file is the same in the prototype and the real site.
   Only this file is different: it talks to the Django server at /api/...
   (the server side of each call is in planner/api.py).

   The rest of the code calls store.something(); it never calls fetch() directly.
   ========================================================================== */

function csrfToken(){
  // Django puts a security token in a cookie named "csrftoken"; every save must send it back.
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}
async function api(method, path, body, isForm){
  const opts = {method, credentials:'same-origin', headers:{'X-CSRFToken': csrfToken(), 'Accept':'application/json'}};
  if(body !== undefined){ if(isForm) opts.body = body; else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); } }
  let res;
  try { res = await fetch(path, opts); }
  catch(e){ const err = new Error('Can’t reach the server. Check your internet connection.'); err.code = 'offline'; throw err; }
  if(res.status === 401 || res.redirected && /\/login\//.test(res.url)){ location.href = '/login/?next=/'; throw new Error('Logged out'); }
  let data = null; try { data = await res.json(); } catch(e){}
  if(!res.ok){ const err = new Error((data && data.error) || ('Server error ('+res.status+')')); err.status = res.status; throw err; }
  return data;
}
const enc = encodeURIComponent;

const store = {
  kind: 'django',
  links: true,     // private share links and live calendar feeds exist
  email: true,     // reminder and approval emails really send
  workspaces: true, // one login can work across several client workspaces (v4)

  async init(){
    const d = await api('GET', '/api/bootstrap/');
    S.user = d.user; S.org = d.org; S.features = d.features || {};
    S.events = {}; (d.events||[]).forEach(ev => S.events[ev.id] = normalize(ev, ev.id));
    S.people = (d.people||[]).sort((a,b) => String(a.name||a.org).localeCompare(String(b.name||b.org)));
    S.notes = d.notes || [];
    S.templates = d.templates || [];
    S.orgs = d.orgs || []; S.orgRole = d.org ? d.org.role : null;
    S.hours = d.hours || [];
    // [beta] workspace members (for the owner box), join requests, and organizations to offer joining
    S.members = d.members || []; S.pendingRequests = d.pendingRequests || 0;
    S.myRequests = d.myRequests || []; S.joinSuggestions = d.joinSuggestions || [];
    S.orgInfo = {plan: d.org ? d.org.plan : '', supportAccess: !!(d.org && d.org.supportAccess), personal: !!(d.org && d.org.personal), discoverable: !!(d.org && d.org.discoverable)};
    S.orgSettings = {retainerHours: d.org && d.org.retainerHours != null ? d.org.retainerHours : '', hourlyRate: d.org && d.org.hourlyRate != null ? d.org.hourlyRate : ''};
    S.mode = 'live';
    // [beta] links in join-request emails open the Team page: /?view=team
    if(/[?&]view=team\b/.test(location.search)){ S.view = 'team'; try { history.replaceState(null, '', location.pathname); } catch(e){} setTimeout(() => loadTeam(true), 0); }
  },

  saveEvent(ev){ return api('PUT', '/api/events/'+enc(ev.id)+'/', ev); },
  deleteEvent(id){ return api('DELETE', '/api/events/'+enc(id)+'/'); },
  savePerson(p){ return api('PUT', '/api/people/'+enc(p.id)+'/', p); },
  deletePerson(id){ return api('DELETE', '/api/people/'+enc(id)+'/'); },
  saveNote(n){ return api('PUT', '/api/notes/'+enc(n.id)+'/', n); },
  deleteNote(id){ return api('DELETE', '/api/notes/'+enc(id)+'/'); },
  saveTemplate(t){ return api('PUT', '/api/templates/'+enc(t.id)+'/', t); },
  deleteTemplate(id){ return api('DELETE', '/api/templates/'+enc(id)+'/'); },

  /* v4: hours and client workspaces */
  saveHour(x){ return api('PUT', '/api/hours/'+enc(x.id)+'/', x); },
  deleteHour(id){ return api('DELETE', '/api/hours/'+enc(id)+'/'); },
  saveOrgSettings(o){ return api('PUT', '/api/org/settings/', o); },
  saveAccount(o){ return api('PUT', '/api/account/', o); },   // [final] your own name and email
  async switchWorkspace(id){ await api('POST', '/api/orgs/switch/', {id}); location.href = '/'; },
  async createWorkspace(name, city, client){ await api('POST', '/api/orgs/', {name, city:city||'', client:!!client}); location.href = '/'; },

  /* [beta] organizations: find, ask to join, the Team page */
  orgSearch(q){ return api('GET', '/api/orgs/search/?q='+enc(q)); },
  orgJoin(id, message){ return api('POST', '/api/orgs/'+enc(id)+'/join/', {message:message||''}); },
  team(){ return api('GET', '/api/org/team/'); },
  teamUpdate(o){ return api('PUT', '/api/org/team/', o); },
  decideRequest(id, decision){ return api('POST', '/api/org/requests/'+enc(id)+'/', {decision}); },
  setMemberRole(userId, role){ return api('PUT', '/api/org/members/'+enc(userId)+'/', {role}); },
  removeMember(userId){ return api('DELETE', '/api/org/members/'+enc(userId)+'/'); },
  createInvite(role){ return api('POST', '/api/org/invites/', {role:role||'member'}); },
  revokeInvite(code){ return api('DELETE', '/api/org/invites/'+enc(code)+'/'); },

  /* [beta] email a group (or chosen people) their itinerary */
  sendItinerary(ev, o){ return api('POST', '/api/events/'+enc(ev.id)+'/send-itinerary/', o); },

  /* [beta] the testing program */
  telemetry(body){ return fetch('/api/telemetry/', {method:'POST', credentials:'same-origin', keepalive:true, headers:{'X-CSRFToken': csrfToken(), 'Content-Type':'application/json'}, body:JSON.stringify(body)}).catch(() => {}); },
  testingReport(days){ return api('GET', '/api/testing/report/?days='+enc(days||7)); },
  feedbackDone(id, done){ return api('PUT', '/api/testing/feedback/'+enc(id)+'/', {done}); },

  /* files */
  blobUrl(id){ return '/files/'+id+'/'; },
  async uploadFile(file){
    const form = new FormData(); form.append('file', file);
    const r = await api('POST', '/api/files/', form, true);
    return {id:r.id, name:r.name, type:r.type, size:r.size, uploadedAt:Date.now()};
  },
  downloadAsset(f){ const a = document.createElement('a'); a.href = this.blobUrl(f.id)+'?download=1'; a.download = f.name || 'file'; document.body.appendChild(a); a.click(); a.remove(); },
  saveFile(filename, data){
    const type = /\.pdf$/i.test(filename) ? 'application/pdf' : /\.ics$/i.test(filename) ? 'text/calendar' : /\.doc$/i.test(filename) ? 'application/msword' : /\.csv$/i.test(filename) ? 'text/csv' : /\.xlsx$/i.test(filename) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream';
    const blob = data instanceof Blob ? data : new Blob([data], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  /* private links */
  shareLinks(eventId){ return api('GET', '/api/events/'+enc(eventId)+'/share-links/'); },
  async personLink(eventId, contactId){ const r = await api('GET', '/api/events/'+enc(eventId)+'/person-link/'+enc(contactId)+'/'); return r.page; },

  /* AI: only the Reports page's status summary (the server holds the Claude API key) */
  aiAvailable(){ return !!(S.features && S.features.ai); },
  async aiPortfolio(){ const r = await api('POST', '/api/reports/ai-summary/', {}); return r.text; },

  /* approvals: the server owns them and emails the approver */
  async requestApproval(ev, a){ const r = await api('POST', '/api/events/'+enc(ev.id)+'/approvals/', a); ev.approvals.push(r); if(r.emailError) setTimeout(() => toast(r.emailError), 50); },
  async decideApproval(ev, a, decision, comment, by){ const r = await api('POST', '/api/approvals/'+enc(a.id)+'/decide/', {decision, comment, by}); Object.assign(a, r); },
  async cancelApproval(ev, a){ await api('DELETE', '/api/approvals/'+enc(a.id)+'/'); ev.approvals = ev.approvals.filter(x => x.id !== a.id); },
  async resendApproval(ev, a){ await api('POST', '/api/approvals/'+enc(a.id)+'/resend/', {}); },

  logout(){ const f = document.getElementById('logoutForm'); if(f) f.submit(); else location.href = '/login/'; }
};
