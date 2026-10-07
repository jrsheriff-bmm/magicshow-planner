/* ==========================================================================
   exports.js — [final] files people open outside the app.

   1. Budget as a spreadsheet: a real Excel file (.xlsx) with three sheets
      (Summary, Costs, Income) and working totals, or one plain CSV file.
   2. The Layout drawn into PDFs: the room to scale, and the uploaded floor plan
      with numbered pins. Used by "Download layout PDF" and by the full master
      event plan (right after the Overview).

   Nothing here needs the server or an extra library. The Excel file is built
   by hand below: an .xlsx is a zip of small text files, so there's a tiny zip
   writer (zipStore) and a tiny sheet writer (xlsxBook).
   ========================================================================== */

/* ---------- a tiny zip writer (no compression; fine for small text files) ---------- */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for(let n=0;n<256;n++){ let c = n; for(let k=0;k<8;k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes){ let c = 0xFFFFFFFF; for(let i=0;i<bytes.length;i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files){
  // files: [{name:'folder/file.xml', text:'...'}]. Returns the zip as a Uint8Array.
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  files.forEach(f => {
    const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    parts.push(new Uint8Array(head.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true); cd.setUint16(14, date, true); cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((a,b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = parts.concat(central, [new Uint8Array(end.buffer)]);
  const out = new Uint8Array(all.reduce((a,b) => a + b.length, 0)); let p = 0;
  all.forEach(b => { out.set(b, p); p += b.length; });
  return out;
}

/* ---------- a tiny Excel writer ----------
   A sheet is {name, widths:[18,30,...], freeze:1, rows:[[cell, cell, ...], ...]}.
   A cell is plain text, a number, or {v:value, s:'style', f:'FORMULA'}.
   Styles: head, money, moneyTotal, date, title, muted, pct, bold, boldTotal, wrap.
   Dates are written as {v:'2026-11-14', s:'date'} and become real Excel dates. */
const XL_STYLE = {head:1, money:2, moneyTotal:3, date:4, title:5, muted:6, pct:7, bold:8, boldTotal:9, wrap:10};
function xlEsc(s){ return String(s == null ? '' : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function xlCol(i){ let s = ''; i++; while(i > 0){ const m = (i-1) % 26; s = String.fromCharCode(65+m) + s; i = Math.floor((i-1)/26); } return s; }
function xlDate(ymd){ return Math.round(toUTC(ymd) / 864e5) + 25569; }   // days since Dec 30, 1899, which is how Excel counts dates
function xlsxSheet(sh){
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">';
  if(sh.freeze) x += '<pane ySplit="'+sh.freeze+'" topLeftCell="A'+(sh.freeze+1)+'" activePane="bottomLeft" state="frozen"/>';
  x += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
  if(sh.widths) x += '<cols>'+sh.widths.map((w,i) => '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>';
  x += '<sheetData>';
  sh.rows.forEach((row, r) => {
    x += '<row r="'+(r+1)+'">';
    row.forEach((cell, c) => {
      if(cell == null || cell === '') return;
      const o = (typeof cell === 'object') ? cell : {v:cell}, ref = xlCol(c)+(r+1), s = o.s ? ' s="'+XL_STYLE[o.s]+'"' : '';
      if(o.v == null || o.v === ''){ if(o.f) x += '<c r="'+ref+'"'+s+'><f>'+xlEsc(o.f)+'</f></c>'; else if(o.s) x += '<c r="'+ref+'"'+s+'/>'; return; }
      if(o.s === 'date' && isYMD(o.v)) x += '<c r="'+ref+'"'+s+'><v>'+xlDate(o.v)+'</v></c>';
      else if(typeof o.v === 'number' && isFinite(o.v)) x += '<c r="'+ref+'"'+s+'>'+(o.f ? '<f>'+xlEsc(o.f)+'</f>' : '')+'<v>'+o.v+'</v></c>';
      else x += '<c r="'+ref+'"'+s+' t="inlineStr"><is><t xml:space="preserve">'+xlEsc(o.v)+'</t></is></c>';
    });
    x += '</row>';
  });
  return x + '</sheetData></worksheet>';
}
function xlsxBook(sheets){
  const ns = 'http://schemas.openxmlformats.org/', pk = ns+'package/2006/', od = ns+'officeDocument/2006/relationships', ml = ns+'spreadsheetml/2006/main', head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const styles = head+'<styleSheet xmlns="'+ml+'"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="mmm d, yyyy"/></numFmts>'
    + '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6E6880"/><name val="Calibri"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECE9F3"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF847E98"/></top><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>'
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>'
    + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const files = [
    {name:'[Content_Types].xml', text:head+'<Types xmlns="'+pk+'content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i) => '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'},
    {name:'_rels/.rels', text:head+'<Relationships xmlns="'+pk+'relationships"><Relationship Id="rId1" Type="'+od+'/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml', text:head+'<workbook xmlns="'+ml+'" xmlns:r="'+od+'"><sheets>'+sheets.map((s,i) => '<sheet name="'+xlEsc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><calcPr fullCalcOnLoad="1"/></workbook>'},
    {name:'xl/_rels/workbook.xml.rels', text:head+'<Relationships xmlns="'+pk+'relationships">'+sheets.map((s,i) => '<Relationship Id="rId'+(i+1)+'" Type="'+od+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="'+od+'/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml', text:styles}
  ].concat(sheets.map((s,i) => ({name:'xl/worksheets/sheet'+(i+1)+'.xml', text:xlsxSheet(s)})));
  return zipStore(files);
}

/* ---------- the budget, laid out for a spreadsheet ---------- */
function budgetRows(ev){
  const B = budgetSummary(ev), proj = b => hasAmt(b.actual) ? amt(b.actual) : amt(b.est);
  const n = v => hasAmt(v) ? amt(v) : '';
  const costs = ev.budget.filter(b => b.kind === 'cost').map(b => {
    const owes = b.status === 'committed' || b.status === 'invoiced';
    const ap = approvalFor(ev, 'budget', b.id);
    return {cat:b.cat, item:b.item, payee:b.payee||'', est:n(b.est), actual:n(b.actual), proj:hasAmt(b.est)||hasAmt(b.actual) ? proj(b) : '', paid:n(b.paid),
      owed:owes ? Math.max(0, proj(b) - amt(b.paid)) : '', due:isYMD(b.due) ? b.due : '', status:statusLabel(COST_STATUS, b.status),
      files:(b.files||[]).map(f => f.name).join('; '), approval:ap ? statusLabel(APPROVAL_STATUS, ap.status)+(ap.approver ? ' ('+ap.approver+')' : '') : '', notes:b.notes||''};
  });
  const income = ev.budget.filter(b => b.kind === 'income').map(b => ({cat:b.cat, item:b.item, est:n(b.est), actual:n(b.actual), proj:hasAmt(b.est)||hasAmt(b.actual) ? proj(b) : '', status:statusLabel(INCOME_STATUS, b.status), notes:b.notes||''}));
  if(B.useTicketProjection) income.unshift({cat:'Tickets', item:'Projected: '+ev.target+' tickets × '+usd(ev.priceAdv), est:B.ticketsProjected, actual:'', proj:B.ticketsProjected, status:'Automatic', notes:'Target headcount × advance price. Add a Tickets line in the app to replace it.'});
  return {B, costs, income};
}
function budgetWorkbook(ev){
  const {B, costs, income} = budgetRows(ev), M = v => ({v, s:'money'}), H = v => ({v, s:'head'});
  const cN = costs.length, iN = income.length, cTot = cN + 2, iTot = iN + 2;   // the row each sheet's totals sit on
  const sum = (col, n, v) => ({v, s:'moneyTotal', f:'SUM('+col+'2:'+col+(n+1)+')'});
  const costSheet = {name:'Costs', freeze:1, widths:[22,34,24,13,13,13,13,13,14,13,30,24,30],
    rows:[['Category','Item','Paid to','Estimated','Actual','Projected','Paid','Still owed','Due','Status','Invoice files','Approval','Notes'].map(H)]
      .concat(costs.map(c => [c.cat, c.item, c.payee, M(c.est), M(c.actual), M(c.proj), M(c.paid), M(c.owed), {v:c.due, s:'date'}, c.status, c.files, c.approval, c.notes]))
      .concat(cN ? [[{v:'Total', s:'boldTotal'}, {s:'boldTotal'}, {s:'boldTotal'}, sum('D',cN,B.estCost), sum('E',cN,costs.reduce((a,c) => a + amt(c.actual), 0)), sum('F',cN,B.projCost), sum('G',cN,B.paid), sum('H',cN,B.owed)]] : [['No costs yet.']])};
  const incSheet = {name:'Income', freeze:1, widths:[20,40,13,13,13,14,44],
    rows:[['Source','Item','Expected','Received','Projected','Status','Notes'].map(H)]
      .concat(income.map(c => [c.cat, c.item, M(c.est), M(c.actual), M(c.proj), c.status, c.notes]))
      .concat(iN ? [[{v:'Total', s:'boldTotal'}, {s:'boldTotal'}, sum('C',iN,income.reduce((a,c) => a + amt(c.est), 0)), sum('D',iN,income.reduce((a,c) => a + amt(c.actual), 0)), sum('E',iN,B.projIncome)]] : [['No income yet.']])};
  // Summary numbers point at the other two sheets, so they stay right if someone edits the file.
  const ref = (ok, f, v) => ok ? {v, s:'money', f} : {v, s:'money'};
  const sumRows = [
    [{v:ev.name || 'Untitled event', s:'title'}],
    [{v:'Budget · '+fmtLong(ev.date)+(ev.venue ? ' · '+ev.venue : ''), s:'muted'}],
    [{v:'Downloaded '+fmtLong(todayYMD())+' from MagicShow', s:'muted'}],
    [],
    [H('Summary'), H('Amount'), H('')]
  ];
  const at = {};   // which row each number lands on, so later rows can refer to it
  const kv = (key, label, cell, note) => { at[key] = sumRows.length + 1; sumRows.push([label, cell, note ? {v:note, s:'muted'} : '']); };
  kv('cap', 'Budget (the most you can spend)', B.cap ? M(B.cap) : 'Not set');
  kv('cost', 'Projected costs', ref(cN, 'Costs!F'+cTot, B.projCost), 'Actual where entered, otherwise the estimate');
  kv('paid', 'Paid so far', ref(cN, 'Costs!G'+cTot, B.paid));
  kv('owed', 'Still owed', ref(cN, 'Costs!H'+cTot, B.owed), 'Committed or invoiced, and not fully paid');
  if(B.cap) kv('left', 'Left to spend', {v:B.left, s:'money', f:'B'+at.cap+'-B'+at.cost});
  kv('inc', 'Projected income', ref(iN, 'Income!E'+iTot, B.projIncome), B.useTicketProjection ? 'Includes projected ticket sales' : '');
  kv('rec', 'Received so far', M(B.received));
  kv('net', 'Projected net', {v:B.net, s:'money', f:'B'+at.inc+'-B'+at.cost}, 'Income minus costs');
  if(B.breakEven != null) kv('be', 'Break-even', B.breakEven, 'tickets at '+usd(ev.priceAdv)+' each'+(Number(ev.target) ? ' (target '+ev.target+')' : ''));
  sumRows.push([], [H('Costs by category'), H('Projected'), H('Share of costs')]);
  B.byCat.filter(c => c.proj > 0).sort((a,b) => b.proj - a.proj).forEach(c => sumRows.push([c.cat, M(c.proj), {v:B.projCost ? c.proj / B.projCost : 0, s:'pct'}]));
  if(!B.byCat.some(c => c.proj > 0)) sumRows.push([{v:'No amounts entered yet.', s:'muted'}]);
  return [{name:'Summary', widths:[36,16,44], rows:sumRows}, costSheet, incSheet];
}
function budgetCSV(ev){
  const {B, costs, income} = budgetRows(ev), L = [];
  L.push(['Event', ev.name||''], ['Date', fmtLong(ev.date)], ['Venue', ev.venue||''], ['Downloaded', fmtLong(todayYMD())], []);
  L.push(['SUMMARY'], ['Budget', B.cap || ''], ['Projected costs', B.projCost], ['Paid so far', B.paid], ['Still owed', B.owed]);
  if(B.cap) L.push(['Left to spend', B.left]);
  L.push(['Projected income', B.projIncome], ['Received so far', B.received], ['Projected net', B.net]);
  if(B.breakEven != null) L.push(['Break-even tickets', B.breakEven]);
  L.push([], ['COSTS'], ['Category','Item','Paid to','Estimated','Actual','Projected','Paid','Still owed','Due','Status','Invoice files','Approval','Notes']);
  costs.forEach(c => L.push([c.cat, c.item, c.payee, c.est, c.actual, c.proj, c.paid, c.owed, c.due, c.status, c.files, c.approval, c.notes]));
  L.push(['Total','','', B.estCost, costs.reduce((a,c) => a + amt(c.actual), 0), B.projCost, B.paid, B.owed]);
  L.push([], ['INCOME'], ['Source','Item','Expected','Received','Projected','Status','Notes']);
  income.forEach(c => L.push([c.cat, c.item, c.est, c.actual, c.proj, c.status, c.notes]));
  L.push(['Total','', income.reduce((a,c) => a + amt(c.est), 0), income.reduce((a,c) => a + amt(c.actual), 0), B.projIncome]);
  // "﻿" at the start tells Excel the file is UTF-8, so names with accents show correctly.
  return '﻿' + L.map(r => r.map(csvCell).join(',')).join('\r\n');
}
Object.assign(actions, {
  async budgetXlsx(){ const ev = curEv(); await saveFile(slug(ev.name)+'-budget.xlsx', xlsxBook(budgetWorkbook(ev)).buffer); },
  async budgetCsv(){ const ev = curEv(); await saveFile(slug(ev.name)+'-budget.csv', budgetCSV(ev)); }
});

/* ---------- the layout, drawn into a PDF ----------
   exportDoc() (core.js) puts {figure:'room'} or {figure:'plan'} items into a document.
   toPDF() calls figureHeight() to make room on the page and drawFigure() to draw. */
const PDF_INK = [28,24,39], PDF_GREY = [132,126,152];
const PIN_COLORS = [[90,59,194],[15,124,140],[180,83,26],[138,47,110],[63,107,31]];
function hasRoom(ev){ return ev.layout.pieces.length > 0; }
function hasPlan(ev){ return !!ev.layout.image; }

/* The sections a document gets for the layout: the drawings, each followed by a list. */
function layoutSections(ev){
  const L = ev.layout, out = [];
  if(hasRoom(ev)){
    const W = Number(L.room.w)||60, D = Number(L.room.d)||80, tally = new Map();
    L.pieces.forEach(p => { const def = LAYOUT_PIECES[p.kind] || LAYOUT_PIECES.label, k = def.label + (p.label && !def.text ? ': '+p.label : def.text ? ': '+(p.label||'') : ''); tally.set(k, (tally.get(k)||0) + 1); });
    const stages = L.pieces.filter(p => p.kind === 'stage').length;
    out.push({h:'Room layout', items:[
      {figure:'room', ev, wordNote:'The room drawing is in the PDF version of this file.'},
      {p:'Room: '+W+' ft wide by '+D+' ft deep ('+(W*D).toLocaleString('en-US')+' sq ft). Grid lines are every 5 ft.'+(stages ? ' Stage: '+stages+' module'+(stages>1?'s':'')+', '+(stages*24)+' sq ft of deck.' : '')},
      {table:{head:['Piece','How many'], widths:[.75,.25], rows:[...tally.entries()].map(([k,v]) => [k, String(v)])}}
    ]});
  }
  if(hasPlan(ev)){
    const who = p => { const c = p.contactId && ev.contacts.find(x => x.id === p.contactId); return c ? (c.name||'To confirm')+(c.role ? ' ('+c.role+')' : '') : ''; };
    out.push({h:'Floor plan', items:[
      {figure:'plan', ev, wordNote:'The floor plan with its numbered pins is in the PDF version of this file.'}
    ].concat(L.pins.length ? [{table:{head:['#','Label','Kind','Who’s here','Notes'], widths:[.07,.25,.18,.22,.28], rows:L.pins.map((p,i) => [String(i+1), p.label||p.kind||'Pin', p.kind||'', who(p), p.notes||''])}}] : [{p:'No pins on the floor plan yet.'}])});
  }
  return out;
}

/* Floor plan images have to be loaded before the PDF is drawn (drawing can't wait).
   Each is turned into a JPEG no wider than 1800 px so the PDF stays small. */
async function loadPlanImage(id){
  const res = await fetch(blobUrl(id), {credentials:'same-origin'});
  if(!res.ok) throw new Error('not found');
  const url = URL.createObjectURL(await res.blob());
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth*k)); cv.height = Math.max(1, Math.round(img.naturalHeight*k));
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    return {data:cv.toDataURL('image/jpeg', 0.86), w:cv.width, h:cv.height};
  } finally { URL.revokeObjectURL(url); }
}
async function prepFigures(doc){
  for(const s of doc.sections) for(const it of s.items){
    if(it.figure === 'plan' && !it.img){ try { it.img = await loadPlanImage(it.ev.layout.image); } catch(e){ it.missing = true; } }
  }
}

/* How tall a figure will be on the page (points), given the width available. */
function figureSize(it, maxW, maxH){
  if(it.figure === 'room'){ const W = Number(it.ev.layout.room.w)||60, D = Number(it.ev.layout.room.d)||80, k = Math.min(maxW/W, maxH/D); return {w:W*k, h:D*k, k}; }
  if(it.img){ const k = Math.min(maxW/it.img.w, maxH/it.img.h); return {w:it.img.w*k, h:it.img.h*k, k}; }
  return {w:maxW, h:0, k:1};
}
function figureHeight(it, maxW, maxH){ const z = figureSize(it, maxW, maxH); return it.figure === 'room' ? z.h + 26 : z.h ? z.h + 8 : 18; }

function drawFigure(pdf, it, x, y, maxW, maxH){
  const z = figureSize(it, maxW, maxH), ox = x + (maxW - z.w)/2;
  if(it.figure === 'room') return drawRoom(pdf, it.ev, ox, y, z);
  if(!it.img){ pdf.setFont('helvetica','italic'); pdf.setFontSize(10); pdf.setTextColor.apply(pdf, PDF_GREY); pdf.text('The floor plan image couldn’t be added to this file. Open the Layout tab to see it.'.replace(/’/g,"'"), x, y+11); return 18; }
  pdf.addImage(it.img.data, 'JPEG', ox, y, z.w, z.h);
  pdf.setDrawColor(210,206,222); pdf.setLineWidth(.6); pdf.rect(ox, y, z.w, z.h, 'S');
  it.ev.layout.pins.forEach((p,i) => {
    const cx = ox + z.w*(Number(p.x)||0)/100, cy = y + z.h*(Number(p.y)||0)/100, col = PIN_COLORS[Math.max(0, PIN_KINDS.indexOf(p.kind)) % PIN_COLORS.length], n = String(i+1);
    pdf.setFillColor(255,255,255); pdf.circle(cx, cy, 8.4, 'F');
    pdf.setFillColor.apply(pdf, col); pdf.circle(cx, cy, 7, 'F');
    pdf.setFont('helvetica','bold'); pdf.setFontSize(n.length > 1 ? 7 : 8); pdf.setTextColor(255,255,255); pdf.text(n, cx, cy + 2.7, {align:'center'});
  });
  return z.h + 8;
}
function drawRoom(pdf, ev, ox, y, z){
  const L = ev.layout, W = Number(L.room.w)||60, D = Number(L.room.d)||80, k = z.k;
  pdf.setFillColor(250,250,252); pdf.rect(ox, y, z.w, z.h, 'F');
  for(let gx=5; gx<W; gx+=5){ pdf.setDrawColor(gx%10===0?214:230, gx%10===0?210:227, gx%10===0?226:238); pdf.setLineWidth(gx%10===0?.5:.3); pdf.line(ox+gx*k, y, ox+gx*k, y+z.h); }
  for(let gy=5; gy<D; gy+=5){ pdf.setDrawColor(gy%10===0?214:230, gy%10===0?210:227, gy%10===0?226:238); pdf.setLineWidth(gy%10===0?.5:.3); pdf.line(ox, y+gy*k, ox+z.w, y+gy*k); }
  const base = Math.max(1.1, Math.min(W,D)/45) * k;
  const zOrder = p => p.kind === 'zone' ? 0 : p.kind === 'label' ? 2 : 1;
  L.pieces.slice().sort((a,b) => zOrder(a) - zOrder(b)).forEach(p => {
    const def = LAYOUT_PIECES[p.kind] || LAYOUT_PIECES.label, rot = (p.rot||0) % 180 !== 0;
    const w = (rot ? p.h : p.w) * k, h = (rot ? p.w : p.h) * k, px = ox + p.x*k, py = y + p.y*k;
    let ink = PDF_INK;
    pdf.setLineWidth(.6); pdf.setDrawColor.apply(pdf, PDF_GREY);
    if(def.round){ pdf.setFillColor(236,231,251); pdf.ellipse(px+w/2, py+h/2, w/2, h/2, 'FD'); }
    else if(def.text){ /* words only */ }
    else if(def.zone){ pdf.setFillColor(251,239,217); pdf.rect(px, py, w, h, 'F'); pdf.setDrawColor(164,95,0); pdf.setLineDashPattern([3,2], 0); pdf.rect(px, py, w, h, 'S'); pdf.setLineDashPattern([], 0); }
    else if(p.kind === 'door'){ pdf.setFillColor(30,127,85); pdf.rect(px, py, w, h, 'F'); ink = [255,255,255]; }
    else if(p.kind === 'stage' || p.kind === 'bar' || p.kind === 'speaker'){ pdf.setFillColor.apply(pdf, p.kind === 'stage' ? [90,59,194] : p.kind === 'bar' ? [180,83,26] : [92,86,111]); pdf.setDrawColor(255,255,255); pdf.rect(px, py, w, h, 'FD'); ink = [255,255,255]; }
    else { pdf.setFillColor(255,255,255); pdf.rect(px, py, w, h, 'FD'); }
    // the label, shrunk to fit and turned sideways on tall, narrow pieces (same rule as the screen)
    const lbl = pdfSafe(p.label || def.label); if(!lbl) return;
    const vert = !def.round && !def.text && h > w*1.4, room = (vert ? h : w) - 2;
    let fs = def.text ? base*1.2 : Math.min(base, Math.max(.7*k, Math.max(w,h)/Math.max(4, lbl.length)*1.6));
    fs = Math.max(3.2, Math.min(fs, 14));
    pdf.setFont('helvetica','bold'); pdf.setFontSize(fs);
    let tw = pdf.getTextWidth(lbl);
    if(!def.text && tw > room && room > 0){ fs = Math.max(3, fs * room / tw); pdf.setFontSize(fs); tw = pdf.getTextWidth(lbl); }
    if(!def.text && (tw > room + .5 || fs*.9 > (vert ? w : h))) return;   // too small to read: the list under the drawing covers it
    pdf.setTextColor.apply(pdf, ink);
    if(vert) pdf.text(lbl, px + w/2 + fs*.35, py + h/2 + tw/2, {angle:90});
    else pdf.text(lbl, px + w/2, py + h/2 + fs*.35, {align:'center'});
  });
  pdf.setDrawColor.apply(pdf, PDF_INK); pdf.setLineWidth(1.2); pdf.rect(ox, y, z.w, z.h, 'S');
  // a 10 ft scale bar and the room size, under the drawing
  const by = y + z.h + 12, bw = 10*k;
  pdf.setLineWidth(1); pdf.line(ox, by, ox+bw, by); pdf.line(ox, by-3, ox, by+3); pdf.line(ox+bw, by-3, ox+bw, by+3);
  pdf.setFont('helvetica','normal'); pdf.setFontSize(8.5); pdf.setTextColor.apply(pdf, PDF_GREY);
  pdf.text('10 ft', ox + bw + 6, by + 3);
  pdf.text(W+' ft x '+D+' ft', ox + z.w, by + 3, {align:'right'});
  return z.h + 26;
}
