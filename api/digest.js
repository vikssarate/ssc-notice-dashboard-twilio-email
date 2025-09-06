import { redis } from './_store.js'; import nodemailer from 'nodemailer';
export default async function handler(req,res){ try{ const since = Date.now()-24*3600*1000; const all = await redis.smembers('seen_all'); const items = (all||[]).map(x=>{try{return JSON.parse(x)}catch{return null}}).filter(Boolean).filter(n=> (n.ts||0) > since);
  if(!items.length) return res.status(200).json({ok:true, sent:false, msg:'No new notices today'});
  const html = `<h2>SSC Daily Digest</h2><ul>${items.map(n=>`<li><b>${n.title}</b> (${n.date||''}) - <a href="${n.pdf||n.view}">link</a></li>`).join('')}</ul>`;
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT||587), secure: false, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transporter.sendMail({ from: process.env.SMTP_FROM, to: process.env.DIGEST_TO, subject:'SSC Notices Digest', html });
  res.status(200).json({ok:true, sent:true, count:items.length}); } catch(e){ res.status(500).json({error:String(e)}); } }