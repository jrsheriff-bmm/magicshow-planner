/* ==========================================================================
   templates.js — the starting points for new events, and the equipment catalog.

   Each template lists deadlines as [title, days-before-show, phase#, hard?],
   setup items as [title, start, end, track#, audiences], program segments as
   [title, minutes, who, audiences], paperwork as [item, owner, days-before],
   and equipment as [item, category, qty, source-letter].
   Audience letters: I=Internal P=Performers V=Vendors N=Venue S=Security.
   Source letters: O=Owned R=Rent V=Vendor brings H=Venue provides B=Buy L=Borrow.

   To add a template, copy one block inside TEMPLATES, change the key and label,
   and edit the lists. No other file needs to change.
   ========================================================================== */
/* ---------- templates: starting points (product feature), not saved events ---------- */
const TRACKS = ['Production','Food & bar','Doors & security','Program & talent'];
const PHASES = ['Venue & permits','Production & site','Promotion','Final prep'];
const EQ_CATS = ['Audio','Stage & lighting','Front of house','Food & bar','Signage & decor','Safety','Media','Supplies'];
const EQ_SOURCES = ['Owned','Rent','Vendor brings','Venue provides','Buy','Borrow'];
const AUDMAP = {I:'Internal',P:'Performers',V:'Vendors',N:'Venue',S:'Security'};
const SRCMAP = {O:'Owned',R:'Rent',V:'Vendor brings',H:'Venue provides',B:'Buy',L:'Borrow'};
const aud = s => s.split('').map(c => AUDMAP[c]).filter(Boolean);

/* Catalog of common gear, offered as one-click suggestions on the Equipment tab */
const EQ_CATALOG = {
  'Audio':['Main speakers','Subwoofers','Stage monitors','Mixing board','Vocal mics','Wireless mics','Instrument mics','DI boxes','Mic stands','XLR cables','Speaker stands','Power strips and extension cords'],
  'Stage & lighting':['Stage modules (4×6 ft)','Rubber base padding','Stage stairs','Stage skirting','Lighting trees','LED par lights','DMX controller','Podium','Projector','Projection screen'],
  'Front of house':['Welcome table (6 ft)','Ticket scanner or phone','Cash box and change','Card reader','Hand stamp and ink','21+ wristbands','Waiver sign-off sheets','Pens and clipboards','Clicker counter','Name badges','Guest list printout'],
  'Food & bar':['Chafing dishes and Sternos','Floor protection mats','Coolers and ice','Serving tables','Compostable plates and napkins','Menu board','Trash and recycling bins'],
  'Signage & decor':['Event banner','Wayfinding signs','Easels','Table numbers','Centerpieces','Tablecloths'],
  'Safety':['First aid kit','Fire extinguisher check','Rope and stanchions','Flashlights','Two-way radios','Barricades'],
  'Media':['Camera','Tripod','Spare batteries and cards','Photo release sign'],
  'Supplies':['Gaffer tape','Zip ties','Extension cords','Tool kit','Table skirts','Paper towels']
};

const LAYOUT_PIECES = {
  stage:{label:'Stage module',w:6,h:4,sub:'4×6 ft'}, table6:{label:'6 ft table',w:6,h:2.5,sub:'6×2.5 ft'}, table8:{label:'8 ft table',w:8,h:2.5,sub:'8×2.5 ft'},
  round:{label:'Round table',w:5,h:5,sub:'5 ft',round:true}, bar:{label:'Bar',w:8,h:3,sub:'8×3 ft'}, speaker:{label:'Speaker',w:2,h:2,sub:'2×2 ft'},
  booth:{label:'Vendor booth',w:10,h:10,sub:'10×10 ft'}, chairs:{label:'Chair row',w:10,h:1.5,sub:'10 ft row'}, door:{label:'Entrance / exit',w:5,h:1,sub:'5 ft'},
  zone:{label:'Zone',w:12,h:8,sub:'Roped area',zone:true}, label:{label:'Label',w:8,h:2,sub:'Text only',text:true}
};

function buildTemplate(o){
  const ms = (o.ms||[]).map(([title,offset,ph,hard,desc]) => ({id:uid(),title,offset,phase:PHASES[(ph||4)-1],owner:'',hard:!!hard,status:'todo',desc:desc||'',checklist:[]}));
  const setup = (o.setup||[]).map(([title,start,end,tr,a]) => ({id:uid(),title,start,end,track:TRACKS[tr-1],audiences:aud(a),notes:''}));
  const items = (o.prog||[]).map(([title,dur,who,a]) => ({id:uid(),title,who:who||'',dur,audiences:aud(a||'IP'),notes:''}));
  const compliance = (o.cp||[]).map(([item,owner,offset,notes]) => ({id:uid(),item,owner:owner||'',offset,status:'needed',expires:'',notes:notes||'',files:[]}));
  const equipment = (o.eq||[]).map(([item,cat,qty,src]) => ({id:uid(),item,cat,qty:qty||1,source:SRCMAP[src]||'Owned',owner:'',status:'needed',notes:''}));
  // Budget lines: [item, category, 'c' for a cost or 'i' for income]. Amounts start blank.
  const budget = (o.bud||BUD_DEFAULT).map(([item,cat,k]) => budgetLine(k === 'i' ? 'income' : 'cost', cat, item));
  return {kind:o.kind||'organizer', doors:o.doors, end:o.end, milestones:ms, setup, program:{start:o.progStart||o.doors, items}, compliance, equipment, budget, budgetTotal:'',
    contacts:[{id:uid(),role:o.kind==='venue'?'Venue manager':'Event lead',name:'',org:'',phone:'',email:'',audiences:['Internal','Performers','Vendors','Venue','Security'],showPhone:true,invoiceUrl:'',remind:true,team:true}],
    houseRules:o.rules||[], layout:{image:'',pins:[],room:{w:o.room?o.room[0]:60,d:o.room?o.room[1]:80},pieces:[]}};
}

/* A new, empty budget line. kind is 'cost' or 'income'. */
function budgetLine(kind, cat, item){
  return {id:uid(), kind, cat:cat||(kind==='income'?'Other':'Other'), item:item||'', payee:'', payeeId:'', est:'', actual:'', paid:'', due:'', status:kind==='income'?'expected':'estimated', notes:'', files:[]};
}
const BUD_DEFAULT = [['Venue rental','Venue','c'],['Promotion','Marketing & printing','c'],['Supplies','Other','c'],['Ticket sales','Tickets','i']];
const BUD = {
  showcase:[['Venue rental','Venue','c'],['Headliner fee','Talent','c'],['Support act fee','Talent','c'],['Opener fee','Talent','c'],['Host / MC','Talent','c'],['Sound and lighting','Production','c'],['Security staff','Staffing & security','c'],['Flyers and social ads','Marketing & printing','c'],['Event insurance','Permits & insurance','c'],['Wristbands, stamps, waivers','Other','c'],['Ticket sales','Tickets','i'],['Vendor table fees','Vendor fees','i'],['Sponsorship','Sponsorship','i']],
  comedy:[['Venue rental','Venue','c'],['Headliner fee','Talent','c'],['Comic fees','Talent','c'],['Host fee','Talent','c'],['Promotion','Marketing & printing','c'],['Ticket sales','Tickets','i']],
  gallery:[['Install supplies and labels','Decor','c'],['Reception food and drink','Food & bar','c'],['Invitations and press','Marketing & printing','c'],['Artwork insurance','Permits & insurance','c'],['Art sales commission','Other','i'],['Sponsorship','Sponsorship','i']],
  openmic:[['Venue fee','Venue','c'],['Featured reader honorarium','Talent','c'],['Donations at the door','Donations','i']],
  festival:[['City permits and fees','Permits & insurance','c'],['Stage and tent rental','Rentals','c'],['Portable toilets and hand wash','Rentals','c'],['Generator','Rentals','c'],['Barricades and signage','Rentals','c'],['Performer fees','Talent','c'],['Police and security','Staffing & security','c'],['Insurance','Permits & insurance','c'],['Marketing','Marketing & printing','c'],['Vendor booth fees','Vendor fees','i'],['Sponsorships','Sponsorship','i'],['Grants','Grants','i']],
  walk:[['Route permit and police escort','Permits & insurance','c'],['Start/finish arch','Rentals','c'],['T-shirts','Other','c'],['Bibs and timing','Other','c'],['Water and snacks','Food & bar','c'],['Registration fees','Tickets','i'],['Sponsorships','Sponsorship','i'],['Donations','Donations','i']],
  gala:[['Venue','Venue','c'],['Catering','Food & bar','c'],['Bar service','Food & bar','c'],['AV and lighting','Production','c'],['Entertainment','Talent','c'],['Decor and centerpieces','Decor','c'],['Invitations and printing','Marketing & printing','c'],['Ticket sales','Tickets','i'],['Table sponsorships','Sponsorship','i'],['Auction proceeds','Donations','i'],['Paddle raise','Donations','i']],
  conference:[['Venue','Venue','c'],['Catering (coffee, lunch)','Food & bar','c'],['Speaker fees and travel','Talent','c'],['AV rental','Production','c'],['Badges and handouts','Marketing & printing','c'],['Registrations','Tickets','i'],['Sponsors','Sponsorship','i']],
  appreciation:[['Food trucks or catering','Food & bar','c'],['Tent and table rental','Rentals','c'],['Music','Talent','c'],['Signage','Marketing & printing','c'],['Department budget','Other','i']],
  wedding:[['Venue','Venue','c'],['Catering','Food & bar','c'],['Photographer / videographer','Talent','c'],['DJ or band','Talent','c'],['Flowers and decor','Decor','c'],['Attire','Other','c'],['Rentals','Rentals','c'],['Contributions','Other','i']],
  capture:[['Photographer time','Talent','c'],['Editing','Production','c'],['Parking and travel','Other','c'],['Coverage fee','Other','i']],
  interview:[['Videographer','Talent','c'],['Editing and captions','Production','c'],['Music license','Permits & insurance','c'],['Interview story fee','Other','i']],
  training:[['Printed checklists and handouts','Marketing & printing','c'],['Phone tripods and mics','Rentals','c'],['Training series fee','Other','i']],
  venue:[['House staff wages','Staffing & security','c'],['Sound engineer','Production','c'],['Promoter rental fee','Other','i'],['Bar sales','Other','i'],['Ticket share','Tickets','i']]
};

const TEMPLATES = [
 {key:'showcase',label:'Concert / music showcase',scale:'Small–medium',desc:'Bands or DJs, sound and lights, bar and food, tickets at the door.',
  doors:'19:00',end:'23:00',room:[60,90],
  ms:[['Submit venue application and rental agreement',-69,1],['Confirm liquor permit path and insurance with bar vendor',-61,1],['Ticket portal live with hold harmless waiver',-54,1],
   ['Kitchen layout and floor protection plan to venue',-45,2],['Confirm sound, lighting and staging inventory',-41,2],['Lock stage plot, security posts and set times',-41,2,true],
   ['Final flyers, promo clips and social assets',-41,3],['Launch promotion and open ticket sales',-40,3,true],['Artist spotlight posts',-30,3],['Review presales and project guest count',-33,4],
   ['Send final plan, contacts and run of show to everyone',-19,4],['Final walkthrough with venue and security',-11,4]],
  setup:[['Load-in: stage, speakers, lighting','15:00','16:30',1,'IN'],['Kitchen and bar load-in','16:00','17:30',2,'IVN'],['Stage and rigging','16:30','17:00',1,'IN'],['Sound check','17:00','18:30',4,'IP'],['Staff and security briefing','18:30','19:00',3,'IS'],['Initial load-out','23:00','23:30',1,'IN']],
  prog:[['Doors open, ambient music',60,'','IPVS'],['Welcome from the host',10,'','IP'],['Opener',45,'','IP'],['Intermission',15,'','IPV'],['Headliner',45,'','IP'],['Closing remarks',5,'','IPVS']],
  cp:[['Venue rental agreement signed','',-69],['Special event liquor license','',-61],['Hold harmless waiver in ticketing','',-54],['Temporary food establishment permit','',-14],['Event liability insurance certificate','',-30]],
  eq:[['Main speakers','Audio',2,'O'],['Subwoofers','Audio',2,'O'],['Stage monitors','Audio',3,'O'],['Mixing board','Audio',1,'O'],['Vocal mics','Audio',4,'O'],['Mic stands','Audio',4,'O'],['XLR cables','Audio',12,'O'],
   ['Stage modules (4×6 ft)','Stage & lighting',6,'O'],['Rubber base padding','Stage & lighting',1,'O'],['Lighting trees','Stage & lighting',2,'O'],['Welcome table (6 ft)','Front of house',1,'H'],['Ticket scanner or phone','Front of house',1,'O'],
   ['Hand stamp and ink','Front of house',1,'B'],['21+ wristbands','Front of house',150,'B'],['Cash box and change','Front of house',1,'O'],['Waiver sign-off sheets','Front of house',50,'B'],['First aid kit','Safety',1,'O'],['Rope and stanchions','Safety',1,'R'],['Gaffer tape','Supplies',2,'O']]},
 {key:'comedy',label:'Comedy show',scale:'Small',desc:'A host, 3–5 comics, one mic, tight timing.',doors:'19:00',end:'21:30',progStart:'19:00',room:[40,60],
  ms:[['Venue hold and agreement',-60,1],['Book host and comics',-56,1],['Ticket page live',-42,3,true],['Launch promotion',-35,3,true],['Comic headshots and bios collected',-30,3],['Confirm lineup order and set lengths',-14,4],['Send run of show and pay terms to comics',-7,4],['Walkthrough with venue',-3,4]],
  setup:[['Load-in: PA and stage light','17:00','18:00',1,'IN'],['Mic check with host','18:00','18:30',4,'IP'],['Door staff briefing','18:30','19:00',3,'IS']],
  prog:[['Doors open, music',30,'','IPVS'],['Host opens',10,'','IP'],['Comic 1',10,'','IP'],['Comic 2',12,'','IP'],['Intermission',10,'','IPV'],['Comic 3',15,'','IP'],['Headliner',25,'','IP'],['Host closes',5,'','IP']],
  cp:[['Venue agreement signed','',-60],['Performer agreements and pay terms','',-30],['Liquor coverage confirmed with venue','',-21]],
  eq:[['Vocal mics','Audio',2,'O'],['Mic stands','Audio',1,'O'],['Main speakers','Audio',2,'O'],['Mixing board','Audio',1,'O'],['Stage light','Stage & lighting',1,'O'],['Stool and water for stage','Stage & lighting',1,'H'],['Ticket scanner or phone','Front of house',1,'O'],['Hand stamp and ink','Front of house',1,'B'],['Set-time light or phone timer','Supplies',1,'O']]},
 {key:'gallery',label:'Art show / gallery opening',scale:'Small',desc:'Artists, installed work, a reception and sales.',doors:'18:00',end:'21:00',room:[50,70],
  ms:[['Confirm artists and works list',-60,1],['Artist agreements and commission terms',-45,1],['Invitations and promotion',-28,3,true],['Press release out',-21,3],['Install plan and wall labels',-21,2],['Price list final',-3,4],['Install day',-2,4,true]],
  setup:[['Install touch-ups and lighting',"14:00","16:00",1,'IN'],['Catering and bar setup','16:00','17:30',2,'IV'],['Artist arrival and photos','17:00','17:45',4,'IP'],['Door briefing','17:45','18:00',3,'IS']],
  prog:[['Doors open, viewing',60,'','IPVS'],['Welcome and artist remarks',15,'','IP'],['Viewing, music and sales',90,'','IPV'],['Last call and close',15,'','IPVS']],
  cp:[['Artist consignment agreements','',-45],['Artwork insurance','',-21],['Sales tax and payment setup','',-14]],
  eq:[['Hanging hardware and level','Signage & decor',1,'O'],['Wall labels','Signage & decor',30,'B'],['Price list printout','Front of house',10,'B'],['Pedestals','Signage & decor',4,'L'],['Track light bulbs','Stage & lighting',6,'H'],['Guest book','Front of house',1,'B'],['Card reader','Front of house',1,'O'],['Speaker for ambient music','Audio',1,'O'],['Camera','Media',1,'O']]},
 {key:'openmic',label:'Poetry reading / open mic',scale:'Small, low budget',desc:'Sign-up list, a host, a mic and a timer.',doors:'19:00',end:'21:15',room:[30,40],
  ms:[['Book venue',-30,1],['Sign-up form live',-21,3],['Promotion posts',-14,3,true],['Confirm host and featured reader',-10,4],['Print sign-up sheet',-1,4]],
  setup:[['Set up mic and lamp','18:15','18:45',1,'IN'],['Sign-up table open','18:30','19:00',3,'I']],
  prog:[['Doors and sign-up',30,'','IPV'],['Host welcome',5,'','IP'],['Readers, block 1',45,'','IP'],['Break',10,'','IPV'],['Featured reader',15,'','IP'],['Readers, block 2',30,'','IP'],['Close',5,'','IP']],
  cp:[['Venue OK and any room fee','',-30]],
  eq:[['Vocal mics','Audio',1,'O'],['Mic stands','Audio',1,'O'],['Small PA speaker','Audio',1,'O'],['Sign-up sheet and pens','Front of house',1,'B'],['Timer','Supplies',1,'O'],['Reading lamp','Stage & lighting',1,'L']]},
 {key:'festival',label:'Community festival / street fair',scale:'Large',desc:'Street closure, stage, dozens of vendors, city permits.',doors:'11:00',end:'19:00',progStart:'11:00',room:[120,300],
  ms:[['City special event permit application',-120,1,true],['Vendor applications open',-100,1],['Street closure, police and fire review',-90,1],['Vendor selection and fees',-75,1],['Stage, tent and toilet rentals booked',-60,2],
   ['Insurance certificate naming the city',-60,1],['Sponsor commitments due',-45,3],['Launch promotion',-45,3,true],['Volunteer recruitment and roles',-30,4],['Site map final',-21,2,true],['Vendor load-in schedule sent',-10,4],['Walkthrough with city',-3,4]],
  setup:[['Barricades and street closure','07:00','08:00',3,'INS'],['Tents, stage and power','08:00','10:00',1,'IN'],['Vendor load-in','08:00','10:30',2,'IVN'],['Sound check','10:00','10:45',4,'IP'],['Volunteer briefing','10:30','11:00',3,'IS']],
  prog:[['Gates open',30,'','IPVS'],['Welcome and sponsor thanks',15,'','IP'],['Act 1',45,'','IP'],['Act 2',45,'','IP'],['Community showcase',60,'','IP'],['Act 3',60,'','IP'],['Headliner',60,'','IP'],['Closing',15,'','IPVS']],
  cp:[['Special event permit','',-120],['Street closure approval','',-90],['Tent permit from fire marshal','',-30],['Temporary food licenses (all food vendors)','',-14],['Liquor license','',-45],['Insurance certificate naming the city','',-60],['Noise variance','',-30]],
  eq:[['Barricades','Safety',20,'R'],['10×10 tents','Stage & lighting',10,'R'],['Stage','Stage & lighting',1,'R'],['Main speakers','Audio',2,'O'],['Mixing board','Audio',1,'O'],['Generator','Supplies',1,'R'],['Portable toilets','Supplies',6,'R'],['Hand wash stations','Supplies',2,'R'],
   ['Trash and recycling bins','Food & bar',20,'L'],['Wayfinding signs','Signage & decor',12,'B'],['Two-way radios','Safety',8,'R'],['First aid kit','Safety',2,'O'],['Event banner','Signage & decor',2,'O']]},
 {key:'walk',label:'Charity walk / 5K',scale:'Medium–large',desc:'Route permit, registration, water stations, awards.',doors:'07:30',end:'10:30',progStart:'07:30',room:[100,150],
  ms:[['Route approval and permit',-90,1,true],['Registration live',-75,3],['Sponsors confirmed',-45,3],['T-shirt order placed',-30,2,true],['Volunteer roles assigned',-21,4],['Bibs and timing ordered',-14,2],['Course marking plan',-7,2],['Packet pickup',-1,4]],
  setup:[['Course setup and cones','06:00','07:15',1,'I'],['Registration tables','06:30','07:30',3,'IV'],['Water stations stocked','06:45','07:30',2,'IV']],
  prog:[['Check-in',30,'','IVS'],['Welcome and warm-up',15,'','IP'],['Walk / run',60,'','IVS'],['Awards and thanks',15,'','IP']],
  cp:[['Route permit','',-90],['Police escort request','',-30],['Event insurance','',-45],['Participant waivers','',-1]],
  eq:[['Start/finish arch','Stage & lighting',1,'R'],['Bibs and safety pins','Front of house',300,'B'],['Cones','Safety',50,'L'],['Water tables','Food & bar',3,'L'],['Cups','Food & bar',1000,'B'],['Course signs','Signage & decor',20,'B'],['First aid kit','Safety',2,'O'],['PA speaker','Audio',1,'O'],['T-shirts','Supplies',300,'B']]},
 {key:'gala',label:'Fundraiser gala',scale:'Medium, high budget',desc:'Seated dinner, program, auction and sponsors.',doors:'18:00',end:'22:00',room:[80,100],
  ms:[['Venue contract',-180,1,true],['Catering contract',-120,1],['Save the date',-120,3],['Sponsorship packages out',-90,3],['Invitations sent',-60,3,true],['Auction items secured',-45,2],['RSVPs close',-14,4,true],
   ['Final headcount to caterer',-7,4,true],['Seating chart',-7,4],['Run of show and scripts',-5,4],['Walkthrough and AV rehearsal',-1,4]],
  setup:[['Decor and tables','13:00','16:00',1,'IN'],['AV setup and test','14:00','16:00',1,'IN'],['Catering setup','16:00','17:30',2,'IV'],['Speaker rehearsal','17:00','17:30',4,'IP'],['Staff briefing','17:30','18:00',3,'IS']],
  prog:[['Reception and silent auction',60,'','IPVS'],['Seating and welcome',15,'','IP'],['Dinner service',45,'','IV'],['Mission speaker',20,'','IP'],['Paddle raise',20,'','IP'],['Live music and dessert',60,'','IPV'],['Thank-you and close',10,'','IPVS']],
  cp:[['Venue contract signed','',-180],['Catering contract','',-120],['Liquor license or caterer coverage','',-45],['Charitable gaming (raffle) license','',-60],['Event insurance','',-30]],
  eq:[['Podium','Stage & lighting',1,'H'],['Wireless mics','Audio',2,'R'],['Projector','Stage & lighting',1,'R'],['Projection screen','Stage & lighting',1,'R'],['Auction bid sheets','Front of house',40,'B'],['Table numbers','Signage & decor',15,'B'],['Centerpieces','Signage & decor',15,'B'],['Check-in list and card reader','Front of house',1,'O'],['Name badges','Front of house',150,'B']]},
 {key:'conference',label:'Conference / workshop',scale:'Medium',desc:'Speakers, sessions, registration and handouts.',doors:'08:30',end:'16:30',progStart:'08:30',room:[60,80],
  ms:[['Venue booked',-90,1,true],['Speakers confirmed',-60,1],['Registration live',-45,3],['Agenda final',-21,2,true],['Catering order',-14,2],['Slides due from speakers',-7,4],['Materials printed',-5,4],['AV check',-1,4]],
  setup:[['Room setup and AV','07:00','08:00',1,'IN'],['Registration desk','07:45','08:30',3,'IV'],['Coffee service set','07:45','08:30',2,'IV']],
  prog:[['Check-in and coffee',30,'','IPV'],['Welcome',15,'','IP'],['Session 1',60,'','IP'],['Break',15,'','IPV'],['Session 2',60,'','IP'],['Lunch',60,'','IPV'],['Workshop',90,'','IP'],['Break',15,'','IPV'],['Panel',45,'','IP'],['Closing',15,'','IP']],
  cp:[['Venue agreement','',-90],['Speaker agreements and releases','',-30],['Catering order confirmed','',-14]],
  eq:[['Projector','Stage & lighting',1,'H'],['Projection screen','Stage & lighting',1,'H'],['Presentation clicker','Stage & lighting',1,'O'],['Wireless mics','Audio',2,'H'],['Power strips and extension cords','Audio',6,'O'],['Name badges','Front of house',120,'B'],['Handouts','Supplies',120,'B'],['Registration laptop','Front of house',1,'O'],['Wi-Fi info sign','Signage & decor',2,'B']]},
 {key:'appreciation',label:'Employee or community appreciation event',scale:'Medium',desc:'Food trucks or catering outdoors, a rain plan, simple program.',doors:'11:00',end:'14:00',progStart:'11:00',room:[100,120],
  ms:[['Budget approved',-60,1,true],['Food trucks or caterer booked',-45,1,true],['Site plan and power needs',-21,2],['Invitations out',-21,3],['Dietary headcount',-10,4],['Rain plan decision',-2,4,true]],
  setup:[['Tents, tables and trash stations','08:30','10:00',1,'IN'],['Food trucks park and set up','09:30','10:45',2,'IVN'],['Music and signage','10:00','10:45',1,'I']],
  prog:[['Service opens',30,'','IVS'],['Welcome and thanks',10,'','IP'],['Food service and music',120,'','IV'],['Wrap',20,'','IV']],
  cp:[['Food truck licenses and insurance','',-14],['Site use approval','',-30]],
  eq:[['10×10 tents','Stage & lighting',3,'R'],['Tables','Food & bar',10,'H'],['Trash and recycling bins','Food & bar',8,'H'],['Wayfinding signs','Signage & decor',6,'B'],['PA speaker','Audio',1,'O'],['Meal tickets or vouchers','Front of house',300,'B'],['Hand sanitizer','Safety',4,'B']]},
 {key:'wedding',label:'Wedding',scale:'Medium, high budget',desc:'Ceremony, reception and a long list of vendors.',doors:'16:00',end:'23:00',progStart:'16:00',room:[70,100],
  ms:[['Venue contract',-300,1,true],['Photographer and videographer booked',-240,1],['Caterer booked',-210,1],['DJ or band booked',-200,1],['Invitations sent',-60,3,true],['RSVPs due',-30,4],['Final headcount to caterer',-14,4,true],['Timeline to all vendors',-7,4],['Rehearsal',-1,4]],
  setup:[['Vendor load-in and decor','12:00','14:30',1,'IVN'],['Hair and makeup','10:00','14:00',4,'IP'],['Photos before ceremony','14:30','15:30',4,'IP'],['Ushers briefing','15:30','16:00',3,'IS']],
  prog:[['Ceremony',30,'','IPVS'],['Cocktail hour',60,'','IPV'],['Grand entrance',10,'','IPV'],['Dinner',60,'','IV'],['Toasts',15,'','IP'],['First dance',10,'','IP'],['Dancing',150,'','IPV'],['Send-off',15,'','IPVS']],
  cp:[['Marriage license from county clerk','',-30],['Venue contract signed','',-300],['Vendor contracts collected','',-60]],
  eq:[['Ceremony arch','Signage & decor',1,'R'],['Chairs','Signage & decor',120,'H'],['Guest book','Front of house',1,'B'],['Card box','Front of house',1,'B'],['Wireless mics','Audio',2,'V'],['Main speakers','Audio',2,'V'],['Cake table','Food & bar',1,'H'],['Welcome sign','Signage & decor',1,'B']]},
 {key:'venue',kind:'venue',label:'Venue: hosting an outside promoter',scale:'Venue view',desc:'For venues. Track what each promoter owes you, house gear, house rules and night-of settlement.',doors:'20:00',end:'00:00',progStart:'20:00',room:[50,80],
  rules:['Load-in through the back door only','Promoter provides door staff for ticket scanning','No outside food or alcohol','Stage curfew 11:45 PM; house lights at midnight','All furniture moves go through the house manager'],
  ms:[['Hold confirmed on the calendar',-60,1],['Contract sent to promoter',-45,1],['Deposit received',-40,1,true],['Promoter insurance certificate received',-21,1,true],['Tech rider and stage plot approved',-10,2],['Advance call with promoter',-7,4,true],['Staff schedule posted',-5,4],['Night-of settlement',0,4]],
  setup:[['House opens for load-in','16:00','17:00',1,'INP'],['Sound check (house engineer)','17:00','19:00',4,'IP'],['Bar setup and cash counts','18:30','19:30',2,'I'],['Staff briefing','19:30','20:00',3,'IS']],
  prog:[['Doors',30,'','IPS'],['Support',40,'','IP'],['Changeover',20,'','IP'],['Headliner',75,'','IP'],['House music, last call',30,'','IS'],['Curfew and settlement',15,'','I']],
  cp:[['Signed performance contract','Promoter',-45],['Deposit','Promoter',-40],['Certificate of insurance naming the venue','Promoter',-21],['W-9 for payouts','Promoter',-14],['Tech rider','Promoter',-10]],
  eq:[['House PA','Audio',1,'H'],['House lighting rig','Stage & lighting',1,'H'],['Stage monitors','Audio',4,'H'],['Vocal mics','Audio',6,'H'],['Bar POS','Food & bar',2,'H'],['Clicker counter','Front of house',1,'H'],['Settlement sheet','Supplies',1,'H']]}
,
 // ---- Blackmagic Solutions templates (v4). "Show day" here = the shoot or the practice event.
 //      Positive days = AFTER that day (editing, review, delivery).
 {key:'capture',label:'Event coverage (content capture)',scale:'Consulting',desc:'Cover the key moments of a client’s event: brief, shot list, capture window, 4–5 photos and 1–2 clips delivered.',doors:'17:00',end:'20:00',progStart:'17:30',room:[40,40],
  ms:[['Creative brief received from client',-10,1],['Shot list agreed with client',-5,2,true],['Confirm access, parking and a contact on site',-3,4],['Photo release plan confirmed',-3,1],['Gear check: batteries charged, cards cleared',-1,4],
   ['Select the best 4–5 photos',1,4],['Edit 1–2 short clips (under 60 seconds)',2,4],['Deliver photos and clips to client',3,4,true],['Client posts to social and website',5,3]],
  setup:[['Arrive, scout light and angles','17:00','17:30',1,'I'],['Check in with the on-site contact','17:15','17:30',3,'I']],
  prog:[['Arrivals and atmosphere',30,'','I'],['Welcome and key speakers',20,'','I'],['Program highlights',40,'','I'],['Group photo and candids',20,'','I']],
  cp:[['Signed photo releases (or posted notice)','',-1],['Venue permission to photograph','',-7]],
  eq:[['Camera body','Media',1,'O'],['Zoom lens (24–70mm)','Media',1,'O'],['Spare batteries and cards','Media',1,'O'],['Clip-on mic for short interviews','Audio',1,'O'],['Phone gimbal','Media',1,'O'],['Photo release sign','Media',1,'B']]},
 {key:'interview',label:'Interview story (1–3 minute video)',scale:'Consulting',desc:'One person’s story on video: pre-interview, filming day, edit, client review, captions and publishing.',doors:'10:00',end:'12:30',progStart:'10:30',room:[20,20],
  ms:[['Pick the subject and the story angle',-14,1],['Pre-interview call with the subject',-10,1],['Questions and shot list approved by client',-7,2,true],['Location and interview release confirmed',-3,1],['Gear check',-1,4],
   ['Rough cut',4,4],['Client review of rough cut',6,4],['Final cut with captions',8,4,true],['Publish and share (YouTube, website, social)',10,3]],
  setup:[['Set up lights, camera and audio','10:00','10:30',1,'I'],['Sound check with subject','10:25','10:30',4,'IP']],
  prog:[['Interview',45,'','IP'],['B-roll: subject at work or in the neighborhood',45,'','IP'],['Portrait photos',15,'','IP']],
  cp:[['Signed interview and likeness release','',-3],['Location filming permission','',-3],['Music license for the edit','',-1]],
  eq:[['Camera body','Media',1,'O'],['Tripod','Media',1,'O'],['Lavalier mics','Audio',2,'O'],['LED panel lights','Stage & lighting',2,'O'],['Reflector','Stage & lighting',1,'O'],['Spare batteries and cards','Media',1,'O']]},
 {key:'training',label:'Camera training series',scale:'Consulting',desc:'Four hands-on sessions that teach a client’s staff to shoot their own events, practicing on a real one.',doors:'17:00',end:'20:00',progStart:'17:30',room:[40,40],
  ms:[['Discovery call and skills survey',-35,1],['Session 1: Seeing the story',-28,4],['Session 2: Your camera or phone',-21,4],['Session 3: Covering an event (shot list built)',-7,4,true],['Phones and cameras charged, checklist printed',-1,4],
   ['Session 4: After the shoot (review the team’s photos)',7,4,true],['Team posting routine in place',14,3],['Follow-up check-in',30,3]],
  setup:[['Team check-in and shot list briefing','17:00','17:30',3,'IP'],['Assign stations: arrivals, stage, candids','17:15','17:30',3,'IP']],
  prog:[['Arrivals: practice candids',30,'','IP'],['Program: practice stage shots',45,'','IP'],['Group photo and short clip',15,'','IP']],
  cp:[['Photo release forms for the practice event','',-1]],
  eq:[['Phone tripods','Media',4,'B'],['Clip-on phone mics','Audio',2,'B'],['Printed shooting checklists','Supplies',10,'B'],['Loaner camera','Media',1,'O']]}
];
TEMPLATES.forEach(t => { if(BUD[t.key]) t.bud = BUD[t.key]; });
function blankTemplate(){ return buildTemplate({doors:'18:00',end:'21:00',progStart:'18:00',bud:[]}); }
