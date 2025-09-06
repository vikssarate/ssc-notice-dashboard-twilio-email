// api/ssc-notices.js

// Run on Node (not Edge) and prefer Singapore region (closer to SSC)
export const config = { runtime: "nodejs", regions: ["sin1"] };

import { load as loadHTML } from "cheerio";

const BASE = "https://ssc.gov.in";
const PAGES = [
  `${BASE}/notice-board`,
  `${BASE}/noticeboard`,
  `${BASE}/Notices`,
  BASE
];

// Slightly shorter timeout so requests never “hang” too long
const TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 8000);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---- helpers ----
function absUrl(href, base = BASE) {
  try {
    if (!href) return null;
    if (/^\s*(javascript:|data:|mailto:)/i.test(href)) return null;
    return new URL(href, base).toString();
  } catch { return null; }
}

function categoriesFrom(text = "") {
  const t = text.toUpperCase(), s = new Set(), add = x => s.add(x);
  if (/\bJE\b/.test(t) || t.includes("JUNIOR ENGINEER")) add("JE");
  if (/\bCHSL\b/.test(t)) add("CHSL");
  if (/\bSTENO\b/.test(t) || t.includes("STENOGRAPHER")) add("STENO");
  if (/\bCGL\b/.test(t)) add("CGL");
  if (/\bMTS\b/.test(t)) add("MTS");
  if (/\bCAPF\b/.test(t)) add("CAPF");
  if (/\bCPO\b/.test(t)) add("CPO");
  if (/\bGD\b/.test(t)) add("GD");
  if (/\bDEPARTMENTAL\b/.test(t)) add("DEPARTMENTAL");
  return [...s];
}

const nearDate = (s="") =>
  (s.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4}/i) || [""])[0];

const nearSize = (s="") =>
  (s.match(/\((\d+(?:\.\d+)?)\s*(KB|MB|GB)\)/i) || [""])[0];

function uniq(items, key = "pdf") {
  const seen = new Set();
  return items.filter(x => {
    const k = x[key] || x.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchWithTimeout(url, { timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, referer: BASE },
      signal: ctrl.signal,
      redirect: "follow"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html || html.length < 400) throw new Error("empty HTML");
    return html;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch all candidates concurrently and return the first success
async function getFirstWorking() {
  const tries = await Promise.allSettled(
    PAGES.map(async url => ({ url, html: await fetchWithTimeout(url) }))
  );
  for (const t of tries) if (t.status === "fulfilled") return t.value;
  const reasons = tries
    .filter(t => t.status === "rejected")
    .map(t => t.reason?.message || String(t.reason))
    .join(" | ");
  throw new Error(`All SSC pages failed: ${reasons}`);
}

function parse(html, base = BASE) {
  const $ = loadHTML(html);
  const items = [];

  const containers = [
    ".notice-list, .notices, .list-group, [class*='notice'], [id*='notice']",
    ".card, li, tr, article, section"
  ];

  for (const sel of containers) {
    $(sel).each((_, el) => {
      const $el = $(el);
      const $pdfs = $el.find('a[href$=".pdf"], a[href*=".pdf?"]');
      if (!$pdfs.length) return;

      $pdfs.each((__, a) => {
        const $a = $(a);
        const href = absUrl($a.attr("href"), base);
        if (!href) return;

        const title = ($a.text() || $a.attr("title") || $el.text() || "")
          .replace(/\s+/g, " ")
          .trim();

        const blob = ($el.text() || "").replace(/\s+/g, " ").trim();
        const date = nearDate(blob);
        const size = nearSize(blob);
        const categories = categoriesFrom(title);

        let view = "";
        const cand = $a.closest("div,li,tr,section,article")
          .find("a")
          .filter((i, ax) => {
            const t = $(ax).text();
            const h = $(ax).attr("href") || "";
            return /view|preview|eye|details/i.test(t) || /view/i.test(h);
          });
        if (cand.length) {
          const v = absUrl($(cand[0]).attr("href"), base);
          if (v) view = v;
        }

        items.push({
          title: title || "Untitled",
          pdf: href,
          view,
          date,
          size,
          categories
        });
      });
    });
    if (items.length) break;
  }

  if (!items.length) {
    $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, a) => {
      const $a = $(a);
      const href = absUrl($a.attr("href"), base);
      if (!href) return;
      const title = ($a.text() || $a.attr("title") || "")
        .replace(/\s+/g, " ")
        .trim();
      const near = $a.closest("li,div,tr,section,article").text().replace(/\s+/g, " ").trim();
      items.push({
        title: title || "Untitled",
        pdf: href,
        date: nearDate(near),
        size: nearSize(near),
        categories: categoriesFrom(title)
      });
    });
  }

  return uniq(items).map(x => ({ ...x, ts: x.date ? Date.parse(x.date) || null : null }));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  try {
    const { url, html } = await getFirstWorking();
    const items = parse(html);
    res.status(200).json({ source: url, count: items.length, items });
  } catch (e) {
    res.status(504).json({ error: String(e?.message || e), items: [] });
  }
}
