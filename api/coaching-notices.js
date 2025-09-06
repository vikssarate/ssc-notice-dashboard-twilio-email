// api/coaching-notices.js
export const config = { runtime: "nodejs18.x" };
export default async function handler(req, res) {
  const q = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.statusCode = 307;
  res.setHeader("Location", "/api/coach" + q);
  res.end();
}
