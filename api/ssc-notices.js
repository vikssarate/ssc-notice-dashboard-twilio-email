// api/ssc-notices.js
// Force Node runtime (Cheerio needs Node, not Edge)
export const config = { runtime: "nodejs18.x" };

import * as cheerio from "cheerio";

// Use the platform's built-in fetch (Vercel Node 18+)
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const BASE = "https://ssc.gov.in";
const PAGES = [
  `${BASE}/notice-board`,
  `${BASE}/noticeboard`,
  `${BASE}/Notices`,
  BASE
];

// ---------- helpers ----------
function safeAbsUrl(href, base = BASE) {
  try {
    if (!href) return null;
    // Skip javascript: and mailto:
    if (/^\s*(javascript:|data:|mailto:)/i.test(href)) return null;
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function categoriesFrom(text = "") {
  const t = text.toUpperCase();
  const s = new Set();
  const add = (x) => s.add(x);
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

function nearDate(s = "") {
  const m = s.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4}/i
  );
  return m ? m[0] : "";
}
function nearSize(s = "") {
  const m = s.match(/\((\d+(?:\.\d+)?)\s*(KB|MB|GB)\)/i);
  return m ? m[0] : "";
}
function uniq(items, key = "pdf") {
  const seen = new Set();
  return items.filter((x) => {
    const k = x[key] || x.title;
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchWithTimeout(url, { timeoutMs = 15000, ...opts } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, referer: BASE },
      signal: ctrl.signal,
      ...opts
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html || html.length < 500) throw new Error("empty HTML");
    return html;
  } finally {
    clearTimeout(t);
  }
}

async function getFirstWorking() {
  let lastErr;
  for (const url of PAGES) {
    try {
      const html = await fetchWithTimeout(url);
      return { url, html };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Could not fetch SSC Notice Board");
}

function parse(html, base = BASE) {
  const $ = cheerio.load(html);
  const items = [];

  // Two passes: rich selectors, then fall back to any PDF links
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
        const href = safeAbsUrl($a.attr("href"), base);
        if (!href) return;

        const title = ($a.text() || $a.attr("title") || $el.text() || "")
          .replace(/\s+/g, " ")
          .trim();

        const blob = ($el.text() || "").replace(/\s+/g, " ").trim();
        const date = nearDate(blob);
        const size = nearSize(blob);
        const categories = categoriesFrom(title);

        let view = "";
        const cand = $a
          .closest("div,li,tr,section,article")
          .find("a")
          .filter((i, ax) => {
            const t = $(ax).text();
            const h = $(ax).attr("href") || "";
            return /view|preview|eye|details/i.test(t) || /view/i.test(h);
          });
        if (cand.length) {
          const v = safeAbsUrl($(cand[0]).attr("href"), base);
          if (v) view = v;
        }

        items.push({ title: title || "Untitled", pdf: href, view, date, size, categories });
      });
    });
    if (items.length) break;
  }

  if (!items.length) {
    $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, a) => {
      const $a = $(a);
      const href = safeAbsUrl($a.attr("href"), base);
      if (!href) return;
      const title = ($a.text() || $a.attr("title") || "")
        .replace(/\s+/g, " ")
        .trim();
      const near = $a
        .closest("li,div,tr,section,article")
        .text()
        .replace(/\s+/g, " ")
        .trim();
      items.push({
        title: title || "Untitled",
        pdf: href,
        date: nearDate(near),
        size: nearSize(near),
        categories: categoriesFrom(title)
      });
    });
  }

  return uniq(items).map((x) => ({ ...x, ts: x.date ? Date.parse(x.date) || null : null }));
}

// ---------- handler ----------
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  try {
    const { url, html } = await getFirstWorking();
    const items = parse(html);
    res.status(200).json({ source: url, count: items.length, items });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e), items: [] });
  }
}
