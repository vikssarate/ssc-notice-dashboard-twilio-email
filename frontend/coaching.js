// /frontend/coaching.js — coaching-only UI for /api/coach
const $ = (id) => document.getElementById(id);

const BRANDS = [
  "T.I.M.E.","Adda247","Testbook","Oliveboard","BYJU'S Exam Prep",
  "Career Power","PracticeMock","Guidely","ixamBee",
  "BankersDaily","AffairsCloud","Aglasem","StudyIQ","Examstocks"
];

const state = {
  only: "jobs,admit-card,result",
  limit: 80,
  debug: 0,
  q: "",
  sources: new Set() // empty = all
};

function buildSourceQuery() {
  if (!state.sources.size) return "";
  const s = [...state.sources].map(x => x.toLowerCase());
  return "&source=" + encodeURIComponent(s.join(","));
}

async function fetchFeed() {
  const url = `/api/coach?only=${encodeURIComponent(state.only)}&limit=${state.limit}&debug=${state.debug}${buildSourceQuery()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderBrands() {
  const wrap = $("brands");
  wrap.innerHTML = BRANDS.map(b => `<span class="brand" data-b="${b}">${b}</span>`).join("");
  wrap.addEventListener("click", (e) => {
    const el = e.target.closest(".brand"); if (!el) return;
    const b = el.dataset.b;
    if (state.sources.has(b)) state.sources.delete(b); else state.sources.add(b);
    el.classList.toggle("active");
    load();
  });
}

function renderList(data) {
  const term = state.q.trim().toLowerCase();
  const items = (data.items || []).filter(x =>
    !term || x.title.toLowerCase().includes(term) || x.source.toLowerCase().includes(term)
  );

  $("list").innerHTML = items.map(it => `
    <li>
      <span class="chip">${escapeHtml(it.source)}</span>
      <span class="chip">${escapeHtml(it.channel)}</span>
      <a href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
      ${it.date ? `<time>${new Date(it.date).toLocaleDateString()}</time>` : "<span></span>"}
    </li>
  `).join("") || `<li>No items.</li>`;

  $("meta").textContent = `· ${items.length} items · updated ${new Date(data.updatedAt).toLocaleTimeString()}`;
}

function escapeHtml(s){return (s||"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

async function load() {
  $("list").innerHTML = `<li>Loading…</li>`;
  try {
    const data = await fetchFeed();
    renderList(data);
  } catch (e) {
    $("list").innerHTML = `<li style="color:#ff7575">Error: ${escapeHtml(String(e.message||e))}</li>`;
    $("meta").textContent = "";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  renderBrands();
  $("only").addEventListener("change", () => { state.only = $("only").value; load(); });
  $("q").addEventListener("input", () => { state.q = $("q").value; load(); });
  $("reload").addEventListener("click", load);
  load();
});
