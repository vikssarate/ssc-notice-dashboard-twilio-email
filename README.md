
# SSC Notice Dashboard — Push + Telegram + Twilio + Email Digest

Deploy on **Vercel**. Frontend in `/frontend`, API in `/api`.
- Hourly poll: `/api/poll` (web push, Telegram, Twilio).
- Daily digest: `/api/digest` (email summary).

## Environment variables
### Upstash
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Web Push (VAPID)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`  
  Generate: `npx web-push generate-vapid-keys`

### Base URL
- `SELF_BASE_URL` e.g. `https://your-app.vercel.app`

### Telegram (optional)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### Twilio (optional; SMS or WhatsApp)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM`  (SMS number like +1xxx or `whatsapp:+14155238886`)
- `TWILIO_TO`    (comma-separated numbers, e.g. `+91xxxxxxxxxx,whatsapp:+91xxxxxxxxxx`)

### Email (digest)
- `SMTP_HOST`, `SMTP_PORT` (e.g. 587)
- `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM` (e.g. `ssc@yourdomain.com`)
- `DIGEST_TO`  (comma-separated recipients)

## Deploy
1. Create Vercel project; keep this structure (frontend + api).
2. Add env vars above.
3. Deploy. The `vercel.json` already schedules the cron jobs.
4. Open the site → click **Enable Alerts** (browser push).

