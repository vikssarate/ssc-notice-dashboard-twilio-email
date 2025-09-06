// api/ssc-notices.js
// Run on Node.js runtime for best compatibility on Vercel
export const config = { runtime: "nodejs" };

import cheerio from "cheerio";

const ORIGIN = "https://ssc.gov.in";
const CANDIDATE_URLS = [
  `${ORIGIN}/`,
  `${ORIGIN}/notice-board`,
  `${ORIGIN}/noticeboard`,
  `${ORIGIN}/Notices`,
];

const ua =
  "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const clean = (t = "") => t.replace(/\s+/g, " ").replace(/&amp;/g, "&").trim();

const abs = (href, base = ORIGIN) => {
  try {
    if (!href) return null;
    return new URL(href, base).toString();
  } catch {
    return null;
  }
};

function normalizeCategory(t = "") {
  t = t.toUpperCase();
  const s = new Set();
  const a = (c) => s.add(c);
  if (/\bJE\b/.test(t) || t.includes("JUNIOR ENGINEER")) a("JE");
  if (/\bCHSL\b/.test(t)) a("CHSL");
  if (/\bSTENO\b/.test(t) || t.includes("STENOGRAPHER")) a("STENO");
  if (/\bCGL\b/.test(t)) a("CGL");
  if (/\bMTS\b/.test(t)) a("MTS");
  if (/\bCAPF\b/.test(t)) a("CAPF");
  if (/\bCPO\b/.test(t)) a("CPO");
  if (/\bGD\b/.test(t)) a("GD");
  if (/\bDEPARTMENTAL\b/.test(t)) a("DEPARTMENTAL");
  return [...s];
}

const parseDateNear = (txt = "") => {
  const m = txt.match(
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{4}/i
  );
  return m ? m[0] : "";
};

const parseSizeNear = (txt = "") => {
  const m = txt.match(/\((\d+(?:\.\d+)?)\s*(KB|MB|GB)\)/i);
  return m ? m[0] : "";
};

const uniqueBy = (arr, key = "pdf") => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = x[key] || x.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

async function fetchFirstWorking() {
  for (const url of CANDIDATE_URLS) {
    try {
      const r = await fetch(url, {
        headers: { "user-agent": ua, accept: "text/html,*/*" },
        cache: "no-store",
      });
      if (!r.ok) continue;
      const html = await r.text();
      // crude sanity check that page is not empty
      if (html && /Notice/i.test(html)) return { url, html };
    } catch {
      // try next
    }
  }
  throw new Error("Could not fetch SSC Notice Board");
}

function parseHTML(html, base = ORIGIN) {
  const $ = cheerio.load(html);
  const items = [];

  // Prefer a section containing "Notice Board"
  const board =
    $('section:contains("Notice Board")').first().length
      ? $('section:contains("Notice Board")').first()
      : $("body");

  // Primary: list items with PDF anchors
  board.find("li a[href]").each((_, a) => {
    const $a = $(a);
    const href = abs($a.attr("href"), base);
    if (!href || !/\.pdf(\?|$)/i.test(href)) return;

    const li = $a.closest("li,div,tr");
    const title = clean($a.text()) || clean(li.text()) || "SSC Notice";

    const near = clean(li.text());
    const date = parseDateNear(near);
    const size = parseSizeNear(near);
    const categories = normalizeCategory(title);

    // try to find a companion "view/details" link
    let view = "";
    const sib = li
      .find("a")
      .filter(
        (i, el) =>
          /view|eye|details/i.test($(el).text()) ||
          /view/i.test($(el).attr("href") || "")
      )
      .first();
    if (sib.length) view = abs(sib.attr("href"), base) || "";

    items.push({ title, pdf: href, view, date, size, categories });
  });

  // Fallback: any PDF anchors on the page
  if (items.length === 0) {
    $("a[href$='.pdf'], a[href*='.pdf?']").each((_, a) => {
      const href = abs($(a).attr("href"), base);
      if (!href) return;
      const title = clean($(a).text()) || "SSC Notice";
      const near = clean($(a).closest("li,div,tr,section,article").text());
      const date = parseDateNear(near);
      const size = parseSizeNear(near);
      const categories = normalizeCategory(title);
      items.push({ title, pdf: href, date, size, categories });
    });
  }

  // dedupe and attach timestamp
  return uniqueBy(items).map((x) => ({ ...x, ts: Date.parse(x.date) || null }));
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    const { html, url } = await fetchFirstWorking();
    const items = parseHTML(html, ORIGIN);
    return res.status(200).json({ ok: true, source: url, count: items.length, items });
  } catch (e) {
    return res
      .status(200)
      .json({ ok: false, error: String(e?.message || e), items: [] });
  }
}
