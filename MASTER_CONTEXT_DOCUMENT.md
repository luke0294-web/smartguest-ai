# HeyCico / SmartGuest AI — Master Context Document

> **Purpose:** Feed this file as system/context to Claude, GPT, Gemini, etc.  
> **Branch scanned:** `main` + PR #43–#50 (13–14 October 2026 audit: guest chat + Super-Diario + host tools + personalized outreach demos; no live Stripe routes).  
> **Rule:** Describes only what exists in code/SQL unless marked **NOT IMPLEMENTED**.

---

## 0) Product in One Paragraph

HeyCico is a B2B SaaS for short-term rental hosts. Each **property** gets a public guest chat (`/guest/:slug`) powered by **Cico**, an OpenAI assistant grounded in a host-authored **House Manual**. Guests get instant multilingual answers; hosts manage content, view conversation logs (**Super-Diario**), and track unresolved questions. A **CEO panel** manages leads, property onboarding, and host credentials. Stack: **React/Vite SPA** + **Express API** + **Supabase Postgres**.

---

## 1) Core Features & Business Logic

### 1.1 Roles & User Journeys

| Role | Entry | Capabilities |
|------|-------|--------------|
| **Guest** | `/guest/:slug`, `/demo`, `/guest/demo` | Chat with Cico (SSE stream), language selector, WhatsApp escalation, quick-reply chips |
| **Host** | `/login` → `/host/dashboard` → `/host/:slug` | Edit manual, WhatsApp, referral links; text extraction from PDF/.docx uploads and photos; open Diario; view pending badge |
| **CEO/Admin** | `/ceo` | Leads CRUD, convert lead→property, manage properties/hosts, resend welcome email, send PDF |

Ownership model: `properties.email` must match authenticated host session email (`artifacts/api-server/src/lib/host-auth.ts` → `requireHostOwnsPropertySlug`).

### 1.2 AI Integration (OpenAI)

**Primary chat endpoint:** `POST /api/properties/:slug/chat`  
**File:** `artifacts/api-server/src/routes/chat.ts`

| Aspect | Implementation |
|--------|----------------|
| SDK | `openai` package, key from `OPENAI_API_KEY` |
| Model | `gpt-4o-mini` |
| Params | `max_tokens: 300`, `temperature: 0.4`, `stream: true`, `stream_options: { include_usage: true }` |
| Context window | Last **6** history turns + system prompt + final language constraint block |
| Knowledge source | `properties.manual_content` or `properties.content`; demo uses in-memory `DEMO_MASTER_MANUAL` (`artifacts/api-server/src/lib/demoProperty.ts`) |
| Referrals | `properties.referral_links` sanitized (script strip, 2000 char cap) and injected into prompt |
| Transport | **SSE**: events `delta` (text chunks), `done` (final JSON), `error` |
| Client | `lib/api-client-react/src/property-chat-sse.ts` → `sendPropertyChatSse()` |

**System prompt policy (language lock):**
- Assistant name: **Cico**
- **LANGUAGE LOCK:** reply language inferred **only** from guest's **latest** user message; ignore manual language and prior assistant turns for dialect
- Manual treated as facts to translate/paraphrase, never copy-paste Italian into other languages
- **Manual-first:** answer from house manual before suggesting WhatsApp/host contact
- WhatsApp/host mention only for missing info, emergencies, or unfixable technical issues
- Bold 3–4 keywords; emojis required (1–2 short, 3–5 long)
- Referral links promoted only when guest asks for recommendations and link exists in `referral_links`
- URLs from manual must be included when relevant (rule 10 in prompt)

**Final language constraint block:** second system message immediately before user message reinforces language code from request body (`language` field, default UI language).

**Post-generation guard:** if expected language ≠ `it` but reply looks Italian (`isLikelyItalian`), logs `AI_LANGUAGE_LEAK` warning (no auto-rewrite).

**Host-side AI tools** (`artifacts/api-server/src/routes/ai.ts`):
- `POST /api/ai/transcribe` — Whisper `whisper-1`, language `it`, 25MB max, host session required
- `POST /api/ai/vision` — `gpt-4o-mini` vision, extracts house rules text from uploaded image, host session required
- `POST /api/ai/extract-document` — native PDF/.docx text extraction (no AI call), 15MB max, rejects .docx declaring >50MB uncompressed, host session required

**NOT Magic Import:** There is **no** Airbnb URL scraper, listing import API, or "Magic Import" module anywhere in the repo. Host content ingestion is:
1. Manual textarea edit (`PUT /api/host/:slug`)
2. Document upload (PDF/.docx) → native text extraction → append to textarea
3. Photo scan → Vision → append to textarea

(`/api/ai/transcribe` exists server-side but the frontend does not call it today.)

The word "Airbnb" appears only in marketing copy (`artifacts/api-server/src/routes/send-pdf.ts` email HTML).

### 1.3 Proactive UX Hooks (Frontend — Guest Chat)

**File:** `artifacts/rome-guest/src/pages/guest.tsx`

These are **UI affordances**, not server-side proactive messaging:

| Hook | When shown | Action |
|------|------------|--------|
| **Localized welcome bubble** | On load when messages empty | Auto-injected assistant greeting via `TRANSLATIONS[lang].welcome()` |
| **Arrival actions** (🔑 📶 📍) | Before first user message, if `marco_welcomed_{slug}` not in sessionStorage | Calls same `handleSend(question)` |
| **Quick replies row** | WiFi / Restaurants / Trash / Check-out chips | Calls `handleSend()` |
| **Checkout chip** | After conversation started | Sends localized checkout question |
| **11 languages** | `TRANSLATIONS` object (it, en, de, fr, es, nl, zh, ja, ko, pt, pl) | UI strings + canned error/rate-limit messages |

Demo cap: **12 user messages** (`DEMO_USER_MESSAGE_LIMIT`), synced with backend `aiGuard` demo limit.

### 1.4 Super-Diario (Chat Logging & Resolution)

**Backend:** `artifacts/api-server/src/routes/chat.ts` (write) + diario routes (read/update)

**On each non-demo chat turn after OpenAI completes:**
1. Insert row into `chat_logs` (`property_slug`, `guest_message`, `marco_reply`, `resolved`)
2. Compute `resolved`:
   - `categorizeMessage(userMessage) === "tourism"` → **resolved = true** (tourism auto-resolved)
   - else if `shouldIncrementPendingQuestions(reply)` → **resolved = false**
   - else **resolved = !detectNeedsAttention(reply)**

**Supporting libs:**
- `artifacts/api-server/src/lib/categorizeMessage.ts` — tourism vs house vs mixed keyword patterns; `shouldIncrementPendingQuestions()` matches uncertainty/host-fallback phrases (multilingual)
- `artifacts/api-server/src/lib/detectNeedsAttention.ts` — negative indicators (sorry, don't know, contact host, whatsapp, etc.) on normalized reply text

**Pending questions badge:**
- When host-fallback detected, increment `properties.pending_questions_count`
- Host dashboard polls property every 15s + on focus (`artifacts/rome-guest/src/pages/host-dashboard.tsx`)
- Opening Diario resets counter via `POST /api/host/:slug/reset-pending-questions`

**Diario API routes:**

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/super-diario/:slug` | Host + owns property | All logs, newest first |
| GET | `/api/super-diario/:slug/unresolved-count` | Host | Count `resolved=false` |
| PATCH | `/api/super-diario/:slug/resolve/:id` | Host | Mark single log resolved |
| POST | `/api/super-diario/:slug/refresh-all` | Host | Recompute `resolved` for all logs |
| POST | `/api/host/:slug/resolve-all-logs` | Host | Bulk resolve + zero pending counter |

**Frontend Diario:** `artifacts/rome-guest/src/pages/diario.tsx` — splits logs into pending (needs attention) vs history.

### 1.5 Lead → Host Onboarding Flow

**File:** `artifacts/api-server/src/routes/leads.ts`

1. Public `POST /api/leads` creates lead (`status: "Nuovo"`)
2. CEO `POST /api/leads/:id/convert`:
   - Creates `properties` row with generated slug, empty manual, `invite_token` (48h TTL)
   - Sets lead status `"Chiuso"`
   - Sends welcome email via Resend (if configured) with setup-password link
3. Host completes `POST /api/auth/setup-password/:token` → bcrypt password in `hosts` table

### 1.6 Demo Mode

- Slug constant: `demo` (`artifacts/api-server/src/lib/demoProperty.ts`)
- Public routes: `/demo`, `/guest/demo`
- Uses hardcoded English master manual (prevents Italian grammar leak in multilingual demo)
- Stricter limits: 12 msgs/hour per session key + 36/hour per IP (`artifacts/api-server/src/lib/aiGuard.ts`); session ids must match `^[A-Za-z0-9-]{8,64}$`, otherwise the IP is the key
- No `chat_logs` persistence for demo slugs

**Personalized outreach demos** (`artifacts/api-server/src/lib/demoProspects.ts`, `routes/demo-prospects.ts`, CEO tab "Demo"):
- Slug `demo-<name>-<random>`, stored in table `demo_prospects` (real facts about one prospect's property + optional "curiosity question" for the outreach message)
- Frontend `/demo/:slug` (only `demo-…` slugs accepted); chat and GET go through the normal `/properties/:slug` routes, which recognize the `demo-` prefix
- Every `demo-…` slug is reserved (`lib/api-zod/src/reservedSlugs.ts`): a real property can never take one
- `first_message_at` records the prospect's first chat message (engagement signal in the CEO panel)

---

## 2) Infrastructure & APIs (`artifacts/api-server`)

### 2.1 Stack

- **Express 5** + TypeScript (`tsx` dev, esbuild prod bundle via `build.ts`)
- **Supabase JS** — only `supabaseAdmin` (service role) in `src/lib/supabase.ts`; no anon client, `SUPABASE_ANON_KEY` is not used
- **Validation** — Zod schemas in `@workspace/api-zod` (generated from `lib/api-spec/openapi.yaml`, which covers every route; a few hand patches listed in `orval.config.ts`)
- **Logging** — Pino + pino-http (`src/lib/logger.ts`), redacts auth/password headers
- **Email** — Resend (`src/lib/resend.ts`, `src/lib/hostWelcomeMail.ts`)

### 2.2 App Bootstrap

**File:** `artifacts/api-server/src/app.ts`
- `helmet()`, CORS allowlist: `FRONTEND_URL`, `heycico.com`, `www.heycico.com`, and a regex for THIS project's Vercel preview URLs only (`smartguest-ai-rome-guest-git-…-luke0294-8669s-projects.vercel.app`) — not a bare `*.vercel.app`
- Request logs: reset/invite tokens in URLs redacted (`src/lib/logRedact.ts`); emails masked in app logs
- Optional `LOG_PROXY_DEBUG=true` logs `req.ip` vs `X-Forwarded-For` (to verify `trust proxy` = 1 hop)
- JSON body 5MB (15MB for `/api/send-pdf`)
- All routes mounted at `/api/*`
- Global error handler (500 JSON)

**Boot validation:** `artifacts/api-server/src/lib/validateEnv.ts` — fails fast if required env missing.

### 2.3 Complete Route Map

All paths prefixed with `/api`. Router index: `artifacts/api-server/src/routes/index.ts`.

#### Health
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/healthz` | Public | `routes/health.ts` |
| GET | `/healthz/db` | Public | `routes/health.ts` |

#### Guest Chat & Diario
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/properties/:slug/chat` | Public (+ rate limits) | `routes/chat.ts` |
| GET | `/super-diario/:slug` | Host | `routes/chat.ts` |
| GET | `/super-diario/:slug/unresolved-count` | Host | `routes/chat.ts` |
| PATCH | `/super-diario/:slug/resolve/:id` | Host | `routes/chat.ts` |
| POST | `/super-diario/:slug/refresh-all` | Host | `routes/chat.ts` |
| GET | `/ciao` | Public | `routes/chat.ts` |

#### Properties (CEO + Public read)
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/properties` | CEO | `routes/properties.ts` |
| POST | `/properties` | CEO | `routes/properties.ts` |
| GET | `/properties/:slug` | Public | `routes/properties.ts` |
| PUT | `/properties/:slug` | CEO | `routes/properties.ts` |
| PUT | `/properties/:slug/full-edit` | CEO | `routes/properties.ts` |
| POST | `/properties/:slug/resend-host-welcome` | CEO | `routes/properties.ts` |
| DELETE | `/properties/:slug` | CEO | `routes/properties.ts` |

#### Host Dashboard
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/auth/host-login` | Public (+ rate limit) | `routes/host-dashboard.ts` |
| GET | `/host/:slug` | Host | `routes/host-dashboard.ts` |
| PUT | `/host/:slug` | Host | `routes/host-dashboard.ts` |
| POST | `/host/:slug/reset-pending-questions` | Host | `routes/host-dashboard.ts` |
| POST | `/host/:slug/resolve-all-logs` | Host | `routes/host-dashboard.ts` |
| PUT | `/properties/:slug/host-password` | CEO | `routes/host-dashboard.ts` |

#### Auth
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/auth/ceo-login` | Public | `routes/auth.ts` |
| GET | `/auth/host/me` | Host Bearer | `routes/auth.ts` |
| POST | `/auth/forgot-password` | Public | `routes/auth.ts` |
| GET/POST | `/auth/reset-password/:token` | Public | `routes/auth.ts` |
| GET/POST | `/auth/setup-password/:token` | Public | `routes/auth.ts` |
| GET | `/auth/resets` | CEO | `routes/auth.ts` |
| DELETE | `/auth/resets/:slug` | CEO | `routes/auth.ts` |

#### AI (Host tools)
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/ai/transcribe` | Host | `routes/ai.ts` |
| POST | `/ai/vision` | Host | `routes/ai.ts` |
| POST | `/ai/extract-document` | Host — native PDF/.docx parsing, max 15MB, no AI call | `routes/ai.ts` |

#### Personalized demos
| Method | Path | Auth | File |
|--------|------|------|------|
| GET / POST | `/demo-prospects` | CEO | `routes/demo-prospects.ts` |
| DELETE | `/demo-prospects/:slug` | CEO | `routes/demo-prospects.ts` |

#### Leads
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/leads` | Public | `routes/leads.ts` |
| GET | `/leads` | CEO | `routes/leads.ts` |
| DELETE | `/leads/:id` | CEO | `routes/leads.ts` |
| PUT | `/leads/:id/status` | CEO | `routes/leads.ts` |
| POST | `/leads/:id/convert` | CEO | `routes/leads.ts` |

#### Admin Hosts
| Method | Path | Auth | File |
|--------|------|------|------|
| GET | `/admin/hosts` | CEO | `routes/admin-hosts.ts` |
| POST | `/admin/hosts` | CEO | `routes/admin-hosts.ts` |
| DELETE | `/admin/hosts/:email` | CEO | `routes/admin-hosts.ts` |
| GET | `/admin/properties-by-email` | CEO | `routes/admin-hosts.ts` |

#### Misc
| Method | Path | Auth | File |
|--------|------|------|------|
| POST | `/send-pdf` | CEO | `routes/send-pdf.ts` |

**OpenAPI:** `lib/api-spec/openapi.yaml` covers every route (incl. `/demo-prospects`). The generated zod file carries hand patches that `codegen` wipes — listed at the top of `lib/api-spec/orval.config.ts`.

### 2.4 Security & Utility Middleware

#### Rate limiting — `artifacts/api-server/src/lib/rateLimiter.ts`

In-memory sliding window per IP (not shared across API instances):

| Limiter | Limit | Used by |
|---------|-------|---------|
| `chatRateLimiter` | 100 req / hour / IP | Guest chat (all slugs incl. demo) — checked first |
| `aiTranscribeRateLimiter` | 10 req / hour / IP | `/ai/transcribe` |
| `aiVisionRateLimiter` | 10 req / hour / IP | `/ai/vision` |
| `aiDocumentRateLimiter` | 20 req / hour / IP | `/ai/extract-document` |
| `authRateLimiter` | 10 req / hour / IP | `/auth/host-login` |
| `leadsRateLimiter` | 10 req / hour / IP | `POST /leads` |
| `forgotPasswordRateLimiter` | 10 req / hour / IP | `/auth/forgot-password` |
| `forgotPasswordPerEmailLimiter` | 1 email / 15 min per target address | `/auth/forgot-password` (the response is identical either way) |
| `ceoLoginRateLimiter` | 5 req / hour / IP | `/auth/ceo-login` — per IP only: a global lock would let anyone block the real CEO |
| `publicPropertyRateLimiter` | 300 req / hour / IP | `GET /properties/:slug` |

Keys use Express `req.ip` with `app.set("trust proxy", 1)`, normalized by `clientIpKey`: IPv4 as-is, IPv6 grouped by /64 (one home or phone connection gets a whole /64, so per-address keys were trivial to rotate). Set `LOG_PROXY_DEBUG=true` to log `req.ip` next to `X-Forwarded-For` and check the proxy hop count on Render.

#### AI guard — `artifacts/api-server/src/lib/aiGuard.ts`

`enforceAiMessageLimit(req, res)` is called only by the guest chat route (`routes/chat.ts`), after `chatRateLimiter`. The AI upload routes use their own per-IP limiters above.

| Mode | Rule |
|------|------|
| Demo slugs (`demo`, `demo-…`) | 12 messages per key: `sessionId` body → `x-session-id` header → IP fallback; the key includes the slug, so the generic demo doesn't consume a personalized one. Plus 36 messages per IP (/64 for IPv6) across all sessions → 429 `Demo IP limit reached` (temporary: the frontend does not lock the tab) |
| Production | 60 req / minute per `x-session-id` header; **no header = fallback to per-IP limit** (fail closed, not open) |

TTL: each demo counter is deleted 1 hour after its **last** message (the timer restarts on every message — not a rolling window). In-memory, lost on restart.

#### Host session — `artifacts/api-server/src/lib/host-session.ts`

- HMAC-SHA256 signed token: `{ hostId, email, exp }` + signature
- Secret: `HOST_SESSION_SECRET` or fallback `SESSION_SECRET`
- TTL: **8 hours**
- Accepted: `Authorization: Bearer` or `x-host-session` header
- Frontend stores in `sessionStorage` (`artifacts/rome-guest/src/lib/hostSession.ts`)

#### CEO session — `artifacts/api-server/src/lib/ceo-session.ts`

- Constant-time compare (SHA-256 digests + `timingSafeEqual`) against `CEO_PASSWORD` env — not slow-hashed, so use a long random password (boot warns under 16 chars)
- Token issued on successful login; sent as `x-ceo-session` header from CEO panel

#### Passwords — `artifacts/api-server/src/lib/passwords.ts`

- bcrypt hashing for host passwords
- Min length enforced on reset/setup flows

---

## 3) Database Schema (Supabase)

**Access pattern:** Backend uses `supabaseAdmin` (service role) for every operation. RLS is enabled with no policies (`properties_rls.sql`, `ceo_hosts_leads.sql`, `chat_logs.sql`, `demo_prospects.sql`), so the anon/publishable key can read nothing.

**SQL migration files:** `artifacts/api-server/supabase/*.sql`  
**Drizzle mirror (documentation only, may drift):** `lib/db/src/schema/*.ts` — not used at runtime; the `drizzle-kit push` scripts were removed, schema changes go through the SQL files

### 3.1 Table Reference

#### `properties`
| Column | Notes |
|--------|-------|
| `id` | serial (or UUID in some deployments) |
| `slug` | unique URL identifier |
| `name` | display name |
| `content` / `manual_content` | house manual (API writes both on update) |
| `email` | owner host email (ownership link) |
| `whatsapp_number` | guest escalation |
| `pending_questions_count` | badge counter |
| `referral_links` | plain text, max ~2000 chars |
| `host_password` | legacy per-property password (migrating to `hosts` table) |
| `reset_token`, `reset_requested_at` | password reset flow — `reset_token` stores a sha256 hash of the token, not the plaintext (`hashToken` in `src/lib/tokens.ts`); consumed with one conditional update (single use) |
| `invite_token`, `invite_token_expires_at` | first-time setup after lead conversion |

#### `hosts`
| Column | Notes |
|--------|-------|
| `id` | bigserial PK |
| `email` | unique |
| `host_password` | bcrypt hash |
| `created_at` | timestamptz |

#### `chat_logs`
| Column | Notes |
|--------|-------|
| `id` | bigserial PK |
| `property_slug` | varchar(255), indexed |
| `guest_message` | text |
| `marco_reply` | text (legacy name; stores Cico reply) |
| `resolved` | boolean, default false |
| `created_at` | timestamptz |

#### `leads`
| Column | Notes |
|--------|-------|
| `id` | bigserial PK |
| `host_name`, `email`, `property_name` | intake form |
| `status` | `Nuovo`, `Contattato`, `In Trattativa`, `Chiuso`, `Non Interessato` |
| `created_at` | timestamptz |

#### `demo_prospects` (`supabase/demo_prospects.sql`)
| Column | Notes |
|--------|-------|
| `id` | identity PK |
| `slug` | unique, always `demo-…` |
| `property_name`, `manual_content` | prospect's real property facts (the demo's "manual") |
| `suggested_question` | curiosity question for the outreach message (not shown in chat) |
| `first_message_at` | set on the prospect's first chat message |
| `created_at` | timestamptz |

#### `host_knowledge` (Drizzle only — **may not exist in Supabase**)
Defined in `lib/db/src/schema/knowledge.ts` — single-row knowledge table; **not referenced** by current API routes.

#### Stripe tables (**SQL draft only — NOT wired to API on `main`**)
File: `artifacts/api-server/supabase/stripe_billing.sql`
- `stripe_customers` — FK `host_id → hosts.id`
- `subscriptions` — FK `host_id`, Stripe IDs, status, period dates

### 3.2 Relationships

```
hosts (1) ──< properties (via properties.email = hosts.email, app-level)
hosts (1) ──< stripe_customers (SQL FK host_id)     [NOT USED BY API]
hosts (1) ──< subscriptions (SQL FK host_id)        [NOT USED BY API]
properties.slug ──< chat_logs.property_slug (logical, no SQL FK — the API moves logs on slug rename and deletes them with the property; supabase/chat_logs_orphans_cleanup.sql removes pre-existing orphans)
```

### 3.3 RLS Posture

All Supabase SQL scripts enable RLS and explicitly **drop anon policies**. Runtime bypasses RLS via service role client.

---

## 4) Monetization (Stripe)

### Current status on `main`: **NOT IMPLEMENTED**

| Evidence | Detail |
|----------|--------|
| No `stripe` in `artifacts/api-server/package.json` dependencies | SDK not installed |
| No `routes/billing.ts` | No checkout/webhook/portal routes |
| No webhook mount in `app.ts` | No raw body Stripe handler |
| `stripe_billing.sql` exists | Schema draft only (`host_id`-based model) |

**What would be needed (not present):**
- Stripe SDK + env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`)
- Checkout session creation, billing portal, subscription status endpoint
- Webhook handler for `checkout.session.completed`, `customer.subscription.updated/deleted`
- Frontend billing tab in host dashboard

**Pricing mentioned in docs/UI elsewhere:** €7/month HeyCico Pro (marketing copy; no live checkout on `main`).

---

## 5) Testing Suite

### 5.1 Playwright E2E — **NOT PRESENT on `main`**

- `artifacts/rome-guest/package.json` has **no** `@playwright/test` dependency
- **No** `playwright.config.ts`, **no** `e2e/*.spec.ts` files
- Empty `artifacts/rome-guest/e2e/helpers/` directory may exist as leftover
- `test:e2e` scripts absent

*(Note: branch `prova` may have had Playwright smoke/full projects — not on current `main`.)*

### 5.2 Vitest / Unit Tests — backend only

- `vitest` in `artifacts/api-server`, run by `pnpm run test` (and in CI)
- Test files in `artifacts/api-server/src/lib/*.test.ts`: CEO/host sessions, host auth, passwords, tokens, rate limiter, lead slugs, log redaction, document extraction (zip-bomb guard), env validation, demo prospects
- No frontend tests

### 5.3 What IS verified today

| Check | Command | Scope |
|-------|---------|-------|
| TypeScript | `pnpm run typecheck` | libs + all artifacts |
| Unit tests | `pnpm run test` | api-server libs (Vitest) |
| Production build | `pnpm run build` | typecheck + vite build + api esbuild |
| Dependency audit | `pnpm audit --audit-level=high` | CI, also weekly |

### 5.4 Testable pure functions still without tests

| Module | Functions |
|--------|-----------|
| `artifacts/api-server/src/lib/categorizeMessage.ts` | `categorizeMessage`, `shouldIncrementPendingQuestions`, `isHostFallbackResponse` |
| `artifacts/api-server/src/lib/detectNeedsAttention.ts` | `detectNeedsAttention` |
| `artifacts/api-server/src/lib/aiGuard.ts` | `enforceAiMessageLimit` |
| `lib/api-client-react/src/property-chat-sse.ts` | SSE parser |

---

## 6) Frontend Architecture (`artifacts/rome-guest`)

### 6.1 Routes — `src/App.tsx`

| Path | Page |
|------|------|
| `/` | Landing + lead form |
| `/login` | Host login |
| `/ceo` | CEO admin panel |
| `/demo` | Embedded demo chat |
| `/demo/:slug` | Personalized outreach demo (`demo-…` slugs only) |
| `/admin` | Redirect to `/ceo` |
| `/guest/:slug` | Guest chat |
| `/host/dashboard` | Host property list |
| `/host/:slug` | Host property editor |
| `/diario/:slug` | Super-Diario |
| `/signup` | Redirect |
| `/forgot-password`, `/reset-password/:token`, `/setup-password/:token` | Auth flows |
| `/privacy` | Privacy policy |

### 6.2 API URL resolution — `src/lib/apiUrl.ts`

- Production: requires `VITE_API_ORIGIN` — the production build fails without it (`vite.config.ts`)
- Dev: Vite proxy `/api` → `API_PROXY_TARGET` or `127.0.0.1:8080`
- `getAiSecurityHeaders()` adds `x-session-id` from `getOrCreateDemoSessionId()`

### 6.3 Shared packages (`lib/`)

| Package | Purpose |
|---------|---------|
| `@workspace/api-client-react` | Generated React Query hooks + `sendPropertyChatSse` |
| `@workspace/api-zod` | Zod schemas/types from OpenAPI |
| `@workspace/api-spec` | OpenAPI spec + Orval codegen config |
| `@workspace/db` | Drizzle schema (partial mirror of Supabase) |

### 6.4 Deploy

- Frontend: Vercel (`artifacts/rome-guest/vercel.json`, output `dist/public`)
- Backend: Render Node service (dashboard-only config, no `render.yaml`): `node artifacts/api-server/dist/index.cjs` after `pnpm --filter @workspace/api-server run build`
- Node pinned to `22.x` via `engines` (root, api-server, rome-guest); CI uses Node 22
- `vercel.json`: SPA rewrite (except `/assets/*`), `nosniff`/`Referrer-Policy` everywhere, `X-Frame-Options: DENY` on CEO/login/host/diario/password pages

---

## 7) Environment Variables (Keys Only)

### Required (API boot — `validateEnv.ts`)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CEO_PASSWORD`, `FRONTEND_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `HOST_SESSION_SECRET` **or** `SESSION_SECRET` (boot warns if `CEO_PASSWORD` < 16 chars or the session secret < 32). `SUPABASE_ANON_KEY` is no longer used.

### Optional / tooling

`PORT`, `LOG_LEVEL`, `ENABLE_RATE_LIMITING`, `LOG_PROXY_DEBUG`, `DATABASE_URL` (drizzle-kit only), `API_PROXY_TARGET`, `BASE_PATH`, `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`, `RESEND_REPLY_TO`, `REPL_ID`. `VITE_API_ORIGIN` is required on Vercel (frontend build). Note: `build.ts` defines `process.env.NODE_ENV = "production"` inside the bundle, so the built server always runs with hardening on unless `ENABLE_RATE_LIMITING=false`.

### Stripe (not used on `main`)

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` — would be needed if billing branch merged.

---

## 8) Monorepo Layout

```
smartguest-ai/
├── artifacts/
│   ├── api-server/          # Express API (production backend)
│   ├── rome-guest/          # React SPA (production frontend)
│   └── mockup-sandbox/      # UI mockups (not production)
├── lib/
│   ├── api-client-react/
│   ├── api-zod/
│   ├── api-spec/
│   └── db/
├── scripts/
├── package.json               # root: dev:api, dev:web, typecheck, build
└── pnpm-workspace.yaml
```

**Dev command:** `pnpm dev` → concurrently API (:8080) + Web (:5173) with root `.env`.

---

## 9) Known Gaps & Technical Debt

| Topic | Status |
|-------|--------|
| **Magic Import (Airbnb URL scraper)** | **Does not exist** — not drafted, not partial |
| **Stripe billing** | SQL draft only; **no API/UI** on `main` |
| **Automated tests** | Backend unit tests only (Vitest); no frontend/E2E tests |
| **Pending-questions counter** | read-then-write, not atomic (needs an SQL function) |
| **Rate limits** | In-memory; breaks with horizontal scaling |
| **Schema mirror** | `lib/db` aligned with the SQL scripts (October 2026); no `CREATE TABLE properties` script in the repo |
| **Analytics dashboard** | **Not on `main`** (was on `prova` branch with mock data) |
| **CEO auth** | Single shared password (env), compared in constant time; HMAC session token keyed off it |

---

## 10) Quick Reference for AI Assistants

When modifying HeyCico:

1. **Guest chat changes** → `artifacts/api-server/src/routes/chat.ts` + `artifacts/rome-guest/src/pages/guest.tsx` + `lib/api-client-react/src/property-chat-sse.ts`
2. **Never bypass** `enforceAiMessageLimit` or `chatRateLimiter` on OpenAI paths
3. **Host auth** → always use `requireHostSession` + `requireHostOwnsPropertySlug`
4. **CEO auth** → `requireCeoSession`
5. **DB writes** → `supabaseAdmin` from `src/lib/supabase.ts`
6. **Prompt changes** → edit system prompt string in `chat.ts`; test language lock behavior
7. **Do not assume Stripe or Magic Import exist** on `main`

---

*Generated from codebase scan of branch `main`. Update when merging feature branches (e.g. billing, Playwright, analytics).*
