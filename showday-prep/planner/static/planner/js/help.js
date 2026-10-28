/* ==========================================================================
   help.js — [beta] plain-language help for the labels testers found confusing.

   • help('phase') puts a small "?" button next to a label. Pressing it opens a
     short explanation beside the button (HELP below holds the wording).
   • The Help button in the left menu opens the Help guide: what each part of
     MagicShow is for, in the order people usually use them.
   • gettingStartedHTML() is the "Getting started" list on the events home page.
     Each line ticks itself when the work is done, and the list can be hidden.
   ========================================================================== */
const CONTACT_TAGS = ['Staff', 'Volunteer', 'Vendor', 'Artist', 'Sponsor', 'Venue', 'Press'];

const HELP = {
  phase: ['Phase', 'A phase is the stage of planning a deadline belongs to, such as Booking, Promotion or Show week. It only groups the cards on the board and in printouts. Changing it doesn’t move the due date.'],
  hard: ['Hard deadline', 'Tick this when the date can’t move: a permit the city needs 30 days ahead, a printer’s cut-off, a venue contract. Hard deadlines are flagged in red on Checks when they get close, and the planning team is warned first.'],
  checklist: ['Checklist steps', 'Break a deadline into smaller steps. Each step can have its own due date, and the deadline’s owner gets a reminder for it 7 days before and 1 day before. The bar on the card shows how many steps are done.'],
  groups: ['Groups', 'A group is everyone who gets the same itinerary: performers, food trucks, retail booths, the venue crew. Each group has its own share page and private link. Use Edit groups to rename them or add your own. Groups marked as vendors also get the “Bring with you” list.'],
  team: ['Team', 'Tick Team for the people running the event with you. They get payment reminders and the Monday summary of what’s due that week. Everyone else only hears about their own tasks.'],
  headcount: ['Attendance', 'For free or open events where nobody counts people at the door, tick this. Capacity and headcount checks are switched off, and reports say “Not counted” instead of showing zero.'],
  fees: ['Fees kept', 'What a ticketing site or card processor keeps from each sale, for example Eventbrite’s service fee. Enter the total for the line. The budget counts what actually reaches you: the amount minus the fees.'],
  tags: ['Tags', 'Short labels for sorting your contacts, such as Staff, Vendor or Sponsor. Type them separated by commas. Use the buttons above the table to show only one tag.'],
  pieces: ['Layout pieces', 'Drag pieces into the room. Pick a group for a booth (food, retail, info) to color it by vendor type, and pick who’s in it. Use “Custom area” for anything else: type its name and set its size in feet.'],
  lists: ['Group lists', 'People who get an itinerary but aren’t on your planning team, such as 40 food vendors. They stay out of People so the team list stays short. Import them from a Jotform or Excel export, then email the group from Share pages.'],
  series: ['Series', 'Events with the same series name are shown together, in date order, with links to the one before and after. “Add next in series” copies the latest one to a new date.'],
  tabs: ['Tabs', 'Hide tabs this event doesn’t use, or add your own notes tab for anything that doesn’t fit elsewhere, like parking instructions or a vendor FAQ.'],
  reminders: ['Reminders', 'Owners get an email 7 days before a deadline and again 1 day before. If it’s still open after the date, they get one the day after and then one a week until it’s done. Each email has a “Mark done” button, so no login is needed.']
};

function help(k){
  const H = HELP[k]; if(!H) return '';
  return '<button type="button" class="help" data-act="helpPop" data-k="'+k+'" aria-label="What does '+esc(H[0])+' mean?" aria-expanded="false">?</button>';
}

/* The explanation sits in its own box outside the app, so a redraw doesn't close it. */
function closeHelpPop(){ const p = document.getElementById('helpPop'); if(p) p.remove(); document.querySelectorAll('.help[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded','false')); }
function openHelpPop(btn){
  const k = btn.dataset.k, H = HELP[k]; if(!H) return;
  const was = document.getElementById('helpPop'); const same = was && was.dataset.k === k;
  closeHelpPop(); if(same) return;
  const p = document.createElement('div'); p.id = 'helpPop'; p.className = 'helppop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', H[0]); p.dataset.k = k;
  p.innerHTML = '<b>'+esc(H[0])+'</b><p>'+esc(H[1])+'</p><button type="button" class="btn small ghost" data-close="1">Got it</button>';
  document.body.appendChild(p);
  const r = btn.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 32);
  p.style.width = w+'px';
  p.style.left = Math.max(16, Math.min(window.innerWidth - w - 16, r.left + r.width/2 - w/2)) + 'px';
  const below = r.bottom + 8, h = p.offsetHeight;
  p.style.top = (below + h > window.innerHeight - 8 && r.top - h - 8 > 8 ? r.top - h - 8 : below) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  p.querySelector('[data-close]').focus({preventScroll:true});
}
document.addEventListener('click', e => {
  const p = document.getElementById('helpPop'); if(!p) return;
  if(e.target.closest('[data-close]') && p.contains(e.target)){ closeHelpPop(); return; }
  if(!p.contains(e.target) && !e.target.closest('.help')) closeHelpPop();
});
document.addEventListener('keydown', e => { if(e.key === 'Escape' && document.getElementById('helpPop')){ e.stopImmediatePropagation(); closeHelpPop(); } }, true);
window.addEventListener('scroll', () => closeHelpPop(), {passive:true});
window.addEventListener('resize', () => closeHelpPop());

/* ---------- the Help guide ---------- */
const GUIDE = [
  ['Start an event', 'Press “+ New event”, give it a name and a show date, and pick a template. Every deadline is counted back from the show date, so if the date moves, everything moves with it.'],
  ['Deadlines and steps', 'The Deadlines tab is a board of everything that has to happen before the show. Open a card to set its owner, add checklist steps and give each step its own date. Owners get email reminders 7 days and 1 day before.'],
  ['Run of show', 'Setup times and the program, minute by minute. Tag each line with the groups that should see it, and it appears on their share page.'],
  ['People and group lists', 'People is your planning team and staff. Group lists are vendors, artists and others who only need an itinerary. Import a list from Jotform or Excel on the People tab.'],
  ['Share pages', 'One itinerary per group, always up to date. Copy the private link, or email it to everyone in the group in one go. Use Edit groups to add your own, such as Food trucks or Info booths.'],
  ['Layout', 'Draw the room to scale. Food, retail and info booths are colored by group, and you can name custom areas. MagicShow warns you when one kind of booth is bunched in one spot.'],
  ['Budget', 'Costs and income, with fees taken by ticketing sites and vendor fees paid or still owed. Download it for Excel.'],
  ['Your team', 'The Team page shows who’s in your organization. Make an invite link, or approve people who asked to join. Members can be picked as owners and their email fills in on its own.'],
  ['Testing notes', 'Press “✎ Notes” on any screen to tell us what worked, what was missing or what confused you. Tick “Send to the MagicShow team” and we’ll see it with the screen you were on.']
];
MODALS.helpGuide = () => {
  let h = '<div><h2 id="mt">Help guide</h2><p class="hint">What each part of MagicShow is for, in the order most people use them. Look for the small ? next to labels for a short explanation.</p></div><div class="guide">';
  GUIDE.forEach(([t, d], i) => h += '<div class="guide-row"><span class="mono">'+(i+1)+'</span><div><b>'+esc(t)+'</b><p class="muted">'+esc(d)+'</p></div></div>');
  h += '</div><div class="row" style="justify-content:flex-end">'+(gsHidden() ? '<button class="btn" data-act="gsShow">Show “Getting started” again</button>' : '')+'<button class="btn primary" data-act="closeModal">Close</button></div>';
  return h;
};
WIDE_MODALS.add('helpGuide');

/* ---------- getting started (events home) ---------- */
function gsHidden(){ try { return localStorage.getItem('magicshow.gs.hidden') === '1'; } catch(e){ return !!S.gsHidden; } }
function gsSetHidden(v){ S.gsHidden = v; try { if(v) localStorage.setItem('magicshow.gs.hidden', '1'); else localStorage.removeItem('magicshow.gs.hidden'); } catch(e){} }
function gettingStartedHTML(){
  if(gsHidden() || S.mode === 'loading') return '';
  const evs = Object.values(S.events);
  const steps = [
    ['Create your first event', evs.length > 0, 'newEvent'],
    ['Give a deadline an owner who has an email', evs.some(ev => ev.milestones.some(m => ownerReach(ev, m.owner).ok)), null],
    ['Add checklist steps with their own dates', evs.some(ev => ev.milestones.some(m => (m.checklist||[]).some(c => c.offset != null))), null],
    ['Set up your groups (performers, food trucks, retail…)', evs.some(ev => JSON.stringify(ev.groups) !== JSON.stringify(DEFAULT_GROUPS)), null],
    ['Import a vendor or artist list', evs.some(ev => ev.contacts.some(c => c.roster)), null],
    ['Send a group its itinerary', evs.some(ev => ev.contacts.some(c => c.sentAt)), null]
  ];
  if(S.user) steps.push(['Invite your team', (S.members||[]).length > 1, 'team']);
  const done = steps.filter(s => s[1]).length;
  if(done === steps.length) return '';
  let h = '<div class="panel gs"><div class="panel-head"><div><h2>Getting started</h2><p class="hint">'+done+' of '+steps.length+' done. Each line ticks itself when you’ve done it. Press Help in the menu for what each part is for.</p></div><div class="row"><button class="btn small" data-act="helpGuide">Help guide</button><button class="btn small ghost" data-act="gsHide">Hide this</button></div></div><ol class="gslist">';
  steps.forEach(([t, ok, act]) => h += '<li class="'+(ok?'ok':'')+'"><span class="gstick" aria-hidden="true">'+(ok?'✓':'')+'</span><span>'+esc(t)+(ok?' <span class="sr">(done)</span>':'')+'</span>'+(!ok && act ? '<button class="btn small ghost" data-act="'+act+'">Go</button>' : '')+'</li>');
  return h + '</ol></div>';
}

Object.assign(actions, {
  helpPop(el){ openHelpPop(el); },
  helpGuide(){ S.modal = {type:'helpGuide'}; render(); },
  gsHide(){ gsSetHidden(true); render(); toast('Hidden. Bring it back from Help in the menu.'); },
  gsShow(){ gsSetHidden(false); S.modal = null; S.view = 'home'; render(); window.scrollTo(0,0); }
});
