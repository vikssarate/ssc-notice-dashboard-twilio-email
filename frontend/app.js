const API_BASE = '/api';
const CATEGORIES = ['ALL','JE','CHSL','STENO','CGL','MTS','CAPF','CPO','GD','DEPARTMENTAL','OTHERS'];
const chipsEl = document.getElementById('chips');
const listEl  = document.getElementById('list');
const countEl = document.getElementById('count');
const qEl     = document.getElementById('q');
const fromEl  = document.getElementById('from');
const toEl    = document.getElementById('to');
const refreshEl = document.getElementById('refresh');
const alertsBtn = document.getElementById('alerts');

let data = [];
let activeCat = 'ALL';

function chip(cat){
  const el = document.createElement('button');
  el.className = 'chip' + (cat===activeCat? ' active':'');
  el.textContent = cat;
  el.onclick = () => { activeCat = cat; render(); };
  return el;
}

function fmtDate(d){ try { return new Date(d).toLocaleDateString(); } catch { return d; } }

function passFilters(n){
  if(activeCat!=='ALL' && !(n.categories||[]).includes(activeCat)) return false;
  const q = qEl.value.trim().toLowerCase();
  if(q && !(`${n.title} ${n.date} ${(n.categories||[]).join(' ')}`.toLowerCase().includes(q))) return false;
  const f = fromEl.value ? new Date(fromEl.value) : null;
  const t = toEl.value ? new Date(toEl.value) : null;
  if(f || t){
    const nd = new Date(n.date || n.ts || Date.now());
    if(f && nd < f) return false;
    if(t && nd > new Date(t.getTime()+24*3600*1000)) return false;
  }
  return true;
}

function card(n){
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="row1">
      <div class="title">${n.title || 'Untitled'} ${(n.categories||[]).map(c=>`<span class="badge">${c}</span>`).join('')}</div>
      <div class="meta"><span>${fmtDate(n.date)}</span><span>${n.size||''}</span></div>
    </div>
    <div class="links">
      ${n.pdf ? `<a href="${n.pdf}" target="_blank" rel="noopener">PDF</a>` : ''}
      ${n.view ? `<a href="${n.view}" target="_blank" rel="noopener">View</a>` : ''}
    </div>`;
  return el;
}

function render(){
  chipsEl.innerHTML=''; CATEGORIES.forEach(c=>chipsEl.appendChild(chip(c)));
  const filtered = data.filter(passFilters);
  countEl.textContent = `${filtered.length} notice(s)`;
  listEl.innerHTML=''; filtered.forEach(n=>listEl.appendChild(card(n)));
}

async function load(){
  try{
    const res = await fetch(`${API_BASE}/ssc-notices`);
    const json = await res.json();
    data = json.items || [];
  }catch(e){ console.error(e); data=[]; }
  render();
}

refreshEl.onclick = load;

alertsBtn.onclick = async () => {
  try{
    const pub = await (await fetch(`${API_BASE}/vapid-public-key`)).json();
    const reg = await navigator.serviceWorker.register('./sw.js');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pub.key)
    });
    await fetch(`${API_BASE}/subscribe`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(sub) });
    alert('Alerts enabled!');
  }catch(e){ console.error(e); alert('Failed to enable alerts'); }
};

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i=0;i<rawData.length;i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

window.addEventListener('load', load);
