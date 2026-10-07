/* ==========================================================================
   approvals.js — asking someone to sign off, and recording their answer.

   An approval is {id, targetType:'event'|'budget'|'compliance', targetId, label,
   approver, approverEmail, note, status:'pending'|'approved'|'declined',
   comment, decidedBy, decidedAt, requestedAt, requestedBy}.

   On the real site the approver gets an email with Approve / Decline buttons
   (planner/views.py → approval_page). Anyone on the team can also record a
   decision by hand, for approvals given in person or by phone.
   ========================================================================== */

function approvalFor(ev, type, id){ const list = ev.approvals.filter(a => a.targetType === type && a.targetId === id); return list[list.length - 1] || null; }
function approvalPill(a){
  const cls = a.status === 'approved' ? 'good' : a.status === 'declined' ? 'crit' : 'warn';
  return '<span class="pill '+cls+'" title="'+esc((a.approver||'')+(a.comment?': '+a.comment:''))+'">'+esc(statusLabel(APPROVAL_STATUS,a.status))+'</span>';
}
/* The small cell shown on budget and paperwork rows. */
function approvalCell(ev, type, id, label){
  const a = approvalFor(ev, type, id);
  if(!a) return '<button class="btn small ghost" data-act="askApproval" data-type="'+type+'" data-id="'+id+'" data-label="'+esc(label)+'"'+ro()+'>Request</button>';
  return '<button class="btn small ghost" data-act="openApproval" data-id="'+a.id+'" style="padding:2px 4px">'+approvalPill(a)+'</button>';
}
function approvalsPanelHTML(ev){
  let h = '<div class="panel"><div class="panel-head"><div><h2>Approvals</h2><p class="hint">Sign-offs from a supervisor, client or finance office, with who approved and when. '+(store.email?'The approver gets an email with Approve and Decline buttons.':'In the prototype, record the answer yourself. On the live site the approver gets an email with Approve and Decline buttons.')+'</p></div><button class="btn small" data-act="askApproval" data-type="event" data-id="'+ev.id+'" data-label="'+esc('Event plan: '+(ev.name||''))+'"'+ro()+'>Request sign-off on the event plan</button></div>';
  if(!ev.approvals.length) h += '<p class="muted">No approvals requested yet. You can also request one from any budget line or paperwork item.</p>';
  else {
    h += '<div class="list">';
    ev.approvals.slice().reverse().forEach(a => {
      h += '<div class="li"><span class="when">'+(a.requestedAt?fmtD(new Date(a.requestedAt).toISOString().slice(0,10)):'')+'</span><button class="btn ghost" style="text-align:left;white-space:normal;justify-content:flex-start;padding:4px 6px" data-act="openApproval" data-id="'+a.id+'"><span><b>'+esc(a.label)+'</b><br><span class="hint">'+esc(a.approver||'Approver')+(a.decidedAt?' · '+esc(statusLabel(APPROVAL_STATUS,a.status).toLowerCase())+' '+fmtD(new Date(a.decidedAt).toISOString().slice(0,10)):'')+(a.comment?' · “'+esc(a.comment)+'”':'')+'</span></span></button>'+approvalPill(a)+'</div>';
    });
    h += '</div>';
  }
  return h + '</div>';
}

MODALS.approval = (ev, M) => {
  const withEmail = ev.contacts.filter(c => c.email);
  let h = '<div><h2 id="mt">Request approval</h2><p class="hint">'+(store.email?'We’ll email the approver a link to approve or decline. No login needed.':'On the live site the approver gets an email. Here you’ll record their answer yourself.')+'</p></div>';
  h += '<div class="facts"><div class="field wide"><label for="apLabel">What needs approval</label><input id="apLabel" value="'+esc(M.label||'')+'"></div>';
  h += '<div class="field wide"><label for="apPick">Approver</label><select id="apPick"><option value="">Someone else (type below)</option>'+withEmail.map(c => '<option value="'+c.id+'">'+esc(c.name+(c.role?' · '+c.role:'')+' · '+c.email)+'</option>').join('')+'</select></div>';
  h += '<div class="field"><label for="apName">Name</label><input id="apName" placeholder="e.g. Jessica Potter"></div><div class="field"><label for="apEmail">Email</label><input id="apEmail" type="email" placeholder="name@example.com"></div>';
  h += '<div class="field wide"><label for="apNote">Note to the approver (optional)</label><textarea id="apNote" rows="3" placeholder="Anything they should know"></textarea></div></div>';
  h += '<p class="hint" id="apErr" style="color:var(--crit)"></p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doRequestApproval"'+ro()+'>'+(store.email?'Send request':'Add request')+'</button></div>';
  return h;
};
MODALS.approvalView = (ev, M) => {
  const a = ev.approvals.find(x => x.id === M.id); if(!a) return '';
  let h = '<div class="spread"><div><h2 id="mt">'+esc(a.label)+'</h2><p class="hint">Requested '+(a.requestedAt?fmtD(new Date(a.requestedAt).toISOString().slice(0,10),true):'')+(a.requestedBy?' by '+esc(a.requestedBy):'')+' · approver: '+esc(a.approver||'—')+(a.approverEmail?' ('+esc(a.approverEmail)+')':'')+'</p></div>'+approvalPill(a)+'</div>';
  if(a.note) h += '<p><b>Note:</b> '+esc(a.note)+'</p>';
  if(a.status !== 'pending') h += '<div class="banner '+(a.status==='approved'?'info':'')+'">'+esc(statusLabel(APPROVAL_STATUS,a.status))+' by '+esc(a.decidedBy||a.approver||'—')+(a.decidedAt?' on '+fmtD(new Date(a.decidedAt).toISOString().slice(0,10),true):'')+(a.comment?': “'+esc(a.comment)+'”':'.')+'</div>';
  else {
    h += '<fieldset class="opts" style="border:0;padding:0;margin:0"><legend class="eyebrow" style="margin-bottom:8px">Record their answer</legend><label class="opt"><input type="radio" name="apDec" value="approved" checked><span><b>Approved</b></span></label><label class="opt"><input type="radio" name="apDec" value="declined"><span><b>Declined</b></span></label></fieldset>';
    h += '<div class="facts"><div class="field"><label for="apBy">Decided by</label><input id="apBy" value="'+esc(a.approver||'')+'"></div><div class="field wide"><label for="apCom">Comment (optional)</label><textarea id="apCom" rows="2"></textarea></div></div>';
  }
  h += '<div class="row" style="justify-content:space-between"><button class="btn ghost danger" data-act="cancelApproval" data-id="'+a.id+'"'+ro()+'>'+(a.status==='pending'?'Cancel request':'Delete record')+'</button><div class="row"><button class="btn ghost" data-act="closeModal">Close</button>'+(a.status==='pending'?(store.email&&a.approverEmail?'<button class="btn" data-act="resendApproval" data-id="'+a.id+'"'+ro()+'>Resend email</button>':'')+'<button class="btn primary" data-act="doDecide" data-id="'+a.id+'"'+ro()+'>Save answer</button>':'')+'</div></div>';
  return h;
};

Object.assign(actions, {
  askApproval(el){ S.modal = {type:'approval', targetType:el.dataset.type, targetId:el.dataset.id, label:el.dataset.label}; render(); setTimeout(() => { const p = $('#apPick'); if(p) p.focus(); }, 0); },
  openApproval(el){ S.modal = {type:'approvalView', id:el.dataset.id}; render(); },
  async doRequestApproval(){
    const ev = curEv(), M = S.modal, err = $('#apErr');
    const pick = contactById(ev, $('#apPick').value);
    const name = pick ? pick.name : $('#apName').value.trim(), email = pick ? pick.email : $('#apEmail').value.trim();
    const label = $('#apLabel').value.trim() || M.label;
    if(!name){ err.textContent = 'Pick or type the approver’s name.'; return; }
    if(store.email && !/.+@.+\..+/.test(email)){ err.textContent = 'Add the approver’s email so they get the request.'; return; }
    const a = {id:uid(), targetType:M.targetType, targetId:M.targetId, label, approver:name, approverEmail:email, note:$('#apNote').value.trim(), status:'pending', comment:'', decidedBy:'', decidedAt:null, requestedAt:Date.now(), requestedBy:S.user ? S.user.name : ''};
    try { await store.requestApproval(ev, a); S.modal = null; render(); toast(store.email ? 'Approval request emailed to '+name+'.' : 'Approval request added.'); }
    catch(e){ err.textContent = e.message || 'Couldn’t send the request.'; }
  },
  async doDecide(el){
    const ev = curEv(), a = ev.approvals.find(x => x.id === el.dataset.id); if(!a) return;
    const d = (document.querySelector('input[name="apDec"]:checked')||{}).value || 'approved';
    try { await store.decideApproval(ev, a, d, $('#apCom').value.trim(), $('#apBy').value.trim()); S.modal = null; render(); toast('Answer recorded.'); }
    catch(e){ toast(e.message || 'Couldn’t save the answer.'); }
  },
  async cancelApproval(el){ const ev = curEv(), a = ev.approvals.find(x => x.id === el.dataset.id); if(!a) return; try { await store.cancelApproval(ev, a); S.modal = null; render(); } catch(e){ toast(e.message); } },
  async resendApproval(el){ const ev = curEv(), a = ev.approvals.find(x => x.id === el.dataset.id); if(!a) return; try { await store.resendApproval(ev, a); toast('Email sent again to '+a.approver+'.'); } catch(e){ toast(e.message); } }
});
document.addEventListener('change', e => {
  if(e.target.id !== 'apPick') return;
  const c = contactById(curEv(), e.target.value);
  const n = $('#apName'), m = $('#apEmail');
  if(n && m){ n.value = c ? c.name : ''; m.value = c ? c.email : ''; n.disabled = m.disabled = !!c; }
});
