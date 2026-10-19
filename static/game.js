'use strict';
/* Public Transport Manager – játéklogika. Belső pénznem: EUR, megjelenítés: HUF élő árfolyamon. */
const $ = s => document.querySelector(s);
const BASE_FARE = 1.2, MAXL = 40, STOP_COST = 120, LINE_COST = 250;
let RATE = 390, RATE_INFO = '';
const T = {
  midi:{n:'Midibusz',e:'🚐',price:1800,kmh:28,cap:25,comf:5,lvl:1},
  bus:{n:'Autóbusz',e:'🚌',price:3000,kmh:30,cap:45,comf:8,lvl:2},
  artic:{n:'Csuklós busz',e:'🚍',price:5200,kmh:30,cap:70,comf:8,lvl:5},
  trolley:{n:'Trolibusz',e:'🚎',price:7000,kmh:32,cap:55,comf:12,lvl:9},
  tram:{n:'Villamos',e:'🚋',price:9000,kmh:34,cap:110,comf:14,lvl:13},
  train:{n:'Vonat',e:'🚆',price:16000,kmh:60,cap:220,comf:16,lvl:18},
  metro:{n:'Metró',e:'🚇',price:30000,kmh:45,cap:300,comf:20,lvl:24}
};
const COLORS = ['#e63946','#1d7fd1','#2a9d5c','#f2a900','#8e44ad','#00a8a8','#e4572e','#5c6b7a'];
const TITLES = ['Gyakornok','Forgalmi diszpécser','Vonalfelelős','Területi vezető','Közlekedési igazgató','Városi főnök','Régiós vezérigazgató','Közlekedési mogul'];
const need = l => Math.round(50 * Math.pow(l, 1.75));
const lim = l => ({stops: 8 + 4*l, lines: 1 + Math.floor(l/2), veh: 3 + 2*l});
const fresh = () => ({money:6000, xp:0, lv:1, min:360, day:0, nid:1, stops:[], lines:[], veh:[], ts:60});
let S; try { S = JSON.parse(localStorage.getItem('ptm_save')) || fresh(); } catch(e){ S = fresh(); }
if (!S.ts && S.ts !== 0) S.ts = 60;
let tab = 'lines', mode = null, draft = [];
const fmt = eur => Math.round(eur * RATE).toLocaleString('hu-HU') + ' Ft';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sid = id => S.stops.find(s => s.id === id);
const lid = id => S.lines.find(l => l.id === id);
const hour = () => (S.min / 60) % 24;
const hav = (a, b) => { const R=6371000, r=Math.PI/180, dLa=(b.lat-a.lat)*r, dLo=(b.lng-a.lng)*r;
  const x = Math.sin(dLa/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(x)); };
const curve = h => (h>=23||h<5) ? .15 : (h>=7&&h<9.5)||(h>=15.5&&h<18.5) ? 1.1 : .6;
const isAct = (v, h) => v.from < v.to ? (h >= v.from && h < v.to) : (h >= v.from || h < v.to);
const capOf = v => Math.round(T[v.type].cap * (1 + .1 * v.lv));
const mkSeg = pts => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i-1] + hav({lat:pts[i-1][0], lng:pts[i-1][1]}, {lat:pts[i][0], lng:pts[i][1]})); return {pts, cum, len:cum[cum.length-1]}; };
async function route(a, b){
  try { const j = await (await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`)).json();
    if (j.code === 'Ok') return mkSeg(j.routes[0].geometry.coordinates.map(c => [c[1], c[0]])); } catch(e){}
  return mkSeg([[a.lat, a.lng], [b.lat, b.lng]]);
}
async function buildSegs(l){ const st = l.stopIds.map(sid); l.segs = await Promise.all(st.slice(1).map((x, i) => route(st[i], x))); }
const segOf = (l, k) => { if (l.segs && l.segs[k]) return l.segs[k]; const a = sid(l.stopIds[k]), b = sid(l.stopIds[k+1]); return mkSeg([[a.lat, a.lng], [b.lat, b.lng]]); };
function ptAt(sg, d){ let i = 1; while (i < sg.pts.length - 1 && sg.cum[i] < d) i++; const c0 = sg.cum[i-1], c1 = sg.cum[i], f = c1 > c0 ? Math.min(1, Math.max(0, (d - c0) / (c1 - c0))) : 0, a = sg.pts[i-1], b = sg.pts[i]; return [a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f]; }
const stopCap = s => 30 + 15 * s.lv;
const stopUpCost = s => Math.round(150 * Math.pow(s.lv + 1, 1.5));
const vehUpCost = v => Math.round(T[v.type].price * .3 * (v.lv + 1));
const stars = s => { const n = Math.round(s / 10) / 2; return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n)); };
const satLabel = s => s>=85?'Kiváló':s>=70?'Jó':s>=50?'Elfogadható':s>=30?'Rossz':'Elégedetlen';
function save(){ localStorage.setItem('ptm_save', JSON.stringify(S)); }
function toast(msg){ const d = document.createElement('div'); d.textContent = msg; $('#toast').append(d); setTimeout(() => d.remove(), 3800); }

/* ---------- Térkép ---------- */
const map = L.map('map').setView([47.4979, 19.0402], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
const stopLayer = L.layerGroup().addTo(map), lineLayer = L.layerGroup().addTo(map), vm = {};
let draftLine = null;
function fitAll(){
  const pts = S.stops.map(s => [s.lat, s.lng]);
  S.lines.forEach(l => (l.segs || []).forEach(sg => sg.pts.forEach(q => pts.push(q))));
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(.12), {maxZoom:16, animate:false});
}
const FitCtl = L.Control.extend({onAdd(){ const b = L.DomUtil.create('button', 'btn'); b.textContent = '⤢ Teljes hálózat'; b.title = 'Az összes vonal és megálló megtekintése';
  L.DomEvent.disableClickPropagation(b); b.onclick = fitAll; return b; }});
new FitCtl({position:'topleft'}).addTo(map);
function drawMap(){
  stopLayer.clearLayers(); lineLayer.clearLayers();
  S.lines.forEach(l => L.polyline(l.stopIds.slice(1).flatMap((x, k) => segOf(l, k).pts), {color:l.color, weight:6, opacity:.8}).addTo(lineLayer));
  S.stops.forEach(s => {
    const m = L.circleMarker([s.lat, s.lng], {radius:7+s.lv*1.5, color:'#0f2236', weight:3, fillColor:draft.includes(s.id)?'#ffc72c':'#fff', fillOpacity:1}).addTo(stopLayer);
    m.bindTooltip(esc(s.name));
    m.on('click', () => { if (mode === 'line') { draft.push(s.id); drawMap(); render(); } else m.bindPopup(() => stopPopup(s)).openPopup(); });
  });
  if (draftLine) map.removeLayer(draftLine);
  draftLine = draft.length > 1 ? L.polyline(draft.map(id => { const s = sid(id); return [s.lat, s.lng]; }), {color:'#ffc72c', dashArray:'8 8', weight:5}).addTo(map) : null;
  S.veh.forEach(v => { if (!vm[v.id]) vm[v.id] = L.marker([0,0], {zIndexOffset:500, icon:L.divIcon({className:'', iconSize:[30,30], html:`<div class="vm" style="background:${lid(v.lineId).color}">${T[v.type].e}</div>`})}).addTo(map); });
  Object.keys(vm).forEach(id => { if (!S.veh.some(v => v.id == id)) { map.removeLayer(vm[id]); delete vm[id]; } });
}
function stopPopup(s){
  const d = document.createElement('div'), w = Object.values(s.w).reduce((a, b) => a + b, 0);
  d.innerHTML = `<b>${esc(s.name)}</b><br>Szint: ${s.lv}/5 · várakozók: ${Math.floor(w)}/${stopCap(s)}<br>`;
  const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = s.lv >= 5 ? 'Maximális szint' : `Fejlesztés: ${fmt(stopUpCost(s))}`; b.disabled = s.lv >= 5;
  b.onclick = () => { upStop(s.id); map.closePopup(); }; d.append(b); return d;
}
map.on('click', e => {
  if (mode !== 'stop') return;
  if (S.stops.length >= lim(S.lv).stops) return toast('Elérted a megállók maximális számát – lépj szintet!');
  if (S.money < STOP_COST) return toast('Nincs elég pénz.');
  S.money -= STOP_COST; S.stops.push({id:S.nid++, lat:e.latlng.lat, lng:e.latlng.lng, name:'Megálló ' + S.nid, lv:0, pop:.6 + Math.random()*.9, w:{}});
  addXp(5); drawMap(); render(); save();
});

/* ---------- Szintek ---------- */
function addXp(x){
  if (S.lv >= MAXL) return;
  S.xp += x;
  while (S.lv < MAXL && S.xp >= need(S.lv)) {
    S.xp -= need(S.lv); S.lv++;
    const bonus = 250 * S.lv, un = Object.values(T).filter(t => t.lvl === S.lv).map(t => t.n);
    S.money += bonus; toast(`🎉 Szintlépés! ${S.lv}. szint – jutalom: ${fmt(bonus)}${un.length ? ' · új jármű: ' + un.join(', ') : ''}`); render();
  }
}

/* ---------- Műveletek ---------- */
function setTab(t){ tab = t; mode = null; draft = []; drawMap(); render(); }
function toggleStop(){ mode = mode === 'stop' ? null : 'stop'; render(); }
function startLine(){
  if (S.lines.length >= lim(S.lv).lines) return toast('Elérted a vonalak maximális számát – lépj szintet!');
  mode = 'line'; draft = []; render();
}
function cancelLine(){ mode = null; draft = []; drawMap(); render(); }
async function finishLine(){
  if (draft.length < 2) return toast('Legalább két megálló kell.');
  if (S.money < LINE_COST) return toast('Nincs elég pénz.');
  S.money -= LINE_COST; const id = S.nid++;
  S.lines.push({id, name:'Vonal ' + (S.lines.length + 1), color:COLORS[S.lines.length % COLORS.length], stopIds:[...draft], fare:BASE_FARE, sat:50, pax:0, inc:0});
  addXp(20 + draft.length * 3); const nl = S.lines[S.lines.length - 1]; mode = null; draft = []; drawMap(); render(); save();
  toast('Útvonal tervezése az úthálózaton…'); await buildSegs(nl); drawMap(); render(); save();
}
function delLine(id){
  if (!confirm('Törlöd a vonalat? A járművek 60%-os áron eladásra kerülnek.')) return;
  S.veh.filter(v => v.lineId === id).forEach(v => S.money += T[v.type].price * .6);
  S.veh = S.veh.filter(v => v.lineId !== id); S.lines = S.lines.filter(l => l.id !== id); drawMap(); render(); save();
}
function buyVeh(id, type){
  if (!type) return; const t = T[type];
  if (S.veh.length >= lim(S.lv).veh) return toast('Elérted a járműkeret határát – lépj szintet!');
  if (S.money < t.price) return toast('Nincs elég pénz.');
  S.money -= t.price; S.veh.push({id:S.nid++, lineId:id, type, lv:0, from:5, to:23, i:0, dir:1, p:0, load:0});
  addXp(15); drawMap(); render(); save();
}
function sellVeh(id){ const v = S.veh.find(v => v.id === id); S.money += T[v.type].price * .6; S.veh = S.veh.filter(x => x !== v); drawMap(); render(); save(); }
function upVeh(id){
  const v = S.veh.find(v => v.id === id), c = vehUpCost(v);
  if (v.lv >= 5 || S.money < c) return toast(v.lv >= 5 ? 'Maximális szint.' : 'Nincs elég pénz.');
  S.money -= c; v.lv++; addXp(10); render(); save();
}
function upStop(id){
  const s = sid(id), c = stopUpCost(s);
  if (s.lv >= 5 || S.money < c) return toast(s.lv >= 5 ? 'Maximális szint.' : 'Nincs elég pénz.');
  S.money -= c; s.lv++; addXp(10); drawMap(); render(); save();
}
const setV = (id, k, val) => { const v = S.veh.find(v => v.id === id); v[k] = Math.min(24, Math.max(0, +val || 0)); if (k === 'to' && v.to === 24) v.to = 23.99; save(); };
const setL = (id, k, val) => { const l = lid(id); if (k === 'fare') l.fare = Math.max(.1, (+val || 0) / RATE); else l.name = val; save(); render(); };
function exportSave(){
  const blob = new Blob([JSON.stringify({app:'ptm', version:1, saved:new Date().toISOString(), state:S})], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ptm-mentes-${new Date().toISOString().slice(0, 10)}-szint${S.lv}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Játékállás letöltve.');
}
function importSave(file){
  if (!file) return;
  const r = new FileReader();
  r.onerror = () => toast('A fájl nem olvasható.');
  r.onload = () => {
    let st; try { const d = JSON.parse(r.result); st = d.state || d; } catch(e){ return toast('Hibás fájl: nem érvényes JSON.'); }
    if (!st || ![st.stops, st.lines, st.veh].every(Array.isArray) || typeof st.money !== 'number' || !st.lv) return toast('Ez a fájl nem Public Transport Manager mentés.');
    if (!confirm(`Betöltöd a mentést (${st.lv}. szint, ${st.lines.length} vonal)? A jelenlegi állás felülíródik.`)) return;
    Object.values(vm).forEach(m => map.removeLayer(m)); Object.keys(vm).forEach(k => delete vm[k]);
    S = st; if (!S.ts && S.ts !== 0) S.ts = 60; mode = null; draft = [];
    save(); drawMap(); fitAll(); ensureSegs(); render(); toast('Játékállás betöltve.');
  };
  r.readAsText(file);
}
function ensureSegs(){ S.lines.filter(l => !l.segs).forEach(async l => { await buildSegs(l); drawMap(); save(); }); }
function reset(){ if (confirm('Biztosan új játékot kezdesz? A jelenlegi állás elvész.')) { localStorage.removeItem('ptm_save'); location.reload(); } }

/* ---------- Szimuláció ---------- */
function lineLen(l){ let d = 0; for (let k = 0; k < l.stopIds.length - 1; k++) d += segOf(l, k).len; return d; }
function target(l, h){
  const act = S.veh.filter(v => v.lineId === l.id && isAct(v, h)); if (!act.length) return null;
  const st = l.stopIds.map(sid), spd = act.reduce((a, v) => a + T[v.type].kmh * (1 + .03*v.lv), 0) / act.length * 1000 / 60;
  const hw = (2 * lineLen(l) / spd) / act.length, comf = act.reduce((a, v) => a + T[v.type].comf + 4*v.lv, 0) / act.length;
  const sl = st.reduce((a, s) => a + s.lv, 0) / st.length;
  const crowd = st.reduce((a, s) => a + (s.w[l.id] || 0) / stopCap(s), 0) / st.length;
  const hwB = hw <= 8 ? 22 : hw <= 15 ? 15 : hw <= 30 ? 7 : hw <= 60 ? 0 : -10;
  const pr = l.fare > BASE_FARE ? -(l.fare / BASE_FARE - 1) * 20 : (1 - l.fare / BASE_FARE) * 8;
  return Math.max(0, Math.min(100, 30 + comf + sl * 5 + hwB - crowd * 25 + pr));
}
function arrive(v, l, s, term){
  const cap = capOf(v), out = term ? v.load : Math.round(v.load * .35); v.load -= out;
  const w = s.w[l.id] || 0, board = Math.min(cap - v.load, Math.floor(w));
  s.w[l.id] = w - board; v.load += board;
  const rev = board * l.fare; S.money += rev; l.inc += rev; l.pax += board; addXp(board * .4 + out * .1);
}
function tick(dt){
  S.min += dt; const h = hour(), day = Math.floor(S.min / 1440);
  if (day > S.day) { S.day = day; const c = S.veh.reduce((a, v) => a + T[v.type].price * .004, 0); S.money -= c; if (c) toast(`Napi üzemeltetési költség: ${fmt(c)}`); save(); }
  S.stops.forEach(s => {
    const ls = S.lines.filter(l => l.stopIds.includes(s.id) && S.veh.some(v => v.lineId === l.id && isAct(v, h)));
    ls.forEach(l => {
      const pf = Math.min(1.5, Math.max(.3, Math.pow(BASE_FARE / l.fare, .9)));
      s.w[l.id] = Math.min(stopCap(s), (s.w[l.id] || 0) + s.pop * (.5 + .25 * s.lv) * curve(h) * (.5 + l.sat / 100) * pf / ls.length * dt);
    });
  });
  S.lines.forEach(l => { const t = target(l, h); if (t !== null) l.sat += (t - l.sat) * .02 * dt; });
  S.veh.forEach(v => {
    const l = lid(v.lineId), st = l.stopIds.map(sid), m = vm[v.id];
    if (!isAct(v, h)) { v.i = 0; v.dir = 1; v.p = 0; v.load = 0; if (m) m.setOpacity(0); return; }
    let dist = T[v.type].kmh * (1 + .03 * v.lv) * 1000 / 60 * dt;
    while (dist > 0) {
      const sg = segOf(l, v.dir > 0 ? v.i : v.i - 1), d = Math.max(30, sg.len), rem = d * (1 - v.p);
      if (dist < rem) { v.p += dist / d; dist = 0; }
      else { dist -= rem; v.p = 0; v.i += v.dir; const term = v.i === st.length - 1 || v.i === 0; arrive(v, l, st[v.i], term); if (v.i === st.length - 1) v.dir = -1; else if (v.i === 0) v.dir = 1; }
    }
    if (m) { const sg = segOf(l, v.dir > 0 ? v.i : v.i - 1); m.setLatLng(ptAt(sg, (v.dir > 0 ? v.p : 1 - v.p) * sg.len)); m.setOpacity(1); }
  });
}

/* ---------- Felület ---------- */
function updateLive(){
  const h = hour(), hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor(S.min % 60)).padStart(2, '0'), ss = String(Math.floor((S.min % 1) * 60)).padStart(2, '0');
  $('#lv').textContent = S.lv; $('#title').textContent = TITLES[Math.min(7, Math.floor((S.lv - 1) / 5))];
  $('#xpbar').style.width = (S.lv >= MAXL ? 100 : S.xp / need(S.lv) * 100) + '%';
  $('#money').textContent = fmt(S.money); $('#clock').textContent = `${S.day + 1}. nap ${hh}:${mm}:${ss}`;
  $('#rate').textContent = `1 € = ${RATE.toLocaleString('hu-HU', {maximumFractionDigits:2})} Ft`; $('#rate').title = RATE_INFO;
  S.lines.forEach(l => { const e = $('#ls' + l.id); if (e) e.innerHTML = `<span class="stars">${stars(l.sat)}</span> ${Math.round(l.sat)}% – ${satLabel(l.sat)}<br>Utasok: ${Math.floor(l.pax).toLocaleString('hu-HU')} · Bevétel: ${fmt(l.inc)}`; });
  S.stops.forEach(s => { const e = $('#sw' + s.id); if (e) e.textContent = Math.floor(Object.values(s.w).reduce((a, b) => a + b, 0)); });
}
function render(){
  $('#tabs').innerHTML = [['lines','Vonalak'],['stops','Megállók'],['levels','Szintek'],['settings','Beállítások']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" onclick="setTab('${k}')">${n}</button>`).join('');
  $('#speed').innerHTML = [0,1,10,60,300,900].map(x => `<button class="${S.ts === x ? 'on' : ''}" title="${x === 1 ? 'Valós idő: 1 játékmásodperc = 1 másodperc' : x ? x + '× gyorsítás' : 'Szünet'}" onclick="S.ts=${x};render()">${x === 1 ? 'Valós idő' : x ? x + '×' : '⏸'}</button>`).join('') + '<button onclick="reset()">Új játék</button>';
  const p = $('#panel'), L = lim(S.lv); let h = '';
  if (tab === 'lines') {
    if (mode === 'line') h += `<div class="hint">Kattints a térképen a megállókra a vonal sorrendjében (${draft.length} kijelölve).</div><div class="row"><button class="btn pri" onclick="finishLine()">Kész – ${fmt(LINE_COST)}</button><button class="btn" onclick="cancelLine()">Mégse</button></div>`;
    else h += `<div class="row sp"><button class="btn pri" onclick="startLine()">+ Új vonal (${fmt(LINE_COST)})</button><span class="mute">${S.lines.length}/${L.lines} vonal · ${S.veh.length}/${L.veh} jármű</span></div>`;
    if (!S.lines.length && mode !== 'line') h += '<div class="empty">Még nincs vonalad. Építs legalább két megállót, majd kösd össze őket egy vonallal.</div>';
    S.lines.forEach(l => {
      const vs = S.veh.filter(v => v.lineId === l.id);
      h += `<div class="card" style="--c:${l.color}"><div class="row"><input type="text" class="name" value="${esc(l.name)}" onchange="setL(${l.id},'name',this.value)"><button class="btn sm" onclick="delLine(${l.id})">Törlés</button></div>
      <div id="ls${l.id}"></div><div class="mute">${l.stopIds.map(id => esc(sid(id).name)).join(' → ')} · ${(lineLen(l) / 1000).toFixed(1)} km</div>
      <div class="row">Jegyár: <input type="number" min="10" step="10" value="${Math.round(l.fare * RATE)}" onchange="setL(${l.id},'fare',this.value)"> Ft <span class="mute">(alap: ${Math.round(BASE_FARE * RATE)} Ft)</span></div>`;
      vs.forEach(v => h += `<div class="veh"><span>${T[v.type].e} ${T[v.type].n} <b>${v.lv}. sz.</b> (${capOf(v)} fő)</span>
        <span>Üzem: <input type="number" min="0" max="24" value="${v.from}" onchange="setV(${v.id},'from',this.value)">–<input type="number" min="0" max="24" value="${Math.round(v.to)}" onchange="setV(${v.id},'to',this.value)"> óra</span>
        <button class="btn sm" onclick="upVeh(${v.id})" ${v.lv >= 5 ? 'disabled' : ''}>Fejleszt ${v.lv >= 5 ? '' : fmt(vehUpCost(v))}</button><button class="btn sm" onclick="sellVeh(${v.id})">Eladás</button></div>`);
      h += `<select onchange="buyVeh(${l.id},this.value)"><option value="">+ Jármű vásárlása…</option>${Object.entries(T).map(([k, t]) => `<option value="${k}" ${t.lvl > S.lv ? 'disabled' : ''}>${t.e} ${t.n} – ${fmt(t.price)}${t.lvl > S.lv ? ' (' + t.lvl + '. szinttől)' : ''}</option>`).join('')}</select></div>`;
    });
  } else if (tab === 'stops') {
    h += `<div class="row sp"><button class="btn ${mode === 'stop' ? 'on' : 'pri'}" onclick="toggleStop()">${mode === 'stop' ? 'Építés kész' : '+ Megálló építése (' + fmt(STOP_COST) + ')'}</button><span class="mute">${S.stops.length}/${L.stops}</span></div>`;
    if (mode === 'stop') h += '<div class="hint">Kattints a térképen oda, ahová a megállót szeretnéd.</div>';
    if (!S.stops.length) h += '<div class="empty">Még nincs megállód.</div>';
    S.stops.forEach(s => h += `<div class="card"><div class="row"><input type="text" class="name" value="${esc(s.name)}" onchange="sid(${s.id}).name=this.value;save();drawMap()"><button class="btn sm" onclick="map.setView([${s.lat},${s.lng}],16)">Mutasd</button></div>
      <div class="row sp"><span>Szint <b>${s.lv}/5</b> · várakozók: <b id="sw${s.id}">0</b>/${stopCap(s)}</span><button class="btn sm" onclick="upStop(${s.id})" ${s.lv >= 5 ? 'disabled' : ''}>Fejleszt ${s.lv >= 5 ? '' : fmt(stopUpCost(s))}</button></div></div>`);
  } else if (tab === 'settings') {
    h += `<div class="card"><h3>Játékállás</h3><span class="mute">A játék 10 másodpercenként automatikusan menti magát ebbe a böngészőbe. Fájlba mentve áthelyezheted másik gépre, vagy biztonsági másolatot készíthetsz.</span>
      <div class="row"><button class="btn pri" onclick="exportSave()">Mentés fájlba</button>
      <button class="btn" onclick="document.getElementById('imp').click()">Betöltés fájlból</button>
      <input type="file" id="imp" accept=".json,application/json" hidden onchange="importSave(this.files[0]);this.value=''"></div>
      <div class="row"><button class="btn" onclick="save();toast('Mentve a böngészőbe.')">Mentés a böngészőbe most</button></div></div>
      <div class="card"><h3>Térkép</h3><div class="row"><button class="btn" onclick="fitAll()">Teljes hálózat megtekintése</button></div>
      <span class="mute">Indításkor és betöltéskor a térkép automatikusan az összes megállóra és vonalra áll rá.</span></div>
      <div class="card"><h3>Új játék</h3><span class="mute">Törli a böngészőben tárolt mentést. Előtte érdemes fájlba menteni.</span><div class="row"><button class="btn" onclick="reset()">Új játék indítása</button></div></div>`;
  } else {
    h += `<div class="mute">XP: ${Math.floor(S.xp)} / ${S.lv >= MAXL ? '–' : need(S.lv)} · Utasok szállítása, építés és fejlesztés ad XP-t.</div>`;
    for (let l = 1; l <= MAXL; l++) {
      const un = Object.values(T).filter(t => t.lvl === l).map(t => t.e + ' ' + t.n);
      h += `<div class="lvrow ${l < S.lv ? 'done' : l === S.lv ? 'cur' : ''}"><b>${l}.</b><span>${TITLES[Math.floor((l - 1) / 5)]} · ${l > 1 ? 'jutalom ' + fmt(250 * l) : 'kezdés'}<br><span class="mute">${lim(l).stops} megálló · ${lim(l).lines} vonal · ${lim(l).veh} jármű${un.length ? ' · új: ' + un.join(', ') : ''}</span></span></div>`;
    }
  }
  p.innerHTML = h; updateLive();
}

/* ---------- Indítás ---------- */
(async () => {
  try { const r = await (await fetch('/api/rate')).json(); RATE = r.rate; RATE_INFO = `${r.source} ${r.date}`; if (!r.live) toast('Az élő árfolyam nem érhető el, tartalék értéket használok.'); } catch (e) { RATE_INFO = 'tartalék érték'; }
  drawMap(); fitAll(); render(); ensureSegs();
  let last = performance.now(), lu = 0;
  const frame = n => {
    const real = Math.min((n - last) / 1000, .25); last = n;   // másodperc, a háttérben töltött idő nem ugrik
    if (S.ts > 0 && real > 0) tick(real * S.ts / 60);          // tick() játékperceket vár
    if (n - lu > 250) { updateLive(); lu = n; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setInterval(save, 10000);
  setInterval(() => { if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') render(); }, 5000);
})();
