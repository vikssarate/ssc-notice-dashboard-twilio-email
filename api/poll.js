import fetch from 'node-fetch'; import webpush from 'web-push'; import { redis } from './_store.js'; import twilio from 'twilio';
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:you@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;

async function getNotices(base){ const url=new URL('/api/ssc-notices', base).toString(); const res=await fetch(url); const json=await res.json(); return json.items||[]; }
async function sendWebPushAll(payload){ const subs=(await redis.smembers('subs'))||[]; const body=JSON.stringify(payload); for(const raw of subs){ try{ const sub=JSON.parse(raw); await webpush.sendNotification(sub, body);}catch(e){ if(e.statusCode===410 || /expired|not valid|Unauthorized/i.test(String(e))) await redis.srem('subs', raw); } } }
async function sendTelegram(text){ const token=process.env.TELEGRAM_BOT_TOKEN, chatId=process.env.TELEGRAM_CHAT_ID; if(!token||!chatId) return; const url=`https://api.telegram.org/bot${token}/sendMessage`; await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})}); }
async function sendTwilio(to, body){ if(!twilioClient || !process.env.TWILIO_FROM) return; try{ await twilioClient.messages.create({ from: process.env.TWILIO_FROM, to, body }); }catch(e){ console.error('Twilio error', e.message); } }

export default async function handler(req,res){ try{ const base = process.env.SELF_BASE_URL || `https://${req.headers.host}`; const notices = await getNotices(base);
  let newOnes = []; for(const n of notices){ const key = n.pdf || n.view || n.title; const added = await redis.sadd('seen', key); if(added===1) newOnes.push(n); await redis.sadd('seen_all', JSON.stringify(n)); }
  newOnes = newOnes.filter(n => /recruitment|vacanc|junior engineer|steno|mts|cgl|chsl|cpo|capf/i.test(n.title||''));
  for(const n of newOnes){ const payload = { title:'SSC: '+(n.title||'New Notice'), body:n.date||'', url:n.pdf||n.view||base }; await sendWebPushAll(payload); await sendTelegram(`SSC: ${n.title}\n${n.date||''}\n${n.pdf||n.view||''}`);
    if(process.env.TWILIO_TO){ for(const num of process.env.TWILIO_TO.split(',')){ await sendTwilio(num.trim(), `SSC: ${n.title} ${n.pdf||n.view||''}` ); } } }
  res.status(200).json({ok:true, checked:notices.length, new:newOnes.length}); } catch(e){ res.status(500).json({error:String(e)}); } }