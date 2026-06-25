// Paste your Apps Script Web App URL here. It must end in /exec.
// Example: const API_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
const API_URL = 'https://script.google.com/macros/s/AKfycbxbfyupA1_EAd7vIVLmP3TWdELhdhjRNGITU84WnMniMC4k8K9_rOTWsaiTpv3Ag8-I/exec';

const TODAY = new Date();
const CURRENT_MONTH = TODAY.getMonth();
const MONTHS = [
  ['Jan','January'],['Feb','February'],['Mar','March'],['Apr','April'],['May','May'],['Jun','June'],
  ['Jul','July'],['Aug','August'],['Sep','September'],['Oct','October'],['Nov','November'],['Dec','December']
];
const state = { plants: [], filtered: [], seasonal: [], fruit: [] };
const $ = id => document.getElementById(id);

const FIELD_ALIASES = {
  Plant:['Plant','Name','Plant Name'], Quantity:['Quantity','Qty'], Type:['Type','Plant Type','Category'], Zone:['Zone','Location','Area','Best Zone/Location'],
  Sun:['Sun','Sun Exposure','Light'], Water:['Water','Water Needs'], Rabbit:['Rabbit Risk','Rabbits','Rabbit Resistance','Rabbit'],
  Prune:['Prune','Pruning','When to Prune','Prune / Deadhead','Prune/Deadhead'], Fertilize:['Fertilize','Fertilizer','Feeding'],
  Winter:['Winter','Freeze','Winter / Freeze Notes','Winter / Freeze','Winter/Freeze'], Notes:['Notes','Care Notes'], Photo:['Photo','Image','Photo URL','Image URL']
};

// This is the part that makes the app actually feel smart instead of blindly trusting the sheet.
// Add/adjust entries as your yard changes.
const PLANT_BRAIN = {
  'bee balm':{icon:'🌺',bloom:[5,6],tasks:{5:['Deadhead spent heads down to side buds; watch powdery mildew.'],6:['Deadhead for a smaller rebloom; remove mildewed leaves.']},summer:'Deadhead + airflow. Do not overwater trying to save it.'},
  'tickseed':{icon:'🌼',bloom:[4,5,6],tasks:{5:['Shear lightly after first flush; protect if rabbits browse.'],6:['Let foliage regrow; avoid heavy nitrogen if mildew is active.']},summer:'Rabbit protection first. Light haircut only after bloom flush.'},
  'coreopsis':{icon:'🌼',bloom:[4,5,6],tasks:{5:['Shear lightly after first flush; protect if rabbits browse.'],6:['Let foliage regrow; avoid heavy nitrogen if mildew is active.']}},
  'serendipity allium':{icon:'🟣',bloom:[5,6],tasks:{5:['Flower buds should be rising; trim only fully yellow outer leaves.'],6:['Enjoy blooms; deadhead later or leave seedheads.']},summer:'Buds now; blooms late June–July. Go easy on water.'},
  'allium':{icon:'🟣',bloom:[5,6],tasks:{5:['Flower buds should be rising; trim only fully yellow outer leaves.'],6:['Enjoy blooms; deadhead later or leave seedheads.']}},
  'blueberries':{icon:'🫐',bloom:[2,3],harvest:[4,5],tasks:{5:['Protect from rabbits and birds; net before berries color.'],6:['Harvest when fully blue and sweet; maintain acidic mulch.']},summer:'Rabbit cage + bird netting. Acid fertilizer only.'},
  'bermuda grass':{icon:'🌱',tasks:{5:['Mow low/frequently once growing; fertilize 16-0-8 if 4–6 weeks since last app.'],6:['Active-growth fertilizer window; watch irrigation coverage.'],7:['Keep mowing; spot-check dry/brown areas.']}},
  'pink muhly grass':{icon:'🌾',bloom:[8,9],tasks:{5:['Establishing now; do not judge bloom yet.'],8:['Main bloom cloud starts late summer/fall.']}},
  'little bluestem':{icon:'🌾',bloom:[8,9,10]},
  'strawberries':{icon:'🍓',bloom:[3,4],harvest:[4,5],tasks:{5:['Pick fully red berries; protect from birds, slugs, and rabbits.']}},
  'pink coneflowers':{icon:'🌸',bloom:[5,6,7],tasks:{5:['Rabbit-prone while young; cage if being eaten.'],6:['Deadhead for tidy rebloom or leave some seedheads later.']}},
  'yellow coneflowers':{icon:'🌻',bloom:[5,6,7],tasks:{5:['Rabbit-prone while young; cage if being eaten.'],6:['Deadhead for tidy rebloom or leave seedheads later.']}},
  'coneflower':{icon:'🌸',bloom:[5,6,7]},
  'english lavender':{icon:'💜',bloom:[5,6],tasks:{5:['Do not overwater; trim lightly after bloom.'],6:['Trim spent flower stems; keep crown dry.']}},
  'provence lavender':{icon:'💜',bloom:[5,6]},
  'lavender':{icon:'💜',bloom:[5,6]},
  'limelight hydrangeas':{icon:'🤍',bloom:[6,7,8],tasks:{6:['Buds/flowers developing; water deeply in heat.'],7:['Enjoy panicles; do not hard prune now.']}},
  'puffer fish panicle hydrangeas':{icon:'🤍',bloom:[6,7,8]},
  'oakleaf hydrangeas':{icon:'🍂',bloom:[4,5],tasks:{5:['Deadhead only if you want; do not hard prune after bloom.'],6:['Leave foliage; next year’s buds form on old wood.']}},
  'endless summer hydrangea':{icon:'💙',bloom:[5,6,7],tasks:{5:['Deadhead spent blooms; protect from severe afternoon sun.'],6:['Water consistently; do not hard prune.']}},
  'wee bit innocent bigleaf hydrangeas':{icon:'💙',bloom:[5,6,7]},
  'pinnacle hydrangeas':{icon:'🤍',bloom:[6,7,8]},
  'salvia':{icon:'🪻',bloom:[4,5,6],tasks:{5:['Shear after first bloom flush for rebloom.'],6:['Deadhead/shear if bloom spikes are spent.']}},
  'daylillies':{icon:'🌺',bloom:[5,6],tasks:{5:['Remove mushy spent flowers; cut finished scapes to base.'],6:['Keep deadheading spent blooms.']}},
  'shasta daisies':{icon:'🤍',bloom:[5,6],tasks:{5:['Deadhead spent blooms; protect if rabbits browse.'],6:['Deadhead to extend bloom.']}},
  'creeping phlox':{icon:'🌸',bloom:[2,3,4],tasks:{5:['If rabbits ravaged it, protect regrowth or replace with tougher groundcover.']}},
  'catmint':{icon:'🪻',bloom:[4,5,6,7],tasks:{5:['Shear after first flush for rebloom.'],6:['Trim by 1/3 if floppy or spent.']}},
  'swamp sunflowers':{icon:'🌻',bloom:[8,9,10],tasks:{5:['Rabbits love new growth; physical protection or move/replace.'],6:['Protect regrowth immediately; sprays alone probably fail.']}},
  'columbine':{icon:'🧚',bloom:[3,4,5],tasks:{5:['Deadhead for tidiness or leave some seedheads to self-sow.']}},
  'serviceberry trees':{icon:'🫐',bloom:[2,3],harvest:[4,5],tasks:{5:['Birds will take fruit fast; net only if you really care.']}},
  'tamukeyama japanese maple':{icon:'🍁'},
  'arbequina olive tree':{icon:'🫒',harvest:[9,10],tasks:{5:['Container olives like drainage; avoid soggy roots.']}},
  'witch hazel':{icon:'✨',bloom:[0,1]},
  'chindo viburnum':{icon:'🌿',bloom:[3,4]},
  'iris':{icon:'💜',bloom:[3,4,5],tasks:{5:['Cut spent stalks; keep green leaves.']}},
  'lambs ear':{icon:'🐑',bloom:[5,6]},
  'stachys':{icon:'🐑',bloom:[5,6]},
  'dianthus':{icon:'🌸',bloom:[3,4,5],tasks:{5:['Deadhead spent flowers for more bloom.']}},
  'camellia':{icon:'🌺',bloom:[0,1,2,10,11]},
  'sassafras tree':{icon:'🌳'},
  'distylium':{icon:'🌿'},
  'dwarf yaupon':{icon:'🌿'},
  'yaupon holly':{icon:'🌿'},
  'basil':{icon:'🌿',harvest:[5,6,7,8],tasks:{5:['Pinch tips often; harvest leaves before flowering.'],6:['Keep pinching; feed lightly.']}},
  'mint':{icon:'🌿',harvest:[4,5,6,7,8]},
  'french tarragon':{icon:'🌿',harvest:[4,5,6,7,8]},
  'oregano':{icon:'🌿',harvest:[4,5,6,7,8]},
  'sage':{icon:'🌿',harvest:[4,5,6,7,8]},
  'pink mandevilla':{icon:'🌺',bloom:[5,6,7,8,9]},
  'contender peach tree':{icon:'🍑',bloom:[2,3],harvest:[6,7],tasks:{5:['Protect fruit from squirrels/birds if present; thin overloaded branches.'],6:['Harvest when fragrant, warm-colored, and slightly soft.']}}
};

$('monthName').textContent = MONTHS[CURRENT_MONTH][1];
$('todayFocus').textContent = CURRENT_MONTH >= 5 && CURRENT_MONTH <= 7 ? 'Summer mode' : 'Seasonal mode';
$('reload').onclick = loadPlants;
$('addPlant').onclick = () => openModal({});
$('savePlant').onclick = async ev => { ev.preventDefault(); await savePlant(); };
['search','typeFilter','zoneFilter','sunFilter','rabbitFilter','sortBy'].forEach(id => $(id).addEventListener('input', render));
document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
loadPlants();

function switchView(view){ document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`)); }
function apiUrl(params={}){ if(!API_URL || API_URL.includes('PASTE_')) throw new Error('Paste your Apps Script URL into API_URL in app.js'); const u=new URL(API_URL); Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v)); return u.toString(); }
function jsonp(url){ return new Promise((resolve,reject)=>{ const cb='backyard_cb_'+Date.now()+'_'+Math.round(Math.random()*10000); window[cb]=d=>{delete window[cb]; script.remove(); resolve(d)}; const script=document.createElement('script'); script.src=url+(url.includes('?')?'&':'?')+'callback='+cb; script.onerror=reject; document.body.appendChild(script); }); }
async function loadPlants(){ try{ $('syncStatus').textContent='Connecting to Google Sheet…'; const data=await jsonp(apiUrl({action:'all'})); state.plants=(data.plants || []).map(normalizePlant); state.seasonal=data.seasonal || []; state.fruit=data.fruit || []; $('syncStatus').textContent=`Synced · ${state.plants.length} plants`; hydrateFilters(); render(); }catch(err){ console.warn(err); $('syncStatus').textContent='Demo mode · paste API_URL in app.js'; const data=demoData(); state.plants=data.plants.map(normalizePlant); state.seasonal=data.seasonal; state.fruit=data.fruit; hydrateFilters(); render(); } }
function normalizePlant(p){ const name=get(p,'Plant'); const brain=brainFor(name); return {...p,_name:name,_qty:get(p,'Quantity'),_type:get(p,'Type'),_zone:get(p,'Zone'),_sun:get(p,'Sun'),_water:get(p,'Water'),_rabbit:get(p,'Rabbit'),_prune:get(p,'Prune'),_fert:get(p,'Fertilize'),_winter:get(p,'Winter'),_notes:get(p,'Notes'),_photo:get(p,'Photo'),_brain:brain}; }
function get(p,key){ for(const k of FIELD_ALIASES[key]||[key]){ const actual=Object.keys(p).find(x=>norm(x)===norm(k)); if(actual && p[actual] != null) return String(p[actual]); } return ''; }
function norm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
function brainFor(name){ const n=norm(name); let best={icon:'🌱'}; let bestLen=0; Object.entries(PLANT_BRAIN).forEach(([k,v])=>{ const nk=norm(k); if((n.includes(nk)||nk.includes(n)) && nk.length>bestLen){ best={icon:'🌱',...v}; bestLen=nk.length; } }); return best; }
function hydrateFilters(){ fill('typeFilter',[...new Set(state.plants.map(p=>p._type).filter(Boolean))]); fill('zoneFilter',[...new Set(state.plants.map(p=>p._zone).filter(Boolean))]); fill('sunFilter',[...new Set(state.plants.map(p=>p._sun).filter(Boolean))]); fill('rabbitFilter',[...new Set(state.plants.map(p=>p._rabbit).filter(Boolean))]); }
function fill(id, arr){ const el=$(id), first=el.options[0].outerHTML; el.innerHTML=first+arr.sort().map(x=>`<option>${esc(x)}</option>`).join(''); }
function render(){ const q=$('search').value.toLowerCase(); let plants=state.plants.filter(p=>JSON.stringify(p).toLowerCase().includes(q)); if($('typeFilter').value) plants=plants.filter(p=>p._type===$('typeFilter').value); if($('zoneFilter').value) plants=plants.filter(p=>p._zone===$('zoneFilter').value); if($('sunFilter').value) plants=plants.filter(p=>p._sun===$('sunFilter').value); if($('rabbitFilter').value) plants=plants.filter(p=>p._rabbit===$('rabbitFilter').value); const sortKey=$('sortBy').value; plants.sort((a,b)=>get(a,sortKey).localeCompare(get(b,sortKey))); state.filtered=plants; renderKpis(plants); renderNow(plants); renderTasks(plants); renderSnapshot(plants); renderCards(plants); renderCalendar(plants); renderRabbit(plants); $('gardenSubtitle').textContent = `${state.plants.length} plants tracked · ${MONTHS[CURRENT_MONTH][1]} care plan · rabbit-aware`; }
function renderKpis(plants){ const blooming=plants.filter(p=>isActiveNow(p,'bloom')).length; const harvest=plants.filter(p=>isActiveNow(p,'harvest')).length; const rabbit=plants.filter(isRabbitTarget).length; $('kpis').innerHTML=kpi('Plants',plants.length,'🌿')+kpi('Blooming now',blooming,'🌸')+kpi('Harvest now',harvest,'🫐')+kpi('Rabbit targets',rabbit,'🐇'); }
function kpi(label,value,icon){ return `<div class="kpi"><span>${icon} ${label}</span><strong>${value}</strong></div>`; }
function renderNow(plants){ const arr=plants.filter(p=>isActiveNow(p)).sort((a,b)=> (isActiveNow(b,'harvest')?1:0)-(isActiveNow(a,'harvest')?1:0)); $('nowCount').textContent=`${arr.length} active`; $('nowList').innerHTML=arr.map(p=>`<div class="now-tile"><div class="plant-icon">${p._brain.icon}</div><div><b>${esc(p._name)}</b><br><small>${isActiveNow(p,'harvest')?'Harvest / edible window':'Bloom window'} · ${activeWindowText(p)}</small></div></div>`).join('') || '<p class="empty">Nothing mapped to this month yet. Add bloom/harvest windows in PLANT_BRAIN or the sheet.</p>'; }
function renderTasks(plants){ const tasks = smartTasks(plants); $('taskCount').textContent=`${tasks.length} tasks`; const preview = tasks.slice(0,12).map(taskHtml).join('') || '<p class="empty">No urgent tasks for this month. Suspiciously peaceful.</p>'; $('tasksPreview').innerHTML=preview; const groups={Rabbit:[],Prune:[],Harvest:[],Fertilize:[],Water:[],Other:[]}; tasks.forEach(t=>groups[t.group]?.push(t)); $('tasksFull').innerHTML=Object.entries(groups).map(([g,items])=>`<div class="task-column"><h3>${g}</h3>${items.map(taskHtml).join('') || '<p class="empty">Nothing now.</p>'}</div>`).join(''); }
function smartTasks(plants){ const tasks=[]; const m=CURRENT_MONTH; plants.forEach(p=>{ const brain=p._brain||{}; (brain.tasks?.[m]||[]).forEach(t=>tasks.push({plant:p,group:taskGroup(t),text:t})); if(isRabbitTarget(p) && m>=2 && m<=9) tasks.push({plant:p,group:'Rabbit',text:'Protect/check new growth. Resident rabbits will eat regrowth first.'}); if(isActiveNow(p,'harvest')) tasks.push({plant:p,group:'Harvest',text:harvestText(p)}); if(isActiveNow(p,'bloom') && /deadhead|spent|shear|remove/i.test(p._prune)) tasks.push({plant:p,group:'Prune',text:p._prune}); if(m>=4 && m<=7 && /bermuda/i.test(p._name)) tasks.push({plant:p,group:'Fertilize',text:'Fertilize during active growth if 4–6 weeks since last application.'}); if(m>=4 && m<=7 && /basil/i.test(p._name)) tasks.push({plant:p,group:'Harvest',text:'Pinch tips and harvest often; do not let it flower.'}); // only show winter/freeze tasks in freeze season
    if((m<=1 || m>=10) && /freeze|frost|winter|protect/i.test(p._winter)) tasks.push({plant:p,group:'Other',text:p._winter});
  }); return dedupe(tasks).slice(0,60); }
function taskGroup(t){ if(/rabbit|cage|protect/.test(t.toLowerCase())) return 'Rabbit'; if(/harvest|pick|pinch/.test(t.toLowerCase())) return 'Harvest'; if(/deadhead|shear|trim|prune|cut/.test(t.toLowerCase())) return 'Prune'; if(/fertiliz|feed/.test(t.toLowerCase())) return 'Fertilize'; if(/water|moist/.test(t.toLowerCase())) return 'Water'; return 'Other'; }
function taskHtml(t){ return `<div class="task-card ${t.group.toLowerCase()}"><span class="task-dot"></span><div><b>${esc(t.plant._name)}</b><br><small>${esc(t.text)}</small></div><span class="tag">${esc(t.group)}</span></div>`; }
function dedupe(tasks){ const seen=new Set(); return tasks.filter(t=>{ const k=t.plant._name+'|'+t.group+'|'+t.text; if(seen.has(k)) return false; seen.add(k); return true; }); }
function renderSnapshot(plants){ const cards=[['🐇 Rabbit pressure',`${plants.filter(isRabbitTarget).length} vulnerable plants`, 'Cages/bed-edge fencing beat sprays. Allium, salvia, catmint, lavender, lamb’s ear are your backbone.'],['🌡️ June mode','No freeze tasks', 'Winter protection is hidden until Nov–Feb. Right now: watering, deadheading, rabbits, mildew.'],['🌼 Succession',`${plants.filter(p=>isActiveNow(p,'bloom')).length} blooming now`, 'Salvia/catmint/bee balm/allium/hydrangeas carry early summer; muhly and swamp sunflower are fall players.'],['🧪 Soil test','Low pH + low N/K', 'Feed Bermuda; avoid high-phosphorus bloom boosters; blueberries stay acid-only.']]; $('snapshot').innerHTML=cards.map(c=>`<div class="snapshot"><h3>${c[0]}</h3><b>${c[1]}</b><p>${c[2]}</p></div>`).join(''); }
function renderCards(plants){ $('plantGrid').innerHTML=plants.map((p,i)=>{ const riskClass=isRabbitTarget(p)?'high':isRabbitSafe(p)?'low':''; const art=p._photo?`<img src="${esc(p._photo)}" alt="${esc(p._name)}">`:p._brain.icon; return `<article class="plant-card"><div class="plant-art">${art}<span class="risk-chip ${riskClass}">🐇 ${esc(p._rabbit||'unknown')}</span></div><div class="plant-body"><h3>${esc(p._name)}</h3><div class="badges"><span class="badge">${esc(p._type||'Plant')}</span><span class="badge">Qty ${esc(p._qty||'')}</span><span class="badge">${esc(p._zone||'No zone')}</span></div><div class="plant-facts"><div class="fact"><b>Sun</b>${esc(p._sun)}</div><div class="fact"><b>Water</b>${esc(p._water)}</div><div class="fact"><b>Season</b>${activeWindowText(p) || '—'}</div><div class="fact"><b>Care</b>${careSummary(p)}</div></div><div class="care-strip">${careChips(p).map(x=>`<span class="care">${x}</span>`).join('')}</div>${p._notes?`<p class="notes">${esc(p._notes)}</p>`:''}<div class="card-actions"><button onclick="openModalByIndex(${i})" class="soft">Edit / Notes</button></div></div></article>`; }).join(''); }
function renderCalendar(plants){ $('calendar').innerHTML=MONTHS.map(([short,long],idx)=>{ const items=plants.filter(p=>monthsFor(p).includes(idx)); return `<div class="month"><div class="month-name">${short}</div><div class="month-lane">${items.map(p=>`<span class="cal-pill ${p._brain.harvest?.includes(idx)?'fruit':'bloom'}"><span>${p._brain.icon}</span>${esc(p._name)}</span>`).join('') || '<span class="empty">—</span>'}</div></div>`; }).join(''); }
function renderRabbit(plants){ const targets=plants.filter(isRabbitTarget); const safe=plants.filter(isRabbitSafe); $('rabbitGrid').innerHTML=`<div class="rabbit-card high"><h3>Immediate targets</h3><p>${targets.map(p=>p._name).join(', ') || 'None'}</p></div><div class="rabbit-card low"><h3>Rabbit-resistant backbone</h3><p>${safe.map(p=>p._name).join(', ') || 'None'}</p></div><div class="rabbit-card"><h3>Rule</h3><p>Sprays are backup. For plants already being eaten, physical protection or replacement is the real fix.</p></div>`; }
function monthsFor(p){ const set=new Set([...(p._brain.bloom||[]),...(p._brain.harvest||[])]); const text=`${p._notes} ${p._prune} ${p._fert}`.toLowerCase(); MONTHS.forEach(([short,long],i)=>{ if(text.includes(long.toLowerCase())||new RegExp(`\\b${short.toLowerCase()}\\b`).test(text)) set.add(i); }); return [...set].sort((a,b)=>a-b); }
function isActiveNow(p,kind){ if(kind==='bloom') return (p._brain.bloom||[]).includes(CURRENT_MONTH); if(kind==='harvest') return (p._brain.harvest||[]).includes(CURRENT_MONTH); return isActiveNow(p,'bloom') || isActiveNow(p,'harvest'); }
function activeWindowText(p){ const parts=[]; if(p._brain.bloom?.length) parts.push('Bloom '+rangeText(p._brain.bloom)); if(p._brain.harvest?.length) parts.push('Harvest '+rangeText(p._brain.harvest)); return parts.join(' · '); }
function rangeText(arr){ if(!arr?.length) return ''; const sorted=[...arr].sort((a,b)=>a-b); return sorted.map(i=>MONTHS[i][0]).join('/'); }
function harvestText(p){ if(/blueberr/i.test(p._name)) return 'Harvest when fully blue; protect from birds/rabbits.'; if(/straw/i.test(p._name)) return 'Pick fully red berries; protect from birds/slugs/rabbits.'; if(/basil|mint|oregano|sage|tarragon/i.test(p._name)) return 'Harvest leaves often; take no more than about 1/3 at once.'; if(/peach/i.test(p._name)) return 'Pick when fragrant, warm-colored, and slightly soft.'; return 'Check for ripe harvest.'; }
function careSummary(p){ if(/none|usually none|minimal/i.test(p._fert)) return 'Lean soil'; if(/acid/i.test(p._fert)) return 'Acid feed'; if(/light/i.test(p._fert)) return 'Light feed'; return 'Check notes'; }
function careChips(p){ const chips=[]; if(isRabbitTarget(p)) chips.push('🐇 protect'); if(isRabbitSafe(p)) chips.push('rabbit-safe'); if(isActiveNow(p,'bloom')) chips.push('🌸 blooming'); if(isActiveNow(p,'harvest')) chips.push('🧺 harvest'); if(/mildew/i.test(`${p._notes} ${p._prune}`)) chips.push('mildew watch'); if(/acid/i.test(p._fert)) chips.push('acid soil'); return chips.slice(0,5); }
function isRabbitTarget(p){ return /high|very high|favorite|candy|ravaged|annihilat|medium in your yard/i.test(`${p._rabbit} ${p._notes}`); }
function isRabbitSafe(p){ return /very low|low|resistant|rarely|deter|safe/i.test(`${p._rabbit} ${p._notes}`) && !isRabbitTarget(p); }
function openModalByIndex(i){ openModal(state.filtered[i]); }
function openModal(p){ $('rowNumber').value=p.rowNumber||p._row||''; $('plantName').value=p._name||''; $('quantity').value=p._qty||''; $('type').value=p._type||''; $('zone').value=p._zone||''; $('sun').value=p._sun||''; $('water').value=p._water||''; $('rabbit').value=p._rabbit||''; $('photo').value=p._photo||''; $('prune').value=p._prune||''; $('fertilize').value=p._fert||''; $('winter').value=p._winter||''; $('notes').value=p._notes||''; $('plantDialog').showModal(); }
async function savePlant(){ const payload={rowNumber:$('rowNumber').value,Plant:$('plantName').value,Qty:$('quantity').value,Type:$('type').value,'Best Zone/Location':$('zone').value,Sun:$('sun').value,Water:$('water').value,'Rabbit Risk':$('rabbit').value,Photo:$('photo').value,Fertilize:$('fertilize').value,'Prune / Deadhead':$('prune').value,'Winter / Freeze':$('winter').value,Notes:$('notes').value}; try{ await fetch(apiUrl({action:'upsert'}),{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)}); $('plantDialog').close(); $('syncStatus').textContent='Saved. Refreshing…'; setTimeout(loadPlants,1200); }catch(e){ alert('Could not save. Check API_URL and Apps Script deployment permissions.'); } }
function esc(x){ return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function demoData(){ return {plants:[
{Plant:'Bee balm',Qty:3,Type:'Perennial / pollinator','Best Zone/Location':'Back beds',Sun:'Full sun to part sun',Water:'Medium; avoid soggy crowns','Rabbit Risk':'Low–Medium',Fertilize:'Light spring feeding; avoid heavy N', 'Prune / Deadhead':'Deadhead spent blooms to side buds', 'Winter / Freeze':'Dies back; cut stems late winter',Notes:'Prone to powdery mildew/leaf spot; wants airflow'},
{Plant:'Tickseed / Coreopsis',Qty:3,Type:'Perennial / pollinator','Best Zone/Location':'Back bed',Sun:'Full sun',Water:'Low–Medium once established','Rabbit Risk':'Medium in your yard',Fertilize:'Light spring feeding only', 'Prune / Deadhead':'Deadhead/shear after first flush by 1/3', 'Winter / Freeze':'Semi-dormant',Notes:'Cage while rabbits are active; mildew likely if stressed'},
{Plant:'Serendipity Allium',Qty:4,Type:'Perennial allium','Best Zone/Location':'Back bed',Sun:'Full sun',Water:'Low–Medium; prefers drier side','Rabbit Risk':'Very low',Fertilize:'Usually none', 'Prune / Deadhead':'Remove spent flower stems after bloom', 'Winter / Freeze':'Hardy, no protection needed',Notes:'Blooms late June–July; onion foliage deters rabbits'},
{Plant:'Blueberries',Qty:2,Type:'Fruit shrub','Best Zone/Location':'Back edible side',Sun:'Full sun best; tolerates part sun',Water:'Consistent moisture; acidic mulch','Rabbit Risk':'Very high',Fertilize:'Acid-loving fertilizer in spring', 'Prune / Deadhead':'Minimal pruning years 1–2', 'Winter / Freeze':'Hardy; protect flowers from late freeze if blooming',Notes:'Protect from rabbits and birds'},
{Plant:'Swamp sunflowers',Qty:3,Type:'Tall native perennial','Best Zone/Location':'Back sunny bed',Sun:'Full sun',Water:'Medium–High','Rabbit Risk':'Very high in your yard',Fertilize:'Moderate spring feeding/compost', 'Prune / Deadhead':'Cut down in winter', 'Winter / Freeze':'Hardy',Notes:'Needs physical protection or replacement'},
{Plant:'Basil',Qty:4,Type:'Annual herb','Best Zone/Location':'Raised bed',Sun:'Full sun',Water:'Medium', 'Rabbit Risk':'Medium',Fertilize:'Light regular feeding', 'Prune / Deadhead':'Pinch often; harvest leaves', 'Winter / Freeze':'Dies in frost',Notes:'Harvest leaves anytime; best before flowering'}],seasonal:[],fruit:[]}; }
