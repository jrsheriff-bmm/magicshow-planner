/* ==========================================================================
   helpers.js — small shared tools used by every other file.
   Lists (tabs, statuses, audiences), date and time math, and text safety.

   Key idea: dates like "2026-11-14" and times like "19:30" are plain text, and
   deadlines are stored as "days before show day" (offset -30 = 30 days before).
   esc() makes any text safe to put on the page (always use it on user text).
   ========================================================================== */
"use strict";
const AUD = ['Internal','Performers','Vendors','Venue','Security'];
/* [beta] Each event has its own share-page groups (ev.groups). The starting four keep their old
   names as ids, so events made before still work. "Internal" (the planning team) is always there. */
const DEFAULT_GROUPS = [{id:'Performers',name:'Performers',vendor:false},{id:'Vendors',name:'Vendors',vendor:true},{id:'Venue',name:'Venue',vendor:false},{id:'Security',name:'Security',vendor:false}];
const FESTIVAL_GROUPS = [{id:'Performers',name:'Performers',vendor:false},{id:'g-food',name:'Food vendors',vendor:true},{id:'g-retail',name:'Retail',vendor:true},{id:'g-info',name:'Info booths',vendor:true},{id:'g-artisan',name:'Artisans',vendor:true},{id:'Venue',name:'Venue',vendor:false},{id:'Security',name:'Security',vendor:false}];
function groupsOf(ev){ return ev && Array.isArray(ev.groups) && ev.groups.length ? ev.groups : DEFAULT_GROUPS; }
function audOf(ev){ return [{id:'Internal',name:'Internal'}].concat(groupsOf(ev)); }
function gname(ev, id){ if(id === 'Internal') return 'Internal'; const g = groupsOf(ev).find(x => x.id === id); return g ? g.name : id; }
function gindex(ev, id){ return groupsOf(ev).findIndex(x => x.id === id); }
/* One color per group, in order (checked for color-blind separation). CSS uses the --gN variables,
   with lighter steps in dark mode; PDFs use GROUP_RGB. Booths also carry their name and a legend,
   so color is never the only way to tell groups apart. */
const GROUP_RGB = [[42,120,214],[235,104,52],[27,175,122],[237,161,0],[232,123,164],[0,131,0],[74,58,167],[227,73,72]];
const MS_STATUS = [['todo','Not started'],['doing','In progress'],['done','Done']];
const CP_STATUS = [['needed','Needed'],['submitted','Submitted'],['approved','Approved']];
const EQ_STATUS = [['needed','Needed'],['secured','Secured'],['packed','Packed'],['loaded','Loaded in'],['returned','Returned']];
const PIN_KINDS = ['Stage','Bar','Food','Vendor','Entrance / exit','Security post','Restroom','Tickets','Smoking area','Other'];
const TABS = [['overview','Overview'],['milestones','Deadlines'],['show','Run of show'],['budget','Budget'],['equipment','Equipment'],['people','People'],['compliance','Paperwork'],['layout','Layout'],['share','Share pages'],['calendar','Calendar & reminders'],['checks','Checks'],['wrapup','Wrap-up']];
// Budget: what money goes out (costs) and comes in (income), and each line's stage.
const COST_CATS = ['Talent','Venue','Production','Food & bar','Staffing & security','Marketing & printing','Permits & insurance','Rentals','Decor','Other'];
const INCOME_CATS = ['Tickets','Sponsorship','Grants','Vendor fees','Donations','Merch','Other'];
const COST_STATUS = [['estimated','Estimated'],['committed','Committed'],['invoiced','Invoiced'],['paid','Paid']];
const INCOME_STATUS = [['expected','Expected'],['confirmed','Confirmed'],['received','Received']];
const APPROVAL_STATUS = [['pending','Awaiting approval'],['approved','Approved'],['declined','Declined']];
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOWL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2,'0');
const uid = () => Math.random().toString(36).slice(2,10);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const isYMD = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'');
const clone = o => JSON.parse(JSON.stringify(o));
function todayYMD(){ const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function toUTC(s){ const [y,m,d] = s.split('-').map(Number); return Date.UTC(y,m-1,d); }
function addDays(s,n){ const t = new Date(toUTC(s)+n*864e5); return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate()); }
function diffDays(a,b){ return Math.round((toUTC(b)-toUTC(a))/864e5); }
function fmtD(s,dow){ if(!isYMD(s)) return '—'; const t = new Date(toUTC(s)); const x = MON[t.getUTCMonth()]+' '+t.getUTCDate(); return dow ? DOW[t.getUTCDay()]+' '+x : x; }
function fmtLong(s){ if(!isYMD(s)) return 'Date not set'; const t = new Date(toUTC(s)); return DOWL[t.getUTCDay()]+', '+MONL[t.getUTCMonth()]+' '+t.getUTCDate()+', '+t.getUTCFullYear(); }
function toMin(t){ if(!/^\d{1,2}:\d{2}$/.test(t||'')) return null; const [h,m] = t.split(':').map(Number); return h*60+m; }
function fmt12(min){ if(min == null) return '—'; min = ((min%1440)+1440)%1440; let h = Math.floor(min/60); const m = min%60; const ap = h>=12?'PM':'AM'; h = h%12||12; return h+':'+pad(m)+' '+ap; }
function toHHMM(min){ min = ((min%1440)+1440)%1440; return pad(Math.floor(min/60))+':'+pad(min%60); }
function tcode(off){ off = Number(off)||0; return off === 0 ? 'Show day' : (off < 0 ? 'T−'+Math.abs(off) : 'T+'+off); }
function money(v){ const n = Number(v); return v === '' || v == null || isNaN(n) ? '—' : '$'+n; }
// Money with thousands separators: 1500 → "$1,500", 12.5 → "$12.50". Blank → "—".
function usd(v, blank){ if(v === '' || v == null || isNaN(Number(v))) return blank == null ? '—' : blank; const n = Number(v); const neg = n < 0; const a = Math.abs(n); const s = a % 1 ? a.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : a.toLocaleString('en-US'); return (neg?'−$':'$')+s; }
// A number from a money input, or 0 when blank.
function amt(v){ const n = Number(v); return v === '' || v == null || isNaN(n) ? 0 : n; }
const hasAmt = v => v !== '' && v != null && !isNaN(Number(v));
function statusLabel(list,v){ return (list.find(s => s[0] === v)||[])[1] || v; }
function slug(s){ return norm(s).replace(/ /g,'-') || 'event'; }
function trackKey(t){ return t === 'Program' ? 'Program' : String(t||'').split(' ')[0].replace(/[^A-Za-z]/g,'') === 'Program' ? 'Talent' : String(t||'').split(' ')[0].replace(/[^A-Za-z]/g,''); }
