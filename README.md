# Sonic CRM — Agentic Plumber CRM

A specialized CRM for plumbing marketing agencies. Scrape leads, send a single Telnyx SMS blast, and let an AI agent (Jordan) auto-reply and qualify leads.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   Copy `.env.local.example` to `.env.local` and fill in:
   - `DATABASE_URL` and `DIRECT_URL` (Supabase pooler URIs)
   - Telnyx API key and from-number
   - Outscraper API key (Google Maps scraping)
   - OpenAI API key (AI agent)
   - `NEXT_PUBLIC_APP_URL` (public URL for Telnyx webhooks)

3. **Apply schema** (uses `DIRECT_URL`)
   ```bash
   npx prisma db push
   ```

4. **Run**
   ```bash
   npm run dev
   ```

   Or with Docker:
   ```bash
   docker compose up --build
   ```

## Telnyx webhooks

Point your Telnyx Messaging Profile webhook to:

- Inbound + events: `https://<your-host>/api/sms/webhook`
- Delivery status (also set per-message): `https://<your-host>/api/sms/status`

Use a public URL (ngrok in local dev). Set `TELNYX_PUBLIC_KEY` so production webhooks are signature-checked.

## Campaigns

Campaigns are a **single SMS**, sent immediately when you enroll leads. There is no drip / follow-up sequence scheduler.
