// api/ssc-notices.js
// Scrape SSC notice-board PDFs (robust + timeouts)
export const config = { runtime: "nodejs18.x" };

import * as cheerio from "cheerio";           // safer across setups
const loadHTML = cheerio.load;

const BASE = "https://ssc.gov.in";
const CANDIDATE_PATHS = [
  "/notice-board",
  "/noticeboard",
  "/notices",
  "/Notices",
  "/"
];
const PAGES = CANDIDATE_PATHS.map(p => new URL(p, BASE).toString());

const TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS || 10000);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------------- helpers ---------------- */
function absUrl(href, base = BASE) {
  try {
    if (!href) return null;
    if (/^\s*(javascript:|data:|mailto:)/i.test(href)) return null;
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function categoriesFrom(text = "") {
  const t = text.toUpperCase(), s = new Set();
  if (/\bJE\b/.test(t) || t.includes("JUNIOR ENGINEER")) s.add("JE");
  if (/\bCHSL\b/.test(t)) s.add("CHSL");
  if (/\bSTENO\b/.test(t) || t.includes("STENOGRAPHER")) s.add("STENO");
  if (/\bCGL\b/.test(t)) s.add("CGL");
  if (/\bMTS\b/.test(t)) s.add("MTS");
  if (/\bCAPF\b/.test(t)) s.add("CAPF");
  if (/\bCPO\b/.test(t)) s.add("CPO");
  if (/\bGD\b/.test(t)) s.add("GD");
  if (/\bDEPARTMENTAL\b/.test(t)) s.add("DEPARTMENTAL");
  return [...s];
}

const nearDate = (s = "") =>
  (s.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4}/i
  ) || [""])[0];

const nearSize = (s = "") => (s.match(/\((\d+(?:\.\d+)?)\s*(KB|MB|GB)\)/i) || [""])[0];

function uniq(items, key = x => x.pdf || x.title) {
  const seen = new Set();
  return items.filter(x => {
    const k = key(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchWithTimeout(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Timeout")), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, referer: BASE, accept: "text/html,*/*" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html || html.length < 400) throw new Error("Empty HTML");
    return html;
  } finally {
    clearTimeout(timer);
  }
}

// Try all candidate pages in parallel; return first success
async function firstWorkingPage() {
  const tasks = PAGES.map(async (url) => {
    const html = await fetchWithTimeout(url);
    return { url, html };
  });

  // Manual "any" with detailed reasons (keeps Node 18 happy)
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === "fulfilled") return r.value;

  const reasons = results
    .filter(r => r.status === "rejected")
    .map(r => String(r.reason?.message || r.reason))
    .join(" | ");
  throw new Error(`All SSC pages failed: ${reasons}`);
}

/* ---------------- parser ---------------- */
function parse(html, base = BASE) {
  const $ = loadHTML(html);
  const items = [];

  const containers = [
    ".notice-list, .notices, .list-group, [class*='notice'], [id*='notice']",
    ".card, li, tr, article, section, div"
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

        // try to locate a "view/details" link near the PDF
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
          const v = absUrl($(cand[0]).attr("href"), base);
          if (v) view = v;
        }

        items.push({
          title: title || "Untitled",
          pdf: href,
          view,
          date,
          size,
          categories,
        });
      });
    });
    if (items.length) break;
  }

  // last-resort: scan all <a> for PDFs
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
        categories: categoriesFrom(title),
      });
    });
  }

  return uniq(items).map(x => ({ ...x, ts: x.date ? (Date.parse(x.date) || null) : null }));
}

/* ---------------- handler ---------------- */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

  try {
    const debug = req.query?.debug === "1";
    const { url, html } = await firstWorkingPage();
    const items = parse(html);

    const body = { ok: true, source: url, count: items.length, items };
    if (debug) body.sample = html.slice(0, 500);
    res.status(200).json(body);
  } catch (e) {
    // Return 504 but never crash the function
    res.status(504).json({ ok: false, error: String(e?.message || e), items: [] });
  }
}
