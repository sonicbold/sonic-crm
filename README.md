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

## Import leads (Gemini)

CSV, JSON, and `POST /api/leads/import` (including `/api/v1/leads/import`) all go through the same pipeline:

1. Gemini summarizes the file and maps headers onto Company, Website, GBP, Contact, Phone, Email, and location.
2. A row is imported only when it has a company name, a phone number, a city and/or street address, and a website status (a real site URL, or an explicit no-website / `not_found` mark).
3. Toll-free numbers (`800`, `833`, `844`, `855`, `866`, `877`, `888`) are skipped. Owner names are taken only from an owner/contact column. Duplicate phones are skipped and existing leads are left unchanged.
4. Company comes from the business name, Website stores the URL or `No link`, GBP stores a Google Maps URL when the file has one, Contact stores the owner, Phone is E.164, Source is `angi` when the file is Angi (otherwise `import`), and Stage is `new`.

The in-app **Import CSV** button on Leads runs that pipeline on the server. It uses the Gemini key saved in Settings, or `GEMINI_API_KEY` from the environment.

From a machine that has the CSV and can reach your CRM:

```bash
# Dry run — Gemini maps the file and prints skip/import counts. No write.
npm run import:leads -- --dry-run ./leads.csv

# Write into a CRM already running on localhost:3000.
# Gemini runs locally, then qualifying rows are POSTed to /api/leads/import.
GEMINI_API_KEY=your-key npm run import:leads -- --post http://localhost:3000 ./leads.csv
```

`GEMINI_API_KEY_2` and any other `GEMINI_API_KEY*` variable are tried if the first key is rejected. Do not commit the key.

## Campaigns

Campaigns are a **single SMS**, sent immediately when you enroll leads. There is no drip / follow-up sequence scheduler.
