# DealSync

**AI-powered investment review report automation SaaS for Korean venture capital firms.**

DealSync automates the creation of 투자심사보고서 (investment review reports) using GPT-4, cutting report writing time from 3-5 days to under 30 minutes.

## Features

- **AI Report Generation** — Enter deal information, get a professional investment review report in minutes
- **Korean VC Standard Format** — Reports follow 투자심사보고서 structure used by major Korean VCs
- **Deal Pipeline Management** — Track all deals from initial review through approval
- **Multi-step Deal Intake** — Structured form covering company info, investment terms, business model, team, and financials
- **Report Viewer** — Clean, printable report view with PDF export
- **Authentication** — Secure login with JWT sessions

## Tech Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4 + custom UI components
- **Database:** SQLite via Prisma ORM v7 + `@prisma/adapter-better-sqlite3`
- **Auth:** NextAuth.js v4 with credentials provider
- **AI:** OpenAI GPT-4o (falls back to demo mode without API key)
- **Forms:** React Hook Form + Zod v4

## Getting Started

```bash
cd dealsync

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your NEXTAUTH_SECRET and OPENAI_API_KEY

# Run database migrations
npx prisma migrate dev

# Seed demo data
npm run db:seed

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Demo credentials:** `demo@dealsync.ai` / `demo1234`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | SQLite file path (default: `file:./dev.db`) |
| `NEXTAUTH_URL` | App URL (default: `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Secret for JWT signing (min 32 chars) |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 report generation |

Without `OPENAI_API_KEY`, the app runs in **demo mode** and generates realistic sample reports.

## Database Schema

- **User** — VC analysts with company info
- **Deal** — Investment opportunities with full deal metadata
- **Report** — AI-generated investment review reports linked to deals

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/auth/signin` | Login |
| `/auth/signup` | Registration |
| `/dashboard` | Overview with deal stats |
| `/deals` | Deal pipeline list |
| `/deals/new` | 6-step deal intake form |
| `/deals/[id]` | Deal detail view |
| `/deals/[id]/report` | Investment review report |
| `/reports` | All reports list |
| `/market` | Market analysis overview |
| `/team` | Team management |
| `/settings` | Account settings |
