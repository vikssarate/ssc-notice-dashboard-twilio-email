export const config = { runtime: "nodejs" };
export default function handler(req, res) {
  res.status(200).json({ ok: true, now: Date.now() });
}
