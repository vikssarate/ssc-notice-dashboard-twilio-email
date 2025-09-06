// api/coaching-notices.js
// Aggregates gov-exam updates from multiple coaching/ed-prep sites
export const config = { runtime: "nodejs18.x" };

import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const abs = (href, base) =>
  href?.startsWith("http") ? href : href ? new URL(href, base).toString() : null;

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

/* ===================== Generic parsers ===================== */
// Works well for most WordPress/news themes
function parseWordpressList(html, base, channel, sourceLabel) {
  const $ = cheerio.load(html);
  const items = [];

  const pick = (root) => {
    const a =
      root.find("h2 a[href], h3 a[href], .entry-title a[href], a[rel='bookmark'], .post-title a[href]")
          .first();
    const title = (a.text() || "").trim();
    const url = abs(a.attr("href"), base);
    if (!title || !url) return;

    const dateTxt =
      root.find("time").attr("datetime") ||
      root.find("time").text().trim() ||
      root.find("[class*='date'], .posted-on, .post-date, .elementor-post-date").first().text().trim() ||
      null;

    items.push({ source: sourceLabel, channel, title, url, date: dateTxt || null });
  };

  $("article").each((_, el) => pick($(el)));
  if (!items.length) $(".post, .blog-post, .td-module-container, .elementor-post, li, .card")
    .each((_, el) => pick($(el)));

  return items;
}

/* ===================== T.I.M.E. specific ===================== */
function parseTIME_NotRes(html) {
  const $ = cheerio.load(html);
  const out = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 3) {
      const typeTxt = $(tds[0]).text().trim().toLowerCase();
      const a = $(tds[1]).find("a").first();
      const title = a.text().trim();
      const url = abs(a.attr("href"), "https://www.time4education.com/");
      const date = $(tds[2]).text().trim() || null;
      if (title && url) {
        const channel = typeTxt.includes("result")
          ? "result"
          : typeTxt.includes("noti")
          ? "notification"
          : "news";
        out.push({ source: "T.I.M.E.", channel, title, url, date });
      }
    }
  });
  return out;
}
function parseTIME_Blocks(html) {
  const $ = cheerio.load(html);
  const out = [];
  const collect = (needle, channel) => {
    $("h2").each((_, h) => {
      const txt = $(h).text().trim().toLowerCase();
      if (!txt.includes(needle)) return;
      let el = $(h).next();
      while (el.length && el.prop("tagName")?.toLowerCase() !== "h2") {
        el.find("a[href]").each((__, A) => {
          const title = $(A).text().trim();
          const url = abs($(A).attr("href"), "https://www.time4education.com/");
          if (title && url) out.push({ source: "T.I.M.E.", channel, title, url, date: null });
        });
        el = el.next();
      }
    });
  };
  collect("notifications / results", "notification");
  collect("news / articles", "news");
  return out;
}

/* ===================== Source builders ===================== */
function makeWPScraper(label, base, pages) {
  // pages: [{url, channel}]
  return async function scrape() {
    const results = [];
    for (const p of pages) {
      try {
        const html = await fetchHTML(p.url);
        results.push(...parseWordpressList(html, base, p.channel, label));
      } catch {
        /* ignore per-source failure */
      }
    }
    return results;
  };
}

/* ===================== Sources ===================== */
// Already had: Testbook, Adda247, Oliveboard, T.I.M.E.
const scrapeTestbook = makeWPScraper("Testbook", "https://testbook.com", [
  { url: "https://testbook.com/blog/latest-govt-jobs/", channel: "jobs" },
  { url: "https://testbook.com/blog/admit-card/", channel: "admit-card" },
  { url: "https://testbook.com/blog/results/", channel: "result" },
]);

const scrapeAdda247 = makeWPScraper("Adda247", "https://www.adda247.com", [
  { url: "https://www.adda247.com/jobs/", channel: "jobs" },
  { url: "https://www.adda247.com/tag/admit-card/", channel: "admit-card" },
  { url: "https://www.adda247.com/sarkari-result/", channel: "result" },
]);

const scrapeOliveboard = makeWPScraper("Oliveboard", "https://www.oliveboard.in", [
  { url: "https://www.oliveboard.in/blog/category/recruitment/", channel: "jobs" },
  { url: "https://www.oliveboard.in/blog/category/admit-cards/", channel: "admit-card" },
  { url: "https://www.oliveboard.in/blog/category/results/", channel: "result" },
]);

async function scrapeTIME() {
  const list1 = "https://www.time4education.com/local/articlecms/all.php?types=notres";
  const list2 = "https://www.time4education.com/local/articlecms/all.php?course=Bank&type=articles";
  const out = [];
  try {
    const html = await fetchHTML(list1);
    out.push(...parseTIME_NotRes(html));
  } catch {}
  try {
    const html = await fetchHTML(list2);
    out.push(...parseTIME_Blocks(html));
  } catch {}
  return out;
}

/* ===== NEW coaching/ed-prep sources ===== */

// BYJU'S Exam Prep (blog)
const scrapeByjusExamPrep = makeWPScraper("BYJU'S Exam Prep", "https://byjusexamprep.com", [
  { url: "https://byjusexamprep.com/blog/category/government-jobs/", channel: "jobs" },
  { url: "https://byjusexamprep.com/blog/category/admit-cards/", channel: "admit-card" },
  { url: "https://byjusexamprep.com/blog/category/results/", channel: "result" },
]);

// Career Power (Adda247 brand)
const scrapeCareerPower = makeWPScraper("Career Power", "https://www.careerpower.in", [
  { url: "https://www.careerpower.in/blog/category/government-jobs", channel: "jobs" },
  { url: "https://www.careerpower.in/blog/tag/admit-card", channel: "admit-card" },
  { url: "https://www.careerpower.in/blog/category/results", channel: "result" },
]);

// PracticeMock
const scrapePracticeMock = makeWPScraper("PracticeMock", "https://www.practicemock.com", [
  { url: "https://www.practicemock.com/blog/", channel: "news" }, // mixed; classifier handled by title on UI
]);

// Guidely
const scrapeGuidely = makeWPScraper("Guidely", "https://guidely.in", [
  { url: "https://guidely.in/blog/category/exams/notifications", channel: "notification" },
  { url: "https://guidely.in/blog/category/exams/admit-card", channel: "admit-card" },
  { url: "https://guidely.in/blog/category/exams/result", channel: "result" },
]);

// ixamBee
const scrapeIxamBee = makeWPScraper("ixamBee", "https://www.ixambee.com", [
  { url: "https://www.ixambee.com/blog/category/jobs", channel: "jobs" },
  { url: "https://www.ixambee.com/blog/category/admit-card", channel: "admit-card" },
  { url: "https://www.ixambee.com/blog/category/result", channel: "result" },
]);

// BankersDaily (RACE Institute)
const scrapeBankersDaily = makeWPScraper("BankersDaily", "https://www.bankersdaily.in", [
  { url: "https://www.bankersdaily.in/category/exams/recruitment/", channel: "jobs" },
  { url: "https://www.bankersdaily.in/category/admit-card/", channel: "admit-card" },
  { url: "https://www.bankersdaily.in/category/results/", channel: "result" },
]);

// AffairsCloud
const scrapeAffairsCloud = makeWPScraper("AffairsCloud", "https://affairscloud.com", [
  { url: "https://affairscloud.com/jobs/", channel: "jobs" },
  { url: "https://affairscloud.com/tag/admit-card/", channel: "admit-card" },
  { url: "https://affairscloud.com/tag/result/", channel: "result" },
]);

// Aglasem
const scrapeAglasem = makeWPScraper("Aglasem", "https://aglasem.com", [
  { url: "https://aglasem.com/category/jobs/", channel: "jobs" },
  { url: "https://aglasem.com/category/admit-card/", channel: "admit-card" },
  { url: "https://aglasem.com/category/result/", channel: "result" },
]);

// StudyIQ
const scrapeStudyIQ = makeWPScraper("StudyIQ", "https://studyiq.com", [
  { url: "https://studyiq.com/category/jobs/", channel: "jobs" },
  { url: "https://studyiq.com/category/admit-card/", channel: "admit-card" },
  { url: "https://studyiq.com/category/result/", channel: "result" },
]);

// Examstocks
const scrapeExamstocks = makeWPScraper("Examstocks", "https://www.examstocks.com", [
  { url: "https://www.examstocks.com/category/jobs/", channel: "jobs" },
  { url: "https://www.examstocks.com/category/admit-card/", channel: "admit-card" },
  { url: "https://www.examstocks.com/category/result/", channel: "result" },
]);

/* ===================== Aggregation, dedupe, sort ===================== */
const SOURCES = [
  scrapeTestbook,
  scrapeAdda247,
  scrapeOliveboard,
  scrapeTIME,
  // new ones
  scrapeByjusExamPrep,
  scrapeCareerPower,
  scrapePracticeMock,
  scrapeGuidely,
  scrapeIxamBee,
  scrapeBankersDaily,
  scrapeAffairsCloud,
  scrapeAglasem,
  scrapeStudyIQ,
  scrapeExamstocks,
];

function dedupeSort(items) {
  const byUrl = new Map();
  for (const it of items) {
    if (!it?.url) continue;
    if (!byUrl.has(it.url)) byUrl.set(it.url, it);
    else {
      const prev = byUrl.get(it.url);
      if (!prev.date && it.date) byUrl.set(it.url, { ...prev, date: it.date });
    }
  }
  const arr = Array.from(byUrl.values());
  arr.sort((a, b) => {
    // jobs/admit/result first, then notification/news
    const order = { jobs: 0, "admit-card": 1, result: 2, notification: 3, news: 4 };
    const ra = order[a.channel] ?? 9;
    const rb = order[b.channel] ?? 9;
    if (ra !== rb) return ra - rb;
    return (b.date || "").localeCompare(a.date || "");
  });
  return arr;
}

export default async function handler(req, res) {
  try {
    const only = (req.query.only || "").split(",").filter(Boolean);   // e.g. jobs,admit-card
    const pick = (req.query.source || "").split(",").filter(Boolean); // e.g. adda,byjus

    const chunks = await Promise.allSettled(SOURCES.map((fn) => fn()));
    let items = [];
    for (const r of chunks) if (r.status === "fulfilled") items.push(...r.value);

    if (only.length) items = items.filter((x) => only.includes(x.channel));
    if (pick.length)  items = items.filter((x) => pick.some((s) => x.source.toLowerCase().includes(s)));

    items = dedupeSort(items);

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      count: items.length,
      items,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
