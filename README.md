# FlowBoost — Agentic Plumber CRM

A specialized, minimal CRM for plumbing marketing agencies. Scrape leads, run SMS drip campaigns, and let an AI agent (Jordan) auto-reply and qualify leads 24/7.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Initialize Database**
   This uses SQLite (zero-config).
   ```bash
   npx prisma db push
   ```

3. **Configure Environment Variables**
   Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in your:
   - Twilio credentials (for SMS)
   - Outscraper API key (for Google Maps scraping)
   - OpenAI API key (for AI agent)
   - Cron secret (any random string)

4. **Run the Development Server**
   ```bash
   npm run dev
   ```

## Webhooks (Local Dev)
To receive inbound SMS replies and Outscraper results locally, you need a public URL (e.g., via ngrok):
```bash
ngrok http 3000
```
Update your Twilio phone number webhook to: `https://<ngrok-url>/api/sms/webhook`
Update `NEXT_PUBLIC_APP_URL` in `.env.local` to your ngrok URL.

## Cron Jobs (Drip Campaigns)
The drip campaigns run automatically via Vercel Cron. For local testing, you can trigger the cron manually:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/drip
```
