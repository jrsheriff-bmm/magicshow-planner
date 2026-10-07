/* ==========================================================================
   budget.js — the Budget tab: costs, income, payments, invoices.

   Each budget line is {kind:'cost'|'income', cat, item, payee, est, actual,
   paid, due, status, files}. "Projected" means the actual amount if one is
   entered, otherwise the estimate. Everything else is calculated from that.
   ========================================================================== */

/* All the totals the Budget tab, checks, reports and exports use. */
function budgetSummary(ev){
  const proj = b => hasAmt(b.actual) ? amt(b.actual) : amt(b.est);
  const costs = ev.budget.filter(b => b.kind === 'cost'), income = ev.budget.filter(b => b.kind === 'income');
  const cap = amt(ev.budgetTotal);
  const projCost = costs.reduce((a,b) => a + proj(b), 0);
  const estCost = costs.reduce((a,b) => a + amt(b.est), 0);
  const paid = costs.reduce((a,b) => a + amt(b.paid), 0);
  const committed = costs.filter(b => b.status !== 'estimated').reduce((a,b) => a + proj(b), 0);
  const owed = costs.filter(b => b.status === 'committed' || b.status === 'invoiced').reduce((a,b) => a + Math.max(0, proj(b) - amt(b.paid)), 0);
  // Ticket income: use real "Tickets" lines if they have amounts; otherwise project target × advance price.
  const ticketLines = income.filter(b => b.cat === 'Tickets' && (hasAmt(b.est) || hasAmt(b.actual)));
  const ticketsProjected = Number(ev.target) > 0 && Number(ev.priceAdv) > 0 ? Number(ev.target) * Number(ev.priceAdv) : 0;
  const useTicketProjection = !ticketLines.length && ticketsProjected > 0;
  const otherIncome = income.filter(b => b.cat !== 'Tickets').reduce((a,b) => a + proj(b), 0);
  const ticketIncome = useTicketProjection ? ticketsProjected : ticketLines.reduce((a,b) => a + proj(b), 0);
  const projIncome = otherIncome + ticketIncome;
  const received = income.filter(b => b.status === 'received').reduce((a,b) => a + amt(hasAmt(b.actual) ? b.actual : b.est), 0);
  const byCat = COST_CATS.concat([...new Set(costs.map(b => b.cat))].filter(c => !COST_CATS.includes(c))).map(cat => {
    const ls = costs.filter(b => b.cat === cat);
    const both = ls.filter(b => hasAmt(b.est) && hasAmt(b.actual));
    return {cat, lines:ls.length, proj:ls.reduce((a,b) => a + proj(b), 0), est:both.reduce((a,b) => a + amt(b.est), 0), actual:both.reduce((a,b) => a + amt(b.actual), 0)};
  }).filter(c => c.lines);
  const overCats = byCat.filter(c => c.actual > c.est && c.est > 0);
  const price = Number(ev.priceAdv);
  const breakEven = price > 0 && projCost > 0 ? Math.max(0, Math.ceil((projCost - otherIncome) / price)) : null;
  return {cap, projCost, estCost, paid, committed, owed, projIncome, received, otherIncome, ticketIncome, ticketsProjected, useTicketProjection,
    net: projIncome - projCost, left: cap - projCost, byCat, overCats, breakEven};
}

/* Plain-language places the budget could be trimmed or needs attention. */
function saveTips(ev, B){
  const tips = [];
  if(B.cap && B.projCost > B.cap) tips.push({level:'crit', text:'You’re '+usd(B.projCost - B.cap)+' over budget. The biggest lines below are the first places to look.'});
  B.overCats.forEach(c => tips.push({level:'warn', text:c.cat+' came in '+usd(c.actual - c.est)+' over estimate ('+usd(c.actual)+' vs '+usd(c.est)+'). Worth a check before anything else is committed.'}));
  const costs = ev.budget.filter(b => b.kind === 'cost' && (hasAmt(b.est) || hasAmt(b.actual)));
  const big = costs.map(b => ({b, v: hasAmt(b.actual) ? amt(b.actual) : amt(b.est)})).sort((a,b) => b.v - a.v).slice(0,3);
  if(big.length && B.projCost > 0) tips.push({level:'info', text:'Largest costs: '+big.map(x => (x.b.item||x.b.cat)+' '+usd(x.v)+' ('+Math.round(x.v/B.projCost*100)+'%)').join(', ')+'. Negotiating these moves the total most.'});
  const est = ev.budget.filter(b => b.kind === 'cost' && b.status === 'estimated' && hasAmt(b.est));
  if(est.length) tips.push({level:'info', text:est.length+' line'+(est.length>1?'s are':' is')+' still only an estimate. Get quotes and mark them Committed so the total is real.'});
  if(B.breakEven != null && Number(ev.target) > 0 && B.breakEven > Number(ev.target)) tips.push({level:'warn', text:'You need '+B.breakEven+' tickets at '+usd(ev.priceAdv)+' to break even, but your target is '+ev.target+'. Raise prices, add sponsors, or cut costs.'});
  if(B.breakEven != null && Number(ev.capacity) > 0 && B.breakEven > Number(ev.capacity)) tips.push({level:'crit', text:'Break-even ('+B.breakEven+' tickets) is above venue capacity ('+ev.capacity+'). This event can’t pay for itself on tickets alone.'});
  const unpaidPast = ev.budget.filter(b => b.kind === 'cost' && b.status !== 'paid' && isYMD(b.due) && b.due < todayYMD());
  if(unpaidPast.length) tips.push({level:'crit', text:unpaidPast.length+' payment'+(unpaidPast.length>1?'s are':' is')+' past due: '+unpaidPast.map(b => b.item||b.cat).join(', ')+'.'});
  return tips;
}

function budgetHTML(ev){
  const B = budgetSummary(ev);
  const pct = B.cap ? Math.round(B.projCost / B.cap * 100) : null;
  const tile = (label, val, sub, color) => '<div class="stat"><span>'+label+'</span><b class="mono"'+(color?' style="color:'+color+'"':'')+'>'+val+'</b><span>'+(sub||'')+'</span></div>';
  let h = '<div class="stats">';
  h += '<div class="stat"><span>Budget</span><div class="row" style="gap:4px;flex-wrap:nowrap"><b class="mono">$</b><input id="f-budgetTotal" class="inline-in mono" type="number" min="0" step="1" data-edit="facts||budgetTotal" value="'+esc(ev.budgetTotal)+'" placeholder="Set a cap" style="width:100%;font-size:18px;font-weight:600"'+ro()+' aria-label="Total budget"></div><span>the most you can spend</span></div>';
  h += '<div class="stat"><span>Projected costs</span><b class="mono"'+(B.cap && B.projCost > B.cap ? ' style="color:var(--crit)"' : '')+'>'+usd(B.projCost)+'</b>'+(pct != null ? '<div class="bar"><i style="width:'+Math.min(100,pct)+'%;background:'+(pct>100?'var(--crit)':pct>90?'var(--warn)':'var(--accent)')+'"></i></div><span>'+pct+'% of budget</span>' : '<span>set a budget to track it</span>')+'</div>';
  h += tile('Paid so far', usd(B.paid), usd(B.owed)+' still owed');
  h += tile(B.cap ? 'Left to spend' : 'Projected income', B.cap ? usd(B.left) : usd(B.projIncome), B.cap ? (B.left < 0 ? 'over budget' : 'after projected costs') : (B.useTicketProjection ? 'includes projected tickets' : ''), B.cap && B.left < 0 ? 'var(--crit)' : null);
  h += tile('Projected net', usd(B.net), 'income minus costs', B.net < 0 ? 'var(--crit)' : B.net > 0 ? 'var(--good)' : null);
  h += '</div>';
  if(B.cap && B.projCost > B.cap) h += '<div class="banner" style="background:var(--crit-soft)"><b>Over budget by '+usd(B.projCost - B.cap)+'.</b> See “Where you can save” below.</div>';

  // Where the money goes (one bar per category; red part = over its estimate)
  const max = Math.max(1, ...B.byCat.map(c => c.proj));
  h += '<div class="grid2"><div class="panel"><div class="panel-head"><div><h2>Where the money goes</h2><p class="hint">Projected cost by category. Red shows spending above the estimate.</p></div></div>';
  if(!B.byCat.length || !B.projCost) h += '<p class="muted">Add amounts to your cost lines to see the breakdown.</p>';
  else {
    h += '<div class="catbars">';
    B.byCat.filter(c => c.proj > 0).sort((a,b) => b.proj - a.proj).forEach(c => {
      const over = Math.max(0, c.actual - c.est), base = c.proj - over;
      h += '<div class="catbar" title="'+esc(c.cat+': '+usd(c.proj)+(over?' ('+usd(over)+' over estimate)':''))+'"><span class="cb-l">'+esc(c.cat)+'</span><span class="cb-t"><i style="width:'+(base/max*100).toFixed(1)+'%"></i>'+(over?'<i class="over" style="width:'+(over/max*100).toFixed(1)+'%"></i>':'')+'</span><span class="cb-v mono">'+usd(c.proj)+'</span></div>';
    });
    h += '</div>';
  }
  if(B.breakEven != null) h += '<p class="hint" style="margin-top:4px"><b>Break-even:</b> '+B.breakEven+' tickets at '+usd(ev.priceAdv)+(Number(ev.target)?' (target '+ev.target+')':'')+', after '+usd(B.otherIncome)+' in other income.</p>';
  h += '</div><div class="panel"><div class="panel-head"><div><h2>Where you can save</h2><p class="hint">Updated as you enter amounts.</p></div></div><div class="checks">';
  const tips = saveTips(ev, B);
  if(!tips.length) h += '<p class="muted">Nothing to flag. Enter estimates and actual costs to get suggestions.</p>';
  tips.forEach(t => h += '<div class="check '+(t.level==='crit'?'critical':t.level==='warn'?'warning':'info')+'"><span class="sev"></span><div><p>'+esc(t.text)+'</p></div><span></span></div>');
  h += '</div></div></div>';

  // Costs table
  const costs = ev.budget.filter(b => b.kind === 'cost');
  h += '<div class="panel"><div class="panel-head"><div><h2>Costs</h2><p class="hint">Everything you pay for. Attach the invoice to each line so everything stays in one place. Payments with a due date go on the calendar and in reminders. Download Excel gives the whole budget as a spreadsheet: summary, costs and income, with totals.</p></div><div class="row"><button class="btn small" data-act="budgetXlsx">Download Excel</button><button class="btn small" data-act="budgetCsv">CSV</button>'+saveBtn('budget')+'<button class="btn small" data-act="addFrom" data-section="budget"'+ro()+'>Add from templates</button><button class="btn primary small" data-act="addBud" data-kind="cost"'+ro()+'>+ Add cost</button></div></div>';
  h += '<div class="tablewrap"><table class="bud" style="min-width:1350px"><thead><tr><th></th><th>Category</th><th style="width:18%">Item</th><th>Paid to</th><th>Estimated</th><th>Actual</th><th>Paid</th><th>Due</th><th>Status</th><th>Invoice</th><th>Approval</th><th></th></tr></thead><tbody data-reorder="budget">';
  costs.forEach(b => {
    const late = b.status !== 'paid' && isYMD(b.due) && b.due < todayYMD();
    const over = hasAmt(b.actual) && hasAmt(b.est) && amt(b.actual) > amt(b.est);
    h += '<tr data-row="'+b.id+'" class="'+(b.status==='paid'?'done':'')+(late?' late':'')+'">'+gripCell('budget',b.id)+'<td>'+sel('budget',b.id,'cat',b.cat,COST_CATS.includes(b.cat)?COST_CATS:COST_CATS.concat([b.cat]))+'</td><td>'+inp('budget',b.id,'item',b.item,'',' class="wide" style="min-width:180px" placeholder="What is it?"')+'</td>';
    h += '<td>'+inp('budget',b.id,'payee',b.payee,'',' list="people-dl" placeholder="Who?"')+'</td>';
    h += '<td>'+moneyIn(b,'est')+'</td><td>'+moneyIn(b,'actual',over?' style="color:var(--crit);font-weight:600" title="Over estimate"':'')+'</td><td>'+moneyIn(b,'paid')+'</td>';
    h += '<td>'+inp('budget',b.id,'due',b.due,'date')+(late?'<span class="pill crit">Late</span>':'')+'</td><td>'+sel('budget',b.id,'status',b.status,COST_STATUS,'status '+b.status)+'</td>';
    h += '<td>'+filesCell(b)+'</td><td>'+approvalCell(ev,'budget',b.id,(b.item||b.cat)+(hasAmt(b.actual)||hasAmt(b.est)?' ('+usd(hasAmt(b.actual)?b.actual:b.est)+')':''))+'</td>';
    h += '<td><button class="iconbtn del" data-act="del" data-list="budget" data-id="'+b.id+'" aria-label="Delete line"'+ro()+'>✕</button></td></tr>';
  });
  if(!costs.length) h += '<tr><td colspan="12" class="muted" style="padding:16px">No costs yet. Add one, or pull starter lines from a template.</td></tr>';
  else h += '<tr class="phase-row"><td colspan="4">Total</td><td class="mono">'+usd(B.estCost)+'</td><td class="mono" colspan="1">'+usd(B.projCost)+' <span class="hint">projected</span></td><td class="mono">'+usd(B.paid)+'</td><td colspan="5"></td></tr>';
  h += '</tbody></table></div></div>';

  // Income table
  const inc = ev.budget.filter(b => b.kind === 'income');
  h += '<div class="panel"><div class="panel-head"><div><h2>Income</h2><p class="hint">Tickets, sponsors, grants, vendor fees. If you don’t enter ticket amounts, the app projects target × advance price'+(B.ticketsProjected?' ('+ev.target+' × '+usd(ev.priceAdv)+' = '+usd(B.ticketsProjected)+')':'')+'.</p></div><button class="btn primary small" data-act="addBud" data-kind="income"'+ro()+'>+ Add income</button></div>';
  h += '<div class="tablewrap"><table style="min-width:910px"><thead><tr><th></th><th>Source</th><th style="width:30%">Item</th><th>Expected</th><th>Received</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody data-reorder="budget">';
  if(B.useTicketProjection) h += '<tr><td></td><td class="hint" style="padding-left:10px">Tickets</td><td class="hint">Projected: '+ev.target+' tickets × '+usd(ev.priceAdv)+'</td><td class="mono" style="padding-left:10px">'+usd(B.ticketsProjected)+'</td><td></td><td><span class="pill">Automatic</span></td><td class="hint">Add a Tickets line to override</td><td></td></tr>';
  inc.forEach(b => {
    h += '<tr data-row="'+b.id+'" class="'+(b.status==='received'?'done':'')+'">'+gripCell('budget',b.id)+'<td>'+sel('budget',b.id,'cat',b.cat,INCOME_CATS.includes(b.cat)?INCOME_CATS:INCOME_CATS.concat([b.cat]))+'</td><td>'+inp('budget',b.id,'item',b.item,'',' class="wide" placeholder="What is it?"')+'</td><td>'+moneyIn(b,'est')+'</td><td>'+moneyIn(b,'actual')+'</td><td>'+sel('budget',b.id,'status',b.status,INCOME_STATUS,'status '+(b.status==='received'?'approved':b.status==='confirmed'?'submitted':'needed'))+'</td><td>'+inp('budget',b.id,'notes',b.notes)+'</td><td><button class="iconbtn del" data-act="del" data-list="budget" data-id="'+b.id+'" aria-label="Delete line"'+ro()+'>✕</button></td></tr>';
  });
  if(!inc.length && !B.useTicketProjection) h += '<tr><td colspan="8" class="muted" style="padding:16px">No income yet.</td></tr>';
  h += '</tbody></table></div></div>';

  // Invoice repository
  const files = ev.budget.flatMap(b => (b.files||[]).map(f => ({f, b})));
  h += '<div class="panel"><div class="panel-head"><div><h2>Invoices and receipts</h2><p class="hint">Every file attached to a budget line, in one list, so you can see what’s paid and what’s still open.</p></div></div>';
  if(!files.length) h += '<p class="muted">No invoices attached yet. Use ⤒ Upload on a cost line.</p>';
  else {
    h += '<div class="tablewrap"><table style="min-width:720px"><thead><tr><th>File</th><th>For</th><th>Paid to</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>';
    files.forEach(({f,b}) => h += '<tr><td style="padding-left:10px"><a href="'+esc(blobUrl(f.id))+'" target="_blank" rel="noopener">'+esc(f.name)+'</a></td><td>'+esc(b.item||b.cat)+'</td><td>'+esc(b.payee||'—')+'</td><td class="mono">'+usd(hasAmt(b.actual)?b.actual:b.est)+'</td><td><span class="pill '+(b.status==='paid'?'good':'warn')+'">'+esc(statusLabel(COST_STATUS,b.status))+'</span></td><td><button class="iconbtn" data-act="dlBudFile" data-line="'+b.id+'" data-id="'+f.id+'" aria-label="Download">⤓</button></td></tr>');
    h += '</tbody></table></div>';
  }
  h += '</div>'+peopleDatalist(ev);
  return h;
}
function moneyIn(b, key, extra){ return '<div class="row" style="gap:2px;flex-wrap:nowrap"><span class="hint">$</span>'+inp('budget',b.id,key,b[key],'number',' min="0" step="0.01" style="width:96px"'+(extra||''))+'</div>'; }
function filesCell(b){
  let h = '<div class="files">';
  (b.files||[]).forEach(f => h += '<div class="file"><a href="'+esc(blobUrl(f.id))+'" target="_blank" rel="noopener" title="'+esc(f.name)+'">'+esc(f.name)+'</a><button class="iconbtn del" data-act="rmBudFile" data-line="'+b.id+'" data-id="'+f.id+'" aria-label="Remove file"'+ro()+'>✕</button></div>');
  return h + '<label class="btn small ghost" style="align-self:flex-start">⤒ Upload<input type="file" data-bupload="'+b.id+'" hidden'+ro()+' accept=".pdf,image/*,.txt,.csv"></label></div>';
}

TAB_VIEWS.budget = budgetHTML;
Object.assign(actions, {
  addBud(el){ const ev = curEv(); const k = el.dataset.kind; ev.budget.push(budgetLine(k, k === 'income' ? 'Other' : 'Other', '')); touch(ev); },
  rmBudFile(el){ const ev = curEv(), b = ev.budget.find(x => x.id === el.dataset.line); if(!b) return; b.files = b.files.filter(f => f.id !== el.dataset.id); touch(ev); },
  dlBudFile(el){ const ev = curEv(), b = ev.budget.find(x => x.id === el.dataset.line); const f = b && b.files.find(x => x.id === el.dataset.id); if(f) downloadAsset(f); }
});
document.addEventListener('change', async e => {
  const el = e.target; if(!el.dataset || !el.dataset.bupload || S.readOnly) return;
  const ev = curEv(); const b = ev && ev.budget.find(x => x.id === el.dataset.bupload); if(!b) return;
  const f = await uploadFile(el.files && el.files[0]);
  if(f){ b.files.push(f); if(b.status === 'estimated' || b.status === 'committed') b.status = 'invoiced'; touch(ev); toast('Attached '+f.name+'.'); }
});
