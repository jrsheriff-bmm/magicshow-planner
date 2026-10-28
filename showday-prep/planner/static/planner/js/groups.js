/* ==========================================================================
   groups.js — [beta] groups, group lists, importing a list, and emailing a group.

   • Groups: each event has its own share-page groups (ev.groups), such as
     Performers, Food vendors, Retail, Info booths. "Edit groups" on the Share
     pages tab renames, adds and removes them. A group marked "vendor" gets the
     "Bring with you" list and the vendor-fee column on its page.
   • Group lists: people who need an itinerary but aren't on the planning team
     (contacts with roster: true). They live on People → Group lists, not in the
     team table, and they never appear in "Who to contact" on share pages.
   • Import a list: a Jotform, Google Forms or Excel export (.csv or .xlsx).
     MagicShow guesses which column is which, you check it, and it adds everyone
     to the right group. People already on the list are updated, not doubled.
   • Email a group: sends each person in a group their private itinerary link
     (the server does the sending: POST /api/events/<id>/send-itinerary/).
   • Small layout helpers: pieceLabel() and bunchedGroups().
   ========================================================================== */

/* ---------- deadline cards: how many steps are done ---------- */
function stepsBarHTML(ev, m){
  const P = stepProgress(m); if(!P.total) return '';
  const next = openSteps(ev, m).sort((a,b) => a.d.localeCompare(b.d))[0];
  const late = next && next.d < todayYMD();
  return '<span class="cardprog" title="'+P.done+' of '+P.total+' steps done"><span class="bar"><i style="width:'+P.pct+'%"></i></span><span class="mono">'+P.done+'/'+P.total+'</span></span>'+
    (next ? '<span class="hint nextstep'+(late?' late':'')+'">'+(late?'Overdue step: ':'Next step: ')+esc(next.text)+' · '+fmtD(next.d)+'</span>' : '');
}

/* ---------- layout ---------- */
function pieceLabel(ev, p){
  if(p.label) return p.label;
  const c = p.contactId && contactById(ev, p.contactId);
  if(c) return c.org || c.name || (LAYOUT_PIECES[p.kind]||{}).label || p.kind;
  return (LAYOUT_PIECES[p.kind]||{}).label || p.kind;
}
/* Three or more booths of one group touching each other, when the room has more than one group. */
function bunchedGroups(ev){
  const L = ev.layout, gs = groupsOf(ev).filter(g => L.pieces.some(p => p.group === g.id));
  if(gs.length < 2) return [];
  const box = p => { const r = (p.rot||0) % 180 !== 0; return {x:p.x, y:p.y, w:r?p.h:p.w, h:r?p.w:p.h}; };
  const near = (a, b) => {
    const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    return gx <= 2 && gy <= 2;   // within 2 ft on both sides: side by side or back to back
  };
  const out = [];
  gs.forEach(g => {
    const ps = L.pieces.filter(p => p.group === g.id).map(box); if(ps.length < 3) return;
    const seen = new Set(); let best = 0;
    ps.forEach((_, i) => {
      if(seen.has(i)) return;
      let size = 0; const st = [i]; seen.add(i);
      while(st.length){ const k = st.pop(); size++; ps.forEach((q, j) => { if(!seen.has(j) && near(ps[k], q)){ seen.add(j); st.push(j); } }); }
      best = Math.max(best, size);
    });
    if(best >= 3) out.push({id:g.id, name:g.name, count:best});
  });
  return out;
}

/* ---------- saving before the server needs the event ---------- */
async function saveNow(ev){
  clearTimeout(timers[ev.id]);
  for(let i = 0; i < 100 && saving[ev.id]; i++) await new Promise(r => setTimeout(r, 100));
  if(pending[ev.id]) await flush(ev.id);
}

/* ---------- share pages: who gets this page ---------- */
function groupMembers(ev, gid){ return ev.contacts.filter(c => (c.audiences||[]).includes(gid)); }
function groupListHTML(ev, gid){
  const all = groupMembers(ev, gid), withEmail = all.filter(c => c.email && c.email.includes('@')), unsent = withEmail.filter(c => !c.sentAt);
  const name = gname(ev, gid);
  let h = '<div class="panel inset"><div class="panel-head"><div><h3>Who gets the '+esc(name)+' page</h3><p class="hint">'+all.length+' '+(all.length===1?'person':'people')+' in this group · '+withEmail.length+' with an email · '+withEmail.filter(c => c.sentAt).length+' sent so far.'+(all.length > withEmail.length ? ' '+(all.length-withEmail.length)+' without an email: send them the link another way.' : '')+'</p></div><div class="row">';
  h += '<button class="btn small" data-act="viewList" data-aud="'+esc(gid)+'">Open the list</button><button class="btn small" data-act="importList" data-aud="'+esc(gid)+'"'+ro()+'>Import a list</button>';
  if(store.email) h += '<button class="btn primary small" data-act="emailGroup" data-aud="'+esc(gid)+'"'+(withEmail.length?'':' disabled')+ro()+'>'+(unsent.length ? 'Email the itinerary to '+unsent.length+' not sent yet' : withEmail.length ? 'Email the itinerary again' : 'Email the itinerary')+'</button>';
  h += '</div></div>';
  if(!store.email) h += '<span class="hint">On the live site, a button here emails this page to everyone in the group in one go, and shows who has had it.</span>';
  if(all.length){
    h += '<div class="minilist">'+all.slice(0, 12).map(c => '<span class="pill'+(c.sentAt?' good':'')+'" title="'+esc(c.sentAt ? 'Sent '+fmtD(new Date(c.sentAt).toISOString().slice(0,10)) : c.email ? 'Not sent yet' : 'No email')+'">'+esc(c.org || c.name || 'Unnamed')+(c.sentAt?' ✓':c.email?'':' · no email')+'</span>').join('')+(all.length > 12 ? '<span class="hint">and '+(all.length-12)+' more</span>' : '')+'</div>';
  }
  return h + '</div>';
}

/* ---------- People → Group lists ---------- */
function rosterTableHTML(ev){
  const groups = groupsOf(ev), list = ev.contacts.filter(c => c.roster);
  if(S.rosterGroup && !groups.some(g => g.id === S.rosterGroup)) S.rosterGroup = '';
  const rows = list.filter(c => !S.rosterGroup || (c.audiences||[]).includes(S.rosterGroup));
  const B = typeof budgetSummary === 'function' ? budgetSummary(ev) : null;
  let h = '<div class="row" style="justify-content:space-between;align-items:flex-end"><div class="seg" role="group" aria-label="Show group"><button data-act="rosterGroup" data-v="" aria-pressed="'+(!S.rosterGroup)+'">Everyone ('+list.length+')</button>'+groups.map(g => { const n = list.filter(c => (c.audiences||[]).includes(g.id)).length; return n || S.rosterGroup === g.id ? '<button data-act="rosterGroup" data-v="'+esc(g.id)+'" aria-pressed="'+(S.rosterGroup===g.id)+'">'+esc(g.name)+' ('+n+')</button>' : ''; }).join('')+'</div>';
  h += '<span class="hint">'+help('lists')+(B && B.vendorCount ? ' Vendor fees: '+usd(B.vendorPaid)+' paid of '+usd(B.vendorFees)+'.' : '')+'</span></div>';
  h += '<div class="tablewrap"><table class="ppl" style="min-width:1480px"><thead><tr><th>Name</th><th>Business / organization</th><th>What they sell or do</th><th>Group</th><th>Booth</th><th>Email</th><th>Phone</th><th>Fee</th><th>Paid</th><th title="The automatic itinerary emails a week before and the day before the show">Auto emails</th><th>Itinerary</th><th></th></tr></thead><tbody>';
  rows.forEach(c => {
    const gid = (c.audiences||[]).find(a => a !== 'Internal') || '';
    h += '<tr data-row="'+c.id+'"><td>'+inp('contacts',c.id,'name',c.name,'',' placeholder="Name"')+'</td><td>'+inp('contacts',c.id,'org',c.org)+'</td><td>'+inp('contacts',c.id,'role',c.role,'',' placeholder="e.g. Tacos"')+'</td>';
    h += '<td><select data-rg="'+c.id+'" aria-label="Group"'+ro()+'>'+(gid ? '' : '<option value="">Pick a group</option>')+groups.map(g => '<option value="'+esc(g.id)+'"'+(g.id===gid?' selected':'')+'>'+esc(g.name)+'</option>').join('')+'</select></td>';
    h += '<td style="min-width:90px">'+inp('contacts',c.id,'booth',c.booth,'',' placeholder="e.g. F12"')+'</td><td>'+inp('contacts',c.id,'email',c.email,'email')+'</td><td>'+inp('contacts',c.id,'phone',c.phone,'tel')+'</td>';
    h += '<td style="min-width:90px">'+inp('contacts',c.id,'fee',c.fee,'number',' min="0" step="0.01" placeholder="$"')+'</td><td><label class="toggle"><input type="checkbox" data-edit="contacts|'+c.id+'|feePaid"'+(c.feePaid?' checked':'')+ro()+'> Paid</label></td>';
    h += '<td><label class="toggle"><input type="checkbox" data-edit="contacts|'+c.id+'|remind"'+(c.remind!==false?' checked':'')+ro()+'> On</label></td>';
    h += '<td class="hint" style="white-space:nowrap">'+(c.sentAt ? '<span class="pill good">Sent '+fmtD(new Date(c.sentAt).toISOString().slice(0,10))+'</span>' : c.email ? 'Not sent' : 'No email')+'</td>';
    h += '<td style="white-space:nowrap"><button class="btn small ghost" data-act="send" data-id="'+c.id+'">Send page</button><button class="btn small ghost" data-act="toTeam" data-id="'+c.id+'" title="Move to Team & staff"'+ro()+'>Move to team</button><button class="iconbtn del" data-act="del" data-list="contacts" data-id="'+c.id+'" aria-label="Remove from the list"'+ro()+'>✕</button></td></tr>';
  });
  if(!rows.length) h += '<tr><td colspan="12" class="muted" style="padding:16px">'+(list.length ? 'Nobody in this group yet.' : 'No group lists yet. Import a Jotform or Excel export, or add people one at a time.')+'</td></tr>';
  h += '</tbody></table></div><div class="row"><button class="btn small" data-act="addRoster"'+ro()+'>+ Add one person</button><button class="btn small" data-act="importList"'+ro()+'>Import a list</button>'+(store.email ? '<span class="hint">To email a group its itinerary, open Share pages and pick the group.</span>' : '')+'</div>';
  return h;
}

/* ---------- Edit groups ---------- */
function groupUse(ev, gid){
  const items = ev.setup.concat(ev.program.items).filter(x => (x.audiences||[]).includes(gid)).length;
  const people = ev.contacts.filter(c => (c.audiences||[]).includes(gid)).length;
  const booths = ev.layout.pieces.filter(p => p.group === gid).length;
  return {items, people, booths, total: items + people + booths};
}
MODALS.editGroups = (ev, M) => {
  let h = '<div><h2 id="mt">Groups for this event</h2><p class="hint">Each group gets its own itinerary page and private link. Rename a group any time; its link keeps working. Tick “Vendor” for groups that bring their own gear or pay a vendor fee.</p></div>';
  h += '<div class="tablewrap"><table><thead><tr><th>Name</th><th>Vendor</th><th>Used by</th><th></th></tr></thead><tbody>';
  h += '<tr><td><input value="Internal" disabled aria-label="Internal"></td><td></td><td class="hint">The planning team. Always there.</td><td></td></tr>';
  groupsOf(ev).forEach(g => {
    const u = groupUse(ev, g.id);
    h += '<tr><td><input data-grp="'+esc(g.id)+'|name" value="'+esc(g.name)+'" aria-label="Group name"'+ro()+'></td><td><label class="toggle"><input type="checkbox" data-grp="'+esc(g.id)+'|vendor"'+(g.vendor?' checked':'')+ro()+'> Vendor</label></td><td class="hint">'+(u.total ? [u.people && u.people+' people', u.items && u.items+' schedule lines', u.booths && u.booths+' booths'].filter(Boolean).join(', ') : 'Not used yet')+'</td>';
    h += '<td>'+(M.confirm === g.id ? '<button class="btn small danger" data-act="delGroup" data-id="'+esc(g.id)+'">Remove it'+(u.total?' (untags '+u.total+')':'')+'</button>' : '<button class="iconbtn del" data-act="askDelGroup" data-id="'+esc(g.id)+'" aria-label="Remove group"'+ro()+'>✕</button>')+'</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="row" style="align-items:flex-end"><div class="field" style="flex:1;min-width:200px"><label for="grpNew">Add a group</label><input id="grpNew" placeholder="e.g. Food trucks, Sponsors, Kids area"'+ro()+'></div><label class="toggle" style="padding-bottom:8px"><input type="checkbox" id="grpNewVendor" checked> Vendor</label><button class="btn" data-act="addGroup"'+ro()+'>Add</button></div>';
  h += '<p class="hint">Planning a festival or market? <button class="btn small ghost" data-act="festivalGroups"'+ro()+' style="display:inline-flex">Add festival groups</button> adds Food vendors, Retail, Info booths and Artisans.</p>';
  h += '<p class="hint" style="color:var(--crit)">'+esc(M.err||'')+'</p><div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="closeModal">Done</button></div>';
  return h;
};

/* ---------- Import a list ---------- */
const IMPORT_FIELDS = [
  ['name', 'Name', /^(full\s*)?name$|contact\s*name|your\s*name|^name\b|vendor\s*contact|primary\s*contact/i],
  ['first', 'First name', /first/i],
  ['last', 'Last name', /last\s*name|surname|family/i],
  ['org', 'Business / organization', /business|company|organi[sz]ation|vendor\s*name|brand|shop|booth\s*name|truck\s*name/i],
  ['email', 'Email', /e-?mail/i],
  ['phone', 'Phone', /phone|mobile|cell/i],
  ['group', 'Group (vendor type)', /vendor\s*type|type\s*of|category|^type$|group|kind/i],
  ['booth', 'Booth or spot', /^booth$|booth\s*(no|number|#|location)|space|spot|stall|location/i],
  ['fee', 'Fee amount', /fee|amount|price|total|cost/i],
  ['paid', 'Paid?', /paid|payment\s*status/i],
  ['notes', 'What they sell or do', /selling|sell|products|menu|offer|description|what|note|comment|details/i]
];
function guessColumns(headers){
  const map = {}, used = new Set();
  IMPORT_FIELDS.forEach(([k, , re]) => {
    const i = headers.findIndex((h, j) => !used.has(j) && re.test(h) && !(k === 'name' && /business|company|first|last|truck|booth|file|event/i.test(h)) && !(k === 'fee' && /paid|status/i.test(h)) && !(k === 'notes' && /e-?mail/i.test(h)));
    map[k] = i; if(i >= 0) used.add(i);
  });
  if(map.name >= 0 && (map.first >= 0 || map.last >= 0)){ map.first = -1; map.last = -1; }
  return map;
}
/* A simple, careful CSV reader: quotes, commas or semicolons or tabs, Windows line endings. */
function parseCSV(text){
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a,b) => b[1]-a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(q){ if(ch === '"'){ if(text[i+1] === '"'){ cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if(ch === '"' && cell === '') q = true;
    else if(ch === delim){ row.push(cell); cell = ''; }
    else if(ch === '\n' || ch === '\r'){ if(ch === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if(cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}
function loadScript(src){
  return new Promise((ok, bad) => { if(document.querySelector('script[src="'+src+'"]')) return ok(); const s = document.createElement('script'); s.src = src; s.onload = () => ok(); s.onerror = () => bad(new Error('Couldn’t load the Excel reader. Save the file as CSV and try again.')); document.head.appendChild(s); });
}
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
async function readTable(file){
  if(/\.(xlsx|xls|xlsm)$/i.test(file.name)){
    if(typeof XLSX === 'undefined') await loadScript(XLSX_SRC);
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, {header:1, raw:false, defval:''}).map(r => r.map(c => String(c == null ? '' : c))).filter(r => r.some(c => c.trim() !== ''));
  }
  return parseCSV(await file.text());
}
function guessGroup(ev, value, fallback){
  const v = norm(value); if(!v) return fallback;
  const gs = groupsOf(ev);
  const exact = gs.find(g => norm(g.name) === v || norm(g.name).replace(/s$/, '') === v.replace(/s$/, ''));
  if(exact) return exact.id;
  const by = (re, wants) => re.test(v) ? (gs.find(g => wants.test(norm(g.name))) || {}).id : null;
  return by(/food|truck|cater|drink|beverage|coffee|dessert|bake|snack|eat/, /food|truck|cater/) || by(/retail|merch|clothing|apparel|shop|sell/, /retail|merch/) ||
         by(/info|nonprofit|non profit|resource|community|outreach|sponsor/, /info|nonprofit|sponsor/) || by(/art|craft|handmade|jewel|maker/, /artisan|art|craft|maker/) ||
         by(/music|band|perform|dj|artist/, /perform|artist|talent/) || gs.find(g => v.includes(norm(g.name)) || norm(g.name).includes(v))?.id || 'new';
}
function importRecords(ev, M){
  const m = M.map, cell = (r, k) => m[k] >= 0 ? String(r[m[k]] == null ? '' : r[m[k]]).trim() : '';
  return M.rows.map(r => {
    const name = cell(r, 'name') || [cell(r, 'first'), cell(r, 'last')].filter(Boolean).join(' ');
    const raw = cell(r, 'group'), gid = m.group >= 0 && raw ? (M.gmap[raw] || M.def) : M.def;
    const fee = cell(r, 'fee').replace(/[^0-9.\-]/g, '');
    return {name, org:cell(r, 'org'), email:cell(r, 'email').toLowerCase(), phone:cell(r, 'phone'), booth:cell(r, 'booth'), notes:cell(r, 'notes'),
            fee: fee && !isNaN(Number(fee)) ? Number(fee) : '', paid: /^(y|yes|paid|true|1|x|✓)/i.test(cell(r, 'paid')), raw, gid};
  });
}
function importPlan(ev, M){
  const recs = importRecords(ev, M), key = x => x.email || (norm(x.name)+'|'+norm(x.org));
  const existing = new Map(); ev.contacts.forEach(c => { const k = key({email:(c.email||'').toLowerCase(), name:c.name, org:c.org}); if(k !== '|') existing.set(k, c); });
  const seen = new Set(), plan = {add:[], update:[], team:[], skip:0, dup:0};
  recs.forEach(x => {
    if(!x.name && !x.org){ plan.skip++; return; }
    const k = key(x); if(seen.has(k)){ plan.dup++; return; } seen.add(k);
    const c = existing.get(k);
    if(c && !c.roster) plan.team.push(x); else if(c) plan.update.push([c, x]); else plan.add.push(x);
  });
  return plan;
}
MODALS.importList = (ev, M) => {
  let h = '<div><h2 id="mt">Import a list</h2><p class="hint">Use the export from Jotform, Google Forms, Eventbrite or any spreadsheet. In Jotform: open the form’s Submissions, then Download all → CSV or Excel. MagicShow reads the first sheet; the first row should be the column names.</p></div>';
  h += '<div class="field"><label for="ilFile">File (.csv or .xlsx)</label><input id="ilFile" type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'+(M.busy?' disabled':'')+'>'+(M.fileName ? '<span class="hint">'+esc(M.fileName)+': '+M.rows.length+' rows</span>' : '')+'</div>';
  if(M.err) h += '<div class="banner">'+esc(M.err)+'</div>';
  if(M.busy) h += '<p class="muted">Reading the file…</p>';
  if(M.headers && M.rows.length){
    const colOpts = sel => '<option value="-1">Not in this file</option>'+M.headers.map((x, i) => '<option value="'+i+'"'+(i === sel ? ' selected' : '')+'>'+esc(x || 'Column '+(i+1))+'</option>').join('');
    h += '<div><span class="eyebrow">Which column is which</span><p class="hint">MagicShow guessed from the column names. Change any that are wrong. A name or a business name is needed for each row.</p></div><div class="facts two mapgrid">';
    IMPORT_FIELDS.forEach(([k, label]) => { if((k === 'first' || k === 'last') && M.map.name >= 0 && M.map.first < 0 && M.map.last < 0 && !M.showSplit) return; h += '<div class="field"><label for="ilm-'+k+'">'+label+'</label><select id="ilm-'+k+'" data-ilmap="'+k+'">'+colOpts(M.map[k])+'</select></div>'; });
    h += '</div>';
    if(M.map.name >= 0 && M.map.first < 0 && M.map.last < 0 && !M.showSplit) h += '<p class="hint">First and last name in separate columns? <button class="btn small ghost" data-act="ilSplit" style="display:inline-flex">Pick them</button></p>';
    const groups = groupsOf(ev);
    h += '<div class="field"><label for="ilDef">'+(M.map.group >= 0 ? 'Group for rows with no type' : 'Put everyone in this group')+'</label><select id="ilDef">'+groups.map(g => '<option value="'+esc(g.id)+'"'+(g.id === M.def ? ' selected' : '')+'>'+esc(g.name)+'</option>').join('')+'</select></div>';
    if(M.map.group >= 0){
      const vals = [...new Set(M.rows.map(r => String(r[M.map.group] == null ? '' : r[M.map.group]).trim()).filter(Boolean))].slice(0, 30);
      h += '<div><span class="eyebrow">Match each type to a group</span></div><div class="tablewrap"><table><thead><tr><th>In the file</th><th>Rows</th><th>Goes to</th></tr></thead><tbody>';
      vals.forEach(v => {
        const n = M.rows.filter(r => String(r[M.map.group]||'').trim() === v).length, cur = M.gmap[v] || 'new';
        h += '<tr><td>'+esc(v)+'</td><td class="mono">'+n+'</td><td><select data-ilg="'+esc(v)+'">'+groups.map(g => '<option value="'+esc(g.id)+'"'+(g.id === cur ? ' selected' : '')+'>'+esc(g.name)+'</option>').join('')+'<option value="new"'+(cur === 'new' ? ' selected' : '')+'>New group: '+esc(v.slice(0, 40))+'</option></select></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    const P = importPlan(ev, M), recs = P.add.concat(P.update.map(x => x[1]));
    h += '<div><span class="eyebrow">Preview</span></div><div class="tablewrap"><table><thead><tr><th>Name</th><th>Business</th><th>Email</th><th>Group</th><th>Booth</th><th>Fee</th></tr></thead><tbody>';
    recs.slice(0, 5).forEach(x => h += '<tr><td>'+esc(x.name)+'</td><td>'+esc(x.org)+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.gid === 'new' ? x.raw+' (new)' : gname(ev, x.gid))+'</td><td>'+esc(x.booth)+'</td><td>'+(x.fee !== '' ? usd(x.fee) : '')+(x.paid ? ' <span class="pill good">Paid</span>' : '')+'</td></tr>');
    if(!recs.length) h += '<tr><td colspan="6" class="muted" style="padding:12px">Nothing to import with these columns. Pick the name or business column.</td></tr>';
    h += '</tbody></table></div>';
    h += '<p class="hint"><b>'+P.add.length+' new</b>'+(P.update.length ? ' · '+P.update.length+' already on the list (their blanks are filled in, nothing is erased)' : '')+(P.team.length ? ' · '+P.team.length+' already in Team & staff (left as they are)' : '')+(P.dup ? ' · '+P.dup+' repeated in the file (imported once)' : '')+(P.skip ? ' · '+P.skip+' with no name (skipped)' : '')+'.</p>';
  }
  h += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doImportList"'+(M.headers && M.rows.length && !S.readOnly ? '' : ' disabled')+'>Import</button></div>';
  return h;
};
WIDE_MODALS.add('importList');

/* ---------- Email a group ---------- */
MODALS.emailGroup = (ev, M) => {
  const all = groupMembers(ev, M.group), withEmail = all.filter(c => c.email && c.email.includes('@')), unsent = withEmail.filter(c => !c.sentAt);
  const to = M.only === 'all' ? withEmail : unsent, name = gname(ev, M.group);
  let h = '<div><h2 id="mt">Email the '+esc(name)+' itinerary</h2><p class="hint">Each person gets their own email with your note, the event’s date and place, and the private link to the '+esc(name)+' page. The page always shows the latest plan, so there’s no need to re-send after small changes. Replies come back to '+esc((S.user && S.user.email) || 'you')+'.</p></div>';
  if(M.result){
    const r = M.result;
    h += '<div class="banner info">Sent to '+r.sent+' '+(r.sent===1?'person':'people')+'.'+(r.skipped ? ' '+r.skipped+' had no email address.' : '')+(r.failed ? ' '+r.failed+' couldn’t be sent; try them again later.' : '')+'</div>';
    return h + '<div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="closeModal">Done</button></div>';
  }
  h += '<fieldset class="opts" style="border:0;padding:0;margin:0"><label class="opt"><input type="radio" name="egOnly" value="unsent"'+(M.only !== 'all' ? ' checked' : '')+'><span><b>Only people who haven’t had it ('+unsent.length+')</b><br><span class="hint">Use this after adding new people to the list.</span></span></label><label class="opt"><input type="radio" name="egOnly" value="all"'+(M.only === 'all' ? ' checked' : '')+'><span><b>Everyone with an email ('+withEmail.length+')</b><br><span class="hint">For a real change, like a new load-in time.</span></span></label></fieldset>';
  if(all.length > withEmail.length) h += '<p class="hint">'+(all.length - withEmail.length)+' in this group have no email: '+esc(all.filter(c => !(c.email && c.email.includes('@'))).slice(0, 6).map(c => c.org || c.name || 'Unnamed').join(', '))+(all.length - withEmail.length > 6 ? '…' : '')+'.</p>';
  h += '<div class="field"><label for="egNote">Your note (optional)</label><textarea id="egNote" rows="4" placeholder="e.g. Load-in starts at 7 AM from the Oak Street side. Your booth number is on the page.">'+esc(M.note||'')+'</textarea></div>';
  if(M.err) h += '<div class="banner">'+esc(M.err)+'</div>';
  h += '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" data-act="doEmailGroup"'+(to.length && !M.busy ? '' : ' disabled')+'>'+(M.busy ? 'Sending…' : 'Send to '+to.length)+'</button></div>';
  return h;
};

function markSent(ev, r){ (r.sentIds||[]).forEach(id => { const c = ev.contacts.find(x => x.id === id); if(c) c.sentAt = r.at; }); }

Object.assign(actions, {
  pplView(el){ S.pplView = el.dataset.v; render(); },
  rosterGroup(el){ S.rosterGroup = el.dataset.v; render(); },
  viewList(el){ S.tab = 'people'; S.pplView = 'lists'; S.rosterGroup = el.dataset.aud || ''; S.drawer = null; render(); window.scrollTo(0,0); },
  addRoster(){
    const ev = curEv(), g = S.rosterGroup || (groupsOf(ev).find(x => x.vendor) || groupsOf(ev)[0]).id;
    const c = {id:uid(), role:'', name:'', org:'', phone:'', email:'', audiences:[g], showPhone:false, invoiceUrl:'', remind:true, team:false, roster:true, booth:'', fee:'', feePaid:false};
    ev.contacts.push(c); touch(ev); focusNew('[data-edit="contacts|'+c.id+'|name"]');
  },
  toTeam(el){ const ev = curEv(), c = ev.contacts.find(x => x.id === el.dataset.id); if(!c) return; c.roster = false; touch(ev); toast((c.name||c.org||'They')+' moved to Team & staff.'); },
  /* groups */
  editGroups(){ S.modal = {type:'editGroups'}; render(); },
  askDelGroup(el){ S.modal.confirm = el.dataset.id; render(); },
  delGroup(el){
    const ev = curEv(), id = el.dataset.id; if(groupsOf(ev).length <= 1){ S.modal.err = 'Keep at least one group.'; render(); return; }
    ev.groups = groupsOf(ev).filter(g => g.id !== id);
    ev.setup.concat(ev.program.items, ev.contacts).forEach(x => { x.audiences = (x.audiences||[]).filter(a => a !== id); });
    ev.contacts.forEach(c => { if(c.roster && !(c.audiences||[]).length) c.audiences = [ev.groups[0].id]; });
    ev.layout.pieces.forEach(p => { if(p.group === id) p.group = ''; });
    if(S.shareAud === id) S.shareAud = ev.groups[0].id;
    S.modal.confirm = null; touch(ev);
  },
  addGroup(){
    const ev = curEv(), t = $('#grpNew'), name = t && t.value.trim(), M = S.modal; if(!name){ if(t) t.focus(); return; }
    if(norm(name) === 'internal' || groupsOf(ev).some(g => norm(g.name) === norm(name))){ M.err = 'There’s already a group called '+name+'.'; render(); return; }
    ev.groups = groupsOf(ev).concat({id:'g-'+uid().slice(0, 6), name:name.slice(0, 60), vendor:!!($('#grpNewVendor')||{}).checked});
    M.err = ''; touch(ev); focusNew('#grpNew');
  },
  festivalGroups(){
    const ev = curEv(), have = groupsOf(ev); let n = 0;
    const list = have.slice();
    FESTIVAL_GROUPS.forEach(g => { if(!list.some(x => x.id === g.id || norm(x.name) === norm(g.name))){ list.push(clone(g)); n++; } });
    ev.groups = list; touch(ev); toast(n ? 'Added '+n+' festival group'+(n>1?'s':'')+'.' : 'This event already has the festival groups.');
  },
  /* import */
  importList(el){
    const ev = curEv(), gs = groupsOf(ev);
    const def = (el && el.dataset && el.dataset.aud && gs.some(g => g.id === el.dataset.aud)) ? el.dataset.aud : (S.rosterGroup || (gs.find(g => g.vendor) || gs[0]).id);
    S.modal = {type:'importList', def, gmap:{}, map:{}, rows:[], headers:null};
    render();
  },
  ilSplit(){ S.modal.showSplit = true; render(); },
  doImportList(){
    const ev = curEv(), M = S.modal; if(!M || !M.rows.length) return;
    const newIds = {};
    Object.entries(M.gmap).forEach(([v, g]) => { if(g === 'new' && M.map.group >= 0 && M.rows.some(r => String(r[M.map.group]||'').trim() === v)){
      const ex = groupsOf(ev).find(x => norm(x.name) === norm(v));
      if(ex) newIds[v] = ex.id; else { const id = 'g-'+uid().slice(0, 6); ev.groups = groupsOf(ev).concat({id, name:v.slice(0, 60), vendor:!!(groupsOf(ev).find(x => x.id === M.def)||{}).vendor}); newIds[v] = id; }
    }});
    const gidOf = x => x.gid === 'new' ? (newIds[x.raw] || M.def) : x.gid;
    const P = importPlan(ev, M), groupsUsed = new Set();
    P.add.forEach(x => { const g = gidOf(x); groupsUsed.add(g); ev.contacts.push({id:uid(), role:x.notes.slice(0, 200), name:x.name, org:x.org, phone:x.phone, email:x.email, audiences:[g], showPhone:false, invoiceUrl:'', remind:true, team:false, roster:true, booth:x.booth, fee:x.fee, feePaid:x.paid}); });
    P.update.forEach(([c, x]) => { ['name','org','phone','email','booth'].forEach(k => { if(!c[k] && x[k]) c[k] = x[k]; }); if(!c.role && x.notes) c.role = x.notes.slice(0, 200); if(c.fee === '' && x.fee !== '') c.fee = x.fee; if(x.paid) c.feePaid = true; const g = gidOf(x); if(!(c.audiences||[]).includes(g)) c.audiences = [g]; groupsUsed.add(g); });
    S.modal = null; S.tab = 'people'; S.pplView = 'lists'; S.rosterGroup = groupsUsed.size === 1 ? [...groupsUsed][0] : '';
    touch(ev);
    toast('Imported '+P.add.length+' '+(P.add.length===1?'person':'people')+(groupsUsed.size > 1 ? ' into '+groupsUsed.size+' groups' : groupsUsed.size ? ' into '+gname(ev, [...groupsUsed][0]) : '')+'.'+(P.update.length ? ' Updated '+P.update.length+' already on the list.' : '')+(P.skip ? ' Skipped '+P.skip+' rows with no name.' : ''));
    if(typeof askRating === 'function') askRating('import-list', 'importing that list');
  },
  /* email */
  emailGroup(el){ S.modal = {type:'emailGroup', group: el.dataset.aud || S.shareAud, only:'unsent', note:''}; render(); },
  async doEmailGroup(){
    const ev = curEv(), M = S.modal; if(!M || M.busy) return;
    M.only = (document.querySelector('input[name="egOnly"]:checked')||{}).value || 'unsent'; M.note = ($('#egNote')||{}).value || '';
    M.busy = true; M.err = ''; render();
    try { await saveNow(ev); const r = await store.sendItinerary(ev, {group:M.group, only:M.only, note:M.note}); markSent(ev, r); M.result = r; M.busy = false; render(); if(r.sent && typeof askRating === 'function') askRating('email-group', 'emailing that group'); }
    catch(e){ M.busy = false; M.err = e.message || 'Couldn’t send. Try again.'; render(); }
  },
  async emailOne(el){
    const ev = curEv(), c = ev.contacts.find(x => x.id === el.dataset.id); if(!c) return;
    el.disabled = true; el.textContent = 'Sending…';
    try { await saveNow(ev); const r = await store.sendItinerary(ev, {group:el.dataset.aud, contactIds:[c.id]}); markSent(ev, r); S.modal = null; render(); toast(r.sent ? 'Emailed '+(c.name||c.org)+' their '+gname(ev, el.dataset.aud)+' itinerary.' : 'Couldn’t email '+(c.name||c.org)+'. Check their email address.'); }
    catch(e){ el.disabled = false; el.textContent = 'Email it to them'; toast(e.message || 'Couldn’t send. Try again.'); }
  }
});

/* typing and picking inside the group pop-ups and tables */
document.addEventListener('change', async e => {
  const el = e.target; if(!el.dataset) return;
  const ev = curEv(); if(!ev) return;
  if(el.dataset.grp && !S.readOnly){
    const [id, k] = el.dataset.grp.split('|'), g = groupsOf(ev).find(x => x.id === id); if(!g) return;
    if(k === 'vendor') g.vendor = el.checked;
    else { const v = el.value.trim(); if(!v || norm(v) === 'internal' || groupsOf(ev).some(x => x !== g && norm(x.name) === norm(v))){ if(S.modal) S.modal.err = v ? 'There’s already a group called '+v+'.' : 'A group needs a name.'; render(); return; } g.name = v.slice(0, 60); if(S.modal) S.modal.err = ''; }
    ev.groups = groupsOf(ev).slice(); touch(ev); return;
  }
  if(el.dataset.rg && !S.readOnly){ const c = ev.contacts.find(x => x.id === el.dataset.rg); if(c && el.value){ c.audiences = [el.value]; touch(ev); } return; }
  if(el.id === 'ilFile' && S.modal && S.modal.type === 'importList'){
    const f = el.files && el.files[0], M = S.modal; if(!f) return;
    Object.assign(M, {busy:true, err:'', fileName:f.name}); render();
    try {
      const t = await readTable(f);
      if(t.length < 2) throw new Error('That file has no rows under the column names.');
      M.headers = t[0].map(x => String(x).trim()); M.rows = t.slice(1, 2001); M.map = guessColumns(M.headers); M.gmap = {};
      if(M.map.group >= 0) [...new Set(M.rows.map(r => String(r[M.map.group]||'').trim()).filter(Boolean))].forEach(v => M.gmap[v] = guessGroup(ev, v, M.def));
      if(t.length > 2001) M.err = 'Only the first 2,000 rows are read.';
    } catch(x){ M.headers = null; M.rows = []; M.err = x.message || 'Couldn’t read that file. Save it as CSV and try again.'; }
    M.busy = false; render(); return;
  }
  if(el.dataset.ilmap && S.modal){ const M = S.modal; M.map[el.dataset.ilmap] = Number(el.value); if(el.dataset.ilmap === 'group' && M.map.group >= 0){ M.gmap = {}; [...new Set(M.rows.map(r => String(r[M.map.group]||'').trim()).filter(Boolean))].forEach(v => M.gmap[v] = guessGroup(ev, v, M.def)); } render(); return; }
  if(el.id === 'ilDef' && S.modal){ S.modal.def = el.value; render(); return; }
  if(el.dataset.ilg && S.modal){ S.modal.gmap[el.dataset.ilg] = el.value; render(); return; }
});
document.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'grpNew'){ e.preventDefault(); actions.addGroup(); } });
