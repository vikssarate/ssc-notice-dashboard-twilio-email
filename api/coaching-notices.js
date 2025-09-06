export const config = { runtime: "nodejs18.x" };
export default async function handler(req, res) {
  res.status(200).json({ ok: true, ping: "coaching-notices alive" });
}
