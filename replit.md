# SmartGuest AI Workspace

## Overview

pnpm workspace monorepo using TypeScript. Multi-property RAG-based AI chat platform for professional Airbnb/B&B hosts. Marco is the AI assistant that responds only from the host's knowledge base, always in the guest's language (11 languages supported).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: OpenAI GPT-4o-mini (RAG pattern, anti-over-refusal, multilingual)
- **Frontend**: React + Vite, Tailwind CSS, Wouter routing, Framer Motion

## Application: SmartGuest AI — Professional Host Suite

A multi-property RAG-based AI chat platform. Hosts log in with email+password and manage multiple properties. CEO has a super-admin panel with full CRUD.

### Routes

- `/` → Landing page (public)
- `/login` → Host login (email + password → `/host/dashboard`)
- `/ceo` → Super-admin CEO panel — **secret** (password: `fleming2026`)
- `/admin` → redirect to `/ceo`
- `/guest/:slug` → Tourist chat interface for a specific property
- `/host/dashboard` → Host dashboard: card grid of all owned properties (session-protected)
- `/host/:slug` → Individual property editor (email+session auth, ownership check)
- `/forgot-password` → Password recovery form (email input)
- `/reset-password/:token` → Set new password via magic link token
- `*` → 404 not-found page

### Features

1. **CEO Panel** (`/ceo`, 4 tabs):
   - **Proprietà**: list/create/edit/delete properties with inline editing (name, slug, ownerEmail, hostPassword). QR code generation.
   - **Lead**: lead management with status tracking.
   - **Richieste Reset**: pending password reset tokens with copyable magic links.
   - **Host**: create/update/delete host accounts (email + shared password).
2. **Host Login** (`/login`): Email + password auth. Checks `hosts` table. On success stores `{email, password, ts}` in sessionStorage under `host_session` (8h expiry) and redirects to `/host/dashboard`.
3. **Host Dashboard** (`/host/dashboard`): Property card grid — each card links to the guest chat and the property editor. Logout button clears session.
4. **Password Recovery**: Host enters email → token generated. CEO sees magic link in the "Richieste Reset" tab and forwards via WhatsApp. Token is **single-use** — invalidated after reset.
5. **Host Dashboard** (`/host/:slug`): Edit property name, content, WhatsApp number. Authenticated via email+password from `hosts` table + ownership check (property.email === host.email). AI tools: voice dictation, image scan.
6. **Guest Chat** (`/guest/:slug`): Mobile-friendly 11-language chat. Marco responds only from property-specific content, always in guest's language. WhatsApp SOS button, 4 quick-reply buttons, typing animation. Language auto-detected from browser; manual picker stored in localStorage.
7. **AI Safety**: Anti-over-refusal — Marco proactively suggests from available info before refusing.

### Auth Architecture

- **Hosts table**: `hosts.email` (UNIQUE) + `hosts.host_password` — one credential set per host, grants access to all linked properties
- **Properties table**: `properties.email` = owner_email — links a property to a host account
- **Legacy compat**: `properties.host_password` still supported as fallback for old sessions
- **Session key**: `sessionStorage['host_session']` → `{email, password, ts}` (8h TTL)

### API Endpoints

- `GET /api/properties?ceoPassword=...` — List all properties (CEO)
- `POST /api/properties` — Create property (CEO; accepts optional `ownerEmail`)
- `GET /api/properties/:slug` — Get one property (public)
- `PUT /api/properties/:slug` — Update property (CEO)
- `PUT /api/properties/:slug/full-edit` — CEO inline edit: name, slug, email, hostPassword (updates hosts table if email set)
- `PUT /api/properties/:slug/host-password` — Set host password (CEO; updates hosts table if property has email)
- `DELETE /api/properties/:slug` — Delete property (CEO)
- `POST /api/properties/:slug/chat` — Send message to Marco for a property
- `POST /api/auth/host-login` — Email+password → `{email, properties[]}` list
- `GET /api/host/:slug?email=...&hostPassword=...` — Host auth + ownership check
- `PUT /api/host/:slug` — Host updates name/content/whatsapp (email+password auth)
- `POST /api/auth/forgot-password` — Accepts email, generates reset token
- `GET /api/auth/reset-password/:token` — Validates token
- `POST /api/auth/reset-password/:token` — Consumes token, sets new password
- `GET /api/auth/resets?ceoPassword=...` — CEO: list pending reset requests
- `DELETE /api/auth/resets/:slug` — CEO: cancel reset token
- `GET /api/admin/hosts?ceoPassword=...` — CEO: list all hosts
- `POST /api/admin/hosts` — CEO: create or update host (upsert by email)
- `DELETE /api/admin/hosts/:email` — CEO: delete host
- `GET /api/healthz` — Health check

### DB Schema

**`properties` table**: `id`, `slug` (unique), `name`, `content`, `whatsapp_number`, `host_password` (legacy), `email` (owner_email), `reset_token`, `reset_requested_at`, `created_at`, `updated_at`

**`hosts` table**: `id`, `email` (UNIQUE), `host_password`, `created_at`

### Environment Variables

- `OPENAI_API_KEY` — OpenAI API key (required)
- `CEO_PASSWORD` — CEO panel password (default: `fleming2026`)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase project (required for API)
- `FRONTEND_URL` — Public frontend URL (`https://...`) for CORS, QR, and email links
- `RESEND_API_KEY` — [Resend](https://resend.com) API key (transactional email)
- `RESEND_FROM_EMAIL` — Verified sender address in Resend
- `EMAIL_FROM_NAME` — Optional display name (e.g. HeyCico)
- `HOST_SESSION_SECRET` or `SESSION_SECRET` — Host session signing

### Key Constraints

- DO NOT import `zod` directly in api-server routes (use request body parsing or api-zod types)
- DO NOT run `pnpm db push` interactively — use `psql $DATABASE_URL -c "..."` for schema changes
- `duck-duck-scrape` is blocked on Replit; use `gpt-4o-search-preview` for real-time web search
- The system prompt does NOT assume any specific city unless stated in the host's knowledge base

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/              # Express API server with OpenAI integration
│   │   └── src/routes/
│   │       ├── properties.ts    # CRUD for properties (CEO-authenticated)
│   │       ├── chat.ts          # Marco AI chat per property slug
│   │       ├── host-dashboard.ts # Host auth (email+hosts table), property edit
│   │       ├── admin-hosts.ts   # CEO host management (CRUD for hosts table)
│   │       ├── leads.ts         # Leads CRUD + /leads/:id/convert endpoint
│   │       ├── auth.ts          # Forgot/reset password flow
│   │       ├── ai.ts            # AI transcription + vision endpoints
│   │       ├── health.ts        # Health check
│   │       └── index.ts         # Router aggregator
│   └── rome-guest/              # React + Vite frontend
│       └── src/pages/
│           ├── guest.tsx        # Tourist chat interface (/guest/:slug)
│           ├── login.tsx        # Host login (email+password)
│           ├── host-properties.tsx  # Host property dashboard (/host/dashboard)
│           ├── host-dashboard.tsx   # Single property editor (/host/:slug)
│           ├── ceo.tsx          # Super-admin CEO panel (/ceo)
│           ├── landing.tsx      # Public landing page
│           ├── forgot-password.tsx  # Password recovery
│           ├── reset-password.tsx   # Token-based password reset
│           └── not-found.tsx    # 404 page
├── lib/
│   ├── api-spec/                # OpenAPI spec + Orval codegen config
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas from OpenAPI
│   └── db/                      # Drizzle ORM schema
│       └── src/schema/
│           ├── properties.ts    # properties table
│           ├── hosts.ts         # hosts table (email + password)
│           ├── leads.ts         # leads table
│           └── index.ts         # exports all tables
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
