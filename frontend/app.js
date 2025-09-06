// /frontend/app.js
// Drives the Coaching Updates panel

const $ = (id) => document.getElementById(id);

const state = {
  only: "jobs,admit-card,result",
  limit: 60,
  debug: 1,                 // set 0 to hide source errors
  cacheTtlSec: 600,         // 10 minutes client cache
  q: "",                    // search text
};

function cacheKey() {
  return `coachFeed:v1:only=${state.only}&limit=${state.limit}`;
}

function saveCache(payload) {
  try {
    localStorage.setItem(
      cacheKey(),
      JSON.stringify({ t: Date.now(), payload })
    );
  } catch {}
}

function readCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return null;
    const { t, payload } = JSON.parse(raw);
    if (Date.now() - t > state.cacheTtlSec * 1000) return null;
    return payload;
  } catch { return null; }
}

async function fetchCoachFeed() {
  const params = new URLSearchParams({
    only: state.only,
    limit: String(state.limit),
    debug: String(state.debug),
  });

  // Try /api/coach first (simple name avoids filename issues)
  let res = await fetch(`/api/coach?${params}`);
  if (res.status === 404) {
    // Fallback alias
    res = await fetch(`/api/coaching-notices?${params}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function render(listEl, metaEl, data) {
  const term = state.q.trim().toLowerCase();
  const items = (data.items || []).filter(x =>
    !term ||
    x.title.toLowerCase().includes(term) ||
    x.source.toLowerCase().includes(term) ||
    x.channel.toLowerCase().includes(term)
  );

  listEl.innerHTML = items.map(it => `
    <li class="row">
      <span class="chip">${escapeHtml(it.source)}</span>
      <span class="chip">${escapeHtml(it.channel)}</span>
      <a href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
      ${it.date ? `<time>${new Date(it.date).toLocaleDateString()}</time>` : "<span></span>"}
    </li>
  `).join("") || `<li class="row"><span>No items.</span></li>`;

  metaEl.textContent = `Showing ${items.length} • Updated ${new Date(data.updatedAt).toLocaleTimeString()}`;
}

function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m])); }

async function load() {
  const list = $("list");
  const meta = $("meta");
  if (!list || !meta) return;

  list.innerHTML = `<li class="row">Loading…</li>`;

  const cached = readCache();
  if (cached) render(list, meta, cached);

  try {
    const data = await fetchCoachFeed();
    render(list, meta, data);
    saveCache(data);

    // Optional: log per-source failures when debug=1
    if (state.debug && data.errors?.length) {
      console.info("Source errors:", data.errors);
    }
  } catch (e) {
    list.innerHTML = `<li class="row" style="color:#ff7575">Error loading feed: ${escapeHtml(String(e.message||e))}</li>`;
    meta.textContent = "";
  }
}

/* ---------- wire up controls ---------- */
function setupUI() {
  const onlySel = $("only");
  const qInp = $("q");
  const reloadBtn = $("reload");

  if (onlySel) {
    onlySel.addEventListener("change", () => {
      state.only = onlySel.value || "";
      load();
    });
  }
  if (qInp) {
    qInp.addEventListener("input", () => {
      state.q = qInp.value || "";
      // re-render from cache instantly for snappy filter
      const cached = readCache();
      if (cached) render($("list"), $("meta"), cached);
    });
  }
  if (reloadBtn) reloadBtn.addEventListener("click", load);
}

window.addEventListener("DOMContentLoaded", () => {
  setupUI();
  load();
});
