# SmartGuest AI — Project Documentation

Technical reference for the **Guest-Assistant-AI** monorepo: backend, data, API, frontend routes, deployment, and known gaps. Paths are relative to the repository root unless noted.

---

## Table of contents

1. [Project overview](#1-project-overview)  
2. [System architecture (high-level)](#2-system-architecture-high-level)  
3. [Tech stack](#3-tech-stack)  
4. [Monorepo structure](#4-monorepo-structure)  
5. [Database schema](#5-database-schema)  
6. [API routes](#6-api-routes)  
   - [6.11 Request & response examples](#611-request--response-examples)  
7. [Key business flows](#7-key-business-flows)  
8. [AI / Marco configuration](#8-ai--marco-configuration)  
9. [Security model](#9-security-model)  
10. [Frontend pages](#10-frontend-pages)  
11. [Deployment configuration](#11-deployment-configuration)  
12. [Known limitations & technical debt](#12-known-limitations--technical-debt)  
13. [Roadmap](#13-roadmap)  

---

## Development guidelines

Rules for anyone changing **SmartGuest AI**. Treat violations as **blockers** for merge.

**Must follow**

- **No Supabase from the browser** — Only the API (`artifacts/api-server`) talks to Supabase (`supabase` / `supabaseAdmin`). The frontend uses HTTP to `/api/...` only.
- **Zod at boundaries** — Parse and validate every request body, query, and params with Zod in route handlers before business logic. Do not trust raw client input.
- **AI guardrails** — Any path that spends OpenAI quota or enforces demo/prod limits must call **`enforceAiMessageLimit`** (and related helpers) from `artifacts/api-server/src/lib/aiGuard.ts`. Do not bypass for “quick tests.”
- **Secrets stay server-side** — Never ship `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `CEO_PASSWORD`, session signing secrets, or other internal env vars to the client or into `VITE_*` unless explicitly documented as a **public** key.
- **`x-session-id` for AI** — Guest and other AI-facing POSTs must send a stable **`x-session-id`** (see `@workspace/api-client-react` / `session.ts`) so limits and abuse signals are per-session, not only per-IP.
- **System prompts are gated** — Do not edit Marco / system prompt strings in `chat.ts` (or elsewhere) without **product + tech review** — they affect safety, tone, and compliance.
- **Demo vs production** — Keep demo behavior in **`demoProperty.ts`**, **`DEMO_SLUG`**, and explicit `isDemo` branches. No demo shortcuts inside production-only code paths.
- **Critical Areas (Do Not Modify Without Review)** — Breaking these affects cost, security, or core UX:
  - **`artifacts/api-server/src/routes/chat.ts`** — OpenAI logic, streaming, system prompts, and **`GUEST_CANNED`** strings.
  - **`artifacts/api-server/src/lib/aiGuard.ts`** — Rate limiting and token/session enforcement.
  - **Auth** — **`artifacts/api-server/src/lib/ceo-session.ts`**, **`artifacts/api-server/src/lib/host-session.ts`**, **`artifacts/api-server/src/routes/auth.ts`**: security, auth, and session generation logic.

**Logging and errors**

- **Logs** — Use structured server logging already wired in `app.ts` (`pino-http`). Never log secrets, full tokens, or key material; redaction rules apply to auth and session headers.
- **Errors** — Return **safe JSON** errors to clients (`{ "error": "…" }` pattern handlers use). Log stack/details **server-side only**; do not leak stack traces or internal paths in API responses.

---

## 1. Project overview

**SmartGuest AI** is a hospitality product delivered as a **pnpm monorepo**:

| Actor | Role | Primary surfaces |
|--------|------|------------------|
| **Guest** | Chats with an AI assistant (“Marco”) scoped to a property manual | Public `GET /api/properties/:slug`, `POST /api/properties/:slug/chat`; SPA `/guest/:slug` |
| **Host** | Manages own property content, Diario (chat logs), AI helpers | Host session routes under `/api/host/...`, `/api/super-diario/...`; SPA `/host/...`, `/diario/...` |
| **CEO / operator** | Properties CRUD, leads, admin hosts, PDF email | CEO session routes; SPA `/ceo` |

**Runtime stack (verified):** Express API (`artifacts/api-server`) uses **Supabase** (`@supabase/supabase-js`) for PostgreSQL; **no** `@workspace/db` import in the API. Shared **Zod** contracts in `lib/api-zod`.

---

## 2. System architecture (high-level)

Typical **production** topology (hosts may vary; **Vercel** / **Render** are the stack referenced in-repo, e.g. `rome-guest/vercel.json`, `render.yaml`).

```
Guest (browser)
    │
    │  HTTPS
    ▼
Frontend — React SPA (e.g. Vercel static + SPA rewrites)
    │
    │  HTTPS  /api/*  (same origin in dev via Vite proxy, or VITE_API_ORIGIN in prod)
    ▼
Backend — Express API (e.g. Render Node service)
    │
    ├──────────────────────┐
    │                      │
    ▼                      ▼
OpenAI API              Supabase (PostgreSQL)
(streaming chat,        (persistence:
 Whisper, vision)        properties, hosts, leads,
                         chat_logs, …;
                         service role from API)
```

- **Request flow:** The guest or operator uses the **browser** to load the SPA; the SPA calls **`/api/...`** on the API host. The API validates input (Zod), enforces **auth / rate limits**, reads or writes **Supabase**, and for Marco chat opens a **stream** to **OpenAI** and forwards **SSE** chunks to the client (`artifacts/api-server/src/routes/chat.ts`).
- **Where AI is called:** The **backend only** — guest chat (`POST /api/properties/:slug/chat`), and host tools **`/api/ai/transcribe`**, **`/api/ai/vision`** (`artifacts/api-server/src/routes/ai.ts`). Keys come from env (`OPENAI_API_KEY`); the browser never holds the key.
- **Where data is stored:** **Supabase PostgreSQL** via **`supabase`** (anon) or **`supabaseAdmin`** (service role) in `artifacts/api-server/src/lib/supabase.ts`. Long-lived manuals, logs, and credentials live in DB tables described in §5–6 of this doc.
- **Streaming:** Chat responses use **Server-Sent Events** from the API to the frontend; OpenAI delta tokens are translated to `event: delta` / final `event: done` (`chat.ts` — `writeChatSseEvent`).

---

## 3. Tech stack

### 3.1 Backend — `artifacts/api-server`

| Layer | Choice |
|--------|--------|
| Runtime | Node.js **ESM** (`package.json`: `"type": "module"`) |
| HTTP | **Express 5** (`express` `^5`) |
| Data | **Supabase** anon + service-role clients (`src/lib/supabase.ts`) |
| Validation | **Zod** via `@workspace/api-zod` |
| AI | **OpenAI** SDK — chat stream, Whisper, vision (`openai`) |
| Email | **Resend** (`resend` SDK — `lib/resend.ts`, `lib/hostWelcomeMail.ts`) |
| QR | **qrcode**; PDF kit **pdfkit** (e.g. welcome PDF) |
| Security | **helmet**, **cors** (allowlist), `trust proxy: 1` |
| Logging | **pino** + **pino-http** (redacted fields) |
| Passwords | **bcryptjs** (hosts) |
| Uploads | **multer** (`routes/ai.ts`) |

### 3.2 Frontend — `artifacts/rome-guest`

| Layer | Choice |
|--------|--------|
| Build | **Vite 7**, TypeScript |
| UI | **React 19**, **Tailwind CSS 4** (`@tailwindcss/vite`), **Framer Motion** |
| Routing | **Wouter** |
| Data | **TanStack Query**; forms **React Hook Form** + **Zod** (devDeps) |
| Markdown (guest chat) | **react-markdown** + **rehype-sanitize** |
| PDF | **jsPDF**; **qrcode.react** |
| Misc | Radix UI, Lucide, **recharts** |

### 3.3 Shared / tooling

| Package | Role |
|---------|------|
| `lib/api-zod` | Request/response Zod contracts for the API |
| `lib/api-spec` | OpenAPI (`openapi.yaml`) — **partial** route coverage |
| `lib/api-client-react` | `custom-fetch`, `session.ts`, types; `VITE_API_ORIGIN` resolution |
| `lib/db` | Drizzle schema (**not** used by `api-server` at runtime) |
| `scripts` | Workspace scripts (typecheck in build graph) |

**Monorepo:** `pnpm-workspace.yaml` — `artifacts/*`, `lib/*`, `lib/integrations/*`, `scripts`; version **catalog** for shared deps.

---

## 4. Monorepo structure

```
Guest-Assistant-AI/
├── artifacts/
│   ├── api-server/              # Express API → mounted at /api
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   └── lib/
│   │   ├── supabase/            # SQL for Supabase SQL Editor
│   │   └── build.ts
│   ├── rome-guest/              # Vite + React SPA
│   └── mockup-sandbox/          # Separate artifact (typecheck only in workspace)
├── lib/
│   ├── api-zod/
│   ├── api-spec/
│   ├── api-client-react/
│   └── db/
├── scripts/
├── package.json                 # root: typecheck, dev:api, dev:web
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── render.yaml                  # example Render service definition
└── PROJECT_ARCHITECTURE.md      # narrative doc; reconcile with this file if drift
```

**Communication:** Browser calls **`/api/...`** — dev: Vite proxies `/api` to backend (`rome-guest/vite.config.ts`). Production: **`VITE_API_ORIGIN`** (build-time) + backend **`FRONTEND_URL`** for CORS.

**Root scripts** (`package.json`): `typecheck`, `dev:api` (dotenv `../../.env`), `dev:web`, `dev` (concurrently).

---

## 5. Database schema

### 5.1 Runtime: Supabase (PostgreSQL)

- **Clients:** `artifacts/api-server/src/lib/supabase.ts` — `supabase` (anon), `supabaseAdmin` (service role, bypasses RLS).

**SQL artifacts** (`artifacts/api-server/supabase/`):

| File | Purpose |
|------|---------|
| `ceo_hosts_leads.sql` | `hosts`, `leads`; RLS on; **drops** legacy anon policies; alters `properties` (`reset_token`, `reset_requested_at`, `host_password`) |
| `properties_invite.sql` | `invite_token`, `invite_token_expires_at` + index |
| `chat_logs.sql` | `chat_logs` table + indexes + RLS; **drops** legacy `chat_logs_anon_*` |
| `stripe_billing.sql` | `stripe_customers`, `subscriptions` — **optional**, not wired in `api-server/src` |

Comments in `ceo_hosts_leads.sql` / `chat_logs.sql` state intent: **service-role access from API; no anon policies** in those scripts.

**VERIFIED:** Supabase RLS policies for the **`properties`** table have been secured. The **anon** role is strictly restricted from reading sensitive columns (e.g., `host_password`, `reset_token`, `email`).

### 5.2 Drizzle mirror — `lib/db/src/schema/`

| Table | File | Notes |
|--------|------|--------|
| properties | `schema/properties.ts` | Missing **`manual_content`**, **invite_** columns used by API |
| hosts | `schema/hosts.ts` | |
| leads | `schema/leads.ts` | |
| chat_logs | `schema/chat-logs.ts` | |
| host_knowledge | `schema/knowledge.ts` | Usage from API **NOT VERIFIED** in this doc |

Treat **`lib/db`** as non-authoritative unless you explicitly sync it to the same DB as Supabase.

---

## 6. API routes

All paths are prefixed with **`/api`** (`artifacts/api-server/src/app.ts`). Composition order: `artifacts/api-server/src/routes/index.ts`.

### 6.1 Health

| Method | Path | File | Auth |
|--------|------|------|------|
| GET | `/healthz` | `routes/health.ts` | Public |
| GET | `/healthz/db` | `health.ts` | Public |

### 6.2 Guest chat & Diario

| Method | Path | File | Auth |
|--------|------|------|------|
| POST | `/properties/:slug/chat` | `routes/chat.ts` | Public (limits in §7–9) |
| GET | `/super-diario/:slug` | `chat.ts` | Host + owns slug |
| GET | `/super-diario/:slug/unresolved-count` | `chat.ts` | Same |
| PATCH | `/super-diario/:slug/resolve/:id` | `chat.ts` | Same |
| POST | `/super-diario/:slug/refresh-all` | `chat.ts` | Same |
| GET | `/ciao` | `chat.ts` | Public |

### 6.3 Properties

| Method | Path | File | Auth |
|--------|------|------|------|
| GET | `/properties` | `routes/properties.ts` | CEO |
| POST | `/properties` | `properties.ts` | CEO |
| GET | `/properties/:slug` | `properties.ts` | Public |
| PUT | `/properties/:slug` | `properties.ts` | CEO |
| PUT | `/properties/:slug/full-edit` | `properties.ts` | CEO |
| POST | `/properties/:slug/resend-host-welcome` | `properties.ts` | CEO |
| DELETE | `/properties/:slug` | `properties.ts` | CEO |

### 6.4 Leads

| Method | Path | File | Auth |
|--------|------|------|------|
| POST | `/leads` | `routes/leads.ts` | Public (rate limit); body → `{ success: true }` |
| GET | `/leads` | `leads.ts` | CEO |
| DELETE | `/leads/:id` | `leads.ts` | CEO |
| PUT | `/leads/:id/status` | `leads.ts` | CEO |
| POST | `/leads/:id/convert` | `leads.ts` | CEO |

### 6.5 Host dashboard & login

| Method | Path | File | Auth |
|--------|------|------|------|
| POST | `/auth/host-login` | `routes/host-dashboard.ts` | Public (rate limit) |
| GET | `/host/:slug` | `host-dashboard.ts` | Host + owns slug |
| PUT | `/host/:slug` | `host-dashboard.ts` | Same |
| POST | `/host/:slug/reset-pending-questions` | `host-dashboard.ts` | Same |
| PUT | `/properties/:slug/host-password` | `host-dashboard.ts` | CEO (`requireCeoSession`) |

### 6.6 Auth (`routes/auth.ts`)

POST `/auth/ceo-login`; GET `/auth/host/me`; POST `/auth/forgot-password`; GET/POST `/auth/reset-password/:token`; GET/POST `/auth/setup-password/:token`; GET `/auth/resets`; DELETE `/auth/resets/:slug`. Per-handler guards: read `auth.ts` for CEO vs public.

### 6.7 AI (`routes/ai.ts`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/ai/transcribe` | Host session + per-IP limit |
| POST | `/ai/vision` | Host session + per-IP limit |

### 6.8 Admin hosts (`routes/admin-hosts.ts`)

GET/POST `/admin/hosts`, DELETE `/admin/hosts/:email`, GET `/admin/properties-by-email` — **CEO** (`requireCeoSession`).

### 6.9 Other

| Method | Path | File | Auth |
|--------|------|------|------|
| POST | `/send-pdf` | `routes/send-pdf.ts` | CEO; JSON **15mb** on this path only (`app.ts`) |

### 6.10 OpenAPI parity

`lib/api-spec/openapi.yaml` documents a **subset** of the API (e.g. health, properties, chat). Many routes above are **not** listed there.

### 6.11 Request & response examples

All paths below include the **`/api`** prefix (`app.ts`). Bodies match **`SendPropertyChatBody`** / route handlers in `artifacts/api-server/src/routes`.

---

#### 1) `POST /api/properties/:slug/chat` (SSE stream)

**Wire format** (`chat.ts` — `writeChatSseEvent`): each event is `event: <name>` + `data: <JSON>` + blank line.

**Request (typical)**

```http
POST /api/properties/la-bellezza/chat HTTP/1.1
Host: api.example.com
Content-Type: application/json
Accept: text/event-stream
x-session-id: 550e8400-e29b-41d4-a716-446655440000
```

```json
{
  "message": "What is the Wi-Fi password?",
  "conversationHistory": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Welcome! **Check-in** starts at 3 PM." }
  ],
  "language": "en",
  "city": "roma"
}
```

`conversationHistory`, `language`, and `city` are optional (`lib/api-zod/src/generated/api.ts` — `SendPropertyChatBody`). `city` is used for demo/localized context only.

**Streaming response** (`Content-Type: text/event-stream`). Delta payload shape is `{ "text": "<chunk>" }`, not `{ "delta": ... }`:

```
event: delta
data: {"text":"The "}

event: delta
data: {"text":"Wi-Fi "}

event: done
data: {"reply":"The **Wi-Fi** password is …","propertyName":"La Bellezza di Roma"}

```

On failure after the stream has started:

```
event: error
data: {"message":"Internal server error"}

```

**Non-stream errors** (e.g. validation, rate limit before SSE): JSON body, `Content-Type: application/json` (e.g. `429` / `400` / `500`).

---

#### 2) `POST /api/auth/host-login`

**Host session is not a JWT** — server returns an **opaque HMAC-signed `sessionToken`** (`host-session.ts` — `issueHostSessionToken`).

**Request**

```http
POST /api/auth/host-login HTTP/1.1
Content-Type: application/json
```

```json
{
  "email": "host@example.com",
  "password": "••••••••"
}
```

**Response** (`host-dashboard.ts` — `res.json` on success)

```json
{
  "email": "host@example.com",
  "properties": [
    {
      "id": 1,
      "slug": "la-bellezza",
      "name": "La Bellezza di Roma",
      "whatsappNumber": "393331234567"
    }
  ],
  "sessionToken": "<base64url-payload>.<hex-signature>"
}
```

Send the token as **`Authorization: Bearer <sessionToken>`** or **`x-host-session: <sessionToken>`** (`host-session.ts` — `getHostTokenFromRequest`).

---

#### 3) Password reset **request** (maps to “reset-password/request”)

**Actual route:** `POST /api/auth/forgot-password` (`routes/auth.ts`).

**Request**

```http
POST /api/auth/forgot-password HTTP/1.1
Content-Type: application/json
```

```json
{
  "email": "host@example.com"
}
```

**Response** (including when email is unknown — silent success)

```json
{
  "success": true
}
```

**Other responses:** `400` `{ "error": "…" }`, `429` `{ "error": "…", "retryAfter": <seconds> }`, `500` on DB/email send failure (`auth.ts`).

---

#### 4) Password reset **confirm** (maps to “reset-password/confirm”)

**Actual route:** `POST /api/auth/reset-password/:token` — token in the **path**; **not** in the JSON body (`routes/auth.ts`).

**Request**

```http
POST /api/auth/reset-password/abc123def456... HTTP/1.1
Content-Type: application/json
```

```json
{
  "newPassword": "new-secure-password"
}
```

Minimum length **4** characters after trim (`auth.ts`).

**Response** (success)

```json
{
  "success": true,
  "slug": "la-bellezza"
}
```

**Other responses:** `400` / `404` / `410` / `500` with `{ "error": "…" }` (Italian messages per handler).

---

## 7. Key business flows

### 7.1 Guest chat — `POST /api/properties/:slug/chat`

**File:** `artifacts/api-server/src/routes/chat.ts` (~168+).

1. **`enforceAiMessageLimit`** (`lib/aiGuard.ts`) — demo vs prod limits (§8.3).  
2. Zod validate params/body.  
3. **`isDemo`** ⇔ `slug === DEMO_SLUG` (`lib/demoProperty.ts`, `"demo"`).  
4. **Non-demo:** **`chatRateLimiter`** — 60 req / hour / IP (`lib/rateLimiter.ts` 77–80). **Demo:** skip this limiter.  
5. Load property: demo → in-memory `demoPropertyRowForChat()`; prod → **`supabaseAdmin`**, manual = `manual_content ?? content`.  
6. **Empty manual:** SSE `done` with canned copy; **no OpenAI**.  
7. Else: build messages → **OpenAI streaming** (SSE `delta`, final `done` with `{ reply, propertyName }`).  
8. **Non-demo:** insert **`chat_logs`**; optionally increment **`pending_questions_count`** when `shouldIncrementPendingQuestions` (`chat.ts` 54–65).

---

### 7.2 Public property + QR

**GET `/api/properties/:slug`** — `routes/properties.ts`. Demo slug → `parseDemoPropertyForGet()` (`demoProperty.ts`), no DB. Else → **`supabase`** anon client.

**QR:** `lib/generateQr.ts` — `{FRONTEND_URL}/guest/{slug}`, PNG data URL via **qrcode**; throws if `FRONTEND_URL` missing.

---

### 7.3 Leads

**POST `/api/leads`** — rate limit (`authRateLimiter`), insert via **`supabaseAdmin`**, respond **`{ success: true }`** only.

**POST `/api/leads/:id/convert`** — CEO session; create **`properties`** row + invite token; optional **`sendHostWelcomeEmail`**; response `{ success, slug, emailSent }` (`routes/leads.ts` 190–279).

---

### 7.4 Host login

**POST `/api/auth/host-login`** — `host-dashboard.ts` 89–157: **`authRateLimiter`**, **`HOST_SESSION_SECRET`/`SESSION_SECRET`**, `authenticateHost` + optional Supabase Auth fallback, load properties by email, **`issueHostSessionToken`**, return `{ email, properties, sessionToken }`.

**Ownership:** `lib/host-auth.ts` — **`requireHostOwnsPropertySlug`** compares **`properties.email`** to session email.

---

### 7.5 CEO login

**POST `/api/auth/ceo-login`** — `routes/auth.ts` 30–52: rate limit, **`CEO_PASSWORD`** check, **`issueCeoToken`**. Token: **`X-CEO-Session`** or **Bearer** (`lib/ceo-session.ts`).

---

### 7.6 Diario

Routes under **`/super-diario/...`** in `chat.ts`: host session + slug ownership; **`supabaseAdmin`** on **`chat_logs`**.

---

### 7.7 Host AI helpers

**`routes/ai.ts`:** **`aiTranscribeRateLimiter`** / **`aiVisionRateLimiter`** (10/hour/IP each), **`requireHostSession`**, then Whisper / GPT-4o vision. **`enforceAiMessageLimit`** also called on transcribe.

---

### 7.8 Data Flow Example — Guest Chat

1. **Guest** opens the frontend route **`/guest/:slug`**.
2. **Frontend** calls **`GET /api/properties/:slug`** to load the configuration.
3. The user sends a message → **`POST /api/properties/:slug/chat`**.
4. **Backend** (`artifacts/api-server/src/routes/chat.ts`):  
   1. Validates the request payload using **Zod**.  
   2. Applies session limits via **`enforceAiMessageLimit`** (`artifacts/api-server/src/lib/aiGuard.ts`).  
   3. Applies IP limits via **`chatRateLimiter`**.  
   4. Loads property data (handles **demo** mock vs real **Supabase** data).  
   5. Builds the **context array** (**System Prompt** + **Chat History** + **User Message**).  
   6. Calls **OpenAI API** with **`stream: true`**.  
   7. Returns the stream to the client using **SSE** (**Server-Sent Events**), sending **`delta`** chunks followed by a final **`done`** payload.
5. **Post-stream** (if **not** demo):  
   1. Asynchronously saves the interaction to the **`chat_logs`** table.  
   2. Updates **`pending_questions_count`** (if applicable for the host dashboard).

---

## 8. AI / Marco configuration

### 8.1 OpenAI chat parameters

**File:** `routes/chat.ts` ~304–311.

| Parameter | Value |
|-----------|--------|
| `model` | `gpt-4o-mini` |
| `max_tokens` | `300` |
| `temperature` | `0.4` |
| `stream` | `true` |
| `stream_options` | `{ include_usage: true }` |

### 8.2 System prompts

- Primary system message: Marco persona, **same language as guest**, `Today:` + **`HOUSE MANUAL`**, RULES 1–7 (manual-first, technical escalation with Italian canned line pointing to **green WhatsApp top-right**, bold 3–4 keywords, etc.) — `chat.ts` 268–284.  
- Second system message: reinforcement (language, manual, bold, WhatsApp / RULE 2, never claim host notified) — lines 293–297.  
- History: last **6** turns — lines 287–291.

### 8.3 Demo vs production message limits (`lib/aiGuard.ts`)

| Mode | Rule |
|------|------|
| **Demo** (`slug === "demo"`) | Max **12** messages per key per ~1h TTL; key = body `sessionId` or **`x-session-id`** or IP (5–6, 75–78, 88–98). |
| **Production** | If **`x-session-id`** header set: max **60** POSTs / rolling **60s** per header (8–10, 102–117). **No header → this sub-limit skipped** (102–104). |

**Independent guard:** non-demo chat also uses **`chatRateLimiter`** 60/hour/IP (`chat.ts` 195–205).

### 8.4 Demo content

`lib/demoProperty.ts` — `DEMO_SLUG`, `DEMO_MASTER_MANUAL`, `DEMO_MOCK_WHATSAPP_NUMBER`, `parseDemoPropertyForGet`, `demoPropertyRowForChat`.

### 8.5 Canned strings

`GUEST_CANNED` in `chat.ts` (~91–163) — rate-limit reply, empty manual, empty model output — keyed by **`language`** from request body.

### 8.6 Language leak logging

If UI language ≠ `it` but reply looks Italian → **`AI_LANGUAGE_LEAK`** log (`chat.ts` 365–375).

### 8.7 AI Cost Control & Limits

- **Model limits:** **`max_tokens`** is explicitly restricted (e.g., **300**) to prevent cost overruns per message.
- **Rate limits:**
  - **Demo mode:** **12** messages / hour / session key.
  - **Production:** **60** messages / minute / session (**`x-session-id`**) + **60** messages / hour / IP (**`chatRateLimiter`**).
- **Cost risk mitigation:** The **`x-session-id`** fallback to **IP** has been implemented to block malicious bypasses that could drain the OpenAI budget.

---

## 9. Security model

### 9.1 Boot — `lib/validateEnv.ts`

Required: **`SUPABASE_URL`**, **`SUPABASE_ANON_KEY`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`OPENAI_API_KEY`**, **`CEO_PASSWORD`**, **`FRONTEND_URL`**, **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`**.  
Plus **`HOST_SESSION_SECRET`** or **`SESSION_SECRET`**.

**Optional (not in `validateEnv`):** **`EMAIL_FROM_NAME`** — display name in the Resend `From` header (default HeyCico).

### 9.2 Supabase logging

`lib/supabase.ts` logs host + fixed **`anon key configurata: yes`** — **no** key substrings (26–30). **Service role** not logged.

### 9.3 Sessions

| Actor | Implementation | File |
|--------|----------------|------|
| CEO | HMAC token, TTL **8h**, signing key from **`CEO_PASSWORD`** | `ceo-session.ts` |
| Host | HMAC token, TTL **8h**, **`HOST_SESSION_SECRET`/`SESSION_SECRET`** | `host-session.ts` |

Token headers: **`getCeoTokenFromRequest` / `getHostTokenFromRequest`** — custom header and/or **Bearer**.

### 9.4 Guards

- **`requireCeoSession`** — `ceo-session.ts` 69–79.  
- **`requireHostSession` / `requireHostOwnsPropertySlug`** — `host-auth.ts`.

### 9.5 HTTP — `app.ts`

- **`helmet`**, **CORS** allowlist = **`FRONTEND_URL`** + `http://localhost:5173` if `NODE_ENV !== "production"`; LAN origins only if `NODE_ENV === "development"`.  
- **`!origin`** allows non-browser clients (line 64).  
- **`pino-http` redact:** auth, CEO/host session headers, passwords, reset tokens, `pdfBase64` (31–43).  
- **`trust proxy: 1`**.  
- Global error handler returns generic JSON; may still log stack to console (81–93).

### 9.6 Rate limits — `lib/rateLimiter.ts` + `aiGuard.ts`

| Limiter | Scope | Config |
|--------|--------|--------|
| `chatRateLimiter` | Non-demo guest chat | 60 / hour / IP |
| `authRateLimiter` | CEO login, host login, forgot-password, public POST `/leads` | 10 / hour / IP |
| `aiTranscribeRateLimiter` | `/ai/transcribe` | 10 / hour / IP |
| `aiVisionRateLimiter` | `/ai/vision` | 10 / hour / IP |
| `enforceAiMessageLimit` (demo) | Demo slug | 12 / session key / ~1h |
| `enforceAiMessageLimit` (prod) | `x-session-id` only | 60 / minute / header |

---

## 10. Frontend pages

**Router:** `artifacts/rome-guest/src/App.tsx` (Wouter + `BASE_URL`).

| Path | Component | File |
|------|-----------|------|
| `/` | Landing | `pages/landing.tsx` |
| `/login` | Host login | `pages/login.tsx` |
| `/ceo` | CEO panel | `pages/ceo.tsx` |
| `/admin` | Redirect → `/ceo` | `App.tsx` |
| `/demo` | Demo | `pages/demo.tsx` |
| `/guest/:slug` | Guest chat | `pages/guest.tsx` |
| `/signup` | Signup redirect | `pages/signup-redirect.tsx` |
| `/host/dashboard` | Host properties list | `pages/host-properties.tsx` |
| `/host/:slug` | Host dashboard | `pages/host-dashboard.tsx` |
| `/diario/:slug` | Diario | `pages/diario.tsx` |
| `/forgot-password` | Forgot | `pages/forgot-password.tsx` |
| `/reset-password/:token` | Reset | `pages/reset-password.tsx` |
| `/setup-password/:token` | Setup | `pages/setup-password.tsx` |
| `/privacy` | Privacy | `pages/privacy.tsx` |
| default | Not found | `pages/not-found.tsx` |

**API URL:** `pages`-level and client use `lib/apiUrl.ts` + **`VITE_API_ORIGIN`**; **`getAiSecurityHeaders()`** / **`getOrCreateDemoSessionId()`** in `@workspace/api-client-react` (`lib/api-client-react/src/session.ts`, `custom-fetch.ts`).

---

## 11. Deployment configuration

### Frontend (e.g. Vercel)

- **`artifacts/rome-guest/vercel.json`:** `outputDirectory` `dist/public`; SPA rewrite to `index.html`.  
- **Build:** `pnpm build` in `rome-guest` → `vite.config.ts` `outDir` `dist/public`.  
- **`BASE_PATH`**, **`PORT`:** Vite base and dev/preview port (`vite.config.ts`).  
- **Dev proxy:** `/api` → `API_PROXY_TARGET` or `http://127.0.0.1:8080`; SSE headers tweaked for stream.  
- **Production:** set **`VITE_API_ORIGIN`** at build to public API origin; backend **`FRONTEND_URL`** must match SPA origin for CORS.

### Backend (Render example)

**`render.yaml`:** service `smartguest-api`, `rootDir` **`artifacts/api-server`**, `pnpm install --frozen-lockfile && pnpm build`, **`node dist/index.js`**, `NODE_ENV=production`. **Secrets** (Supabase, OpenAI, email, sessions, CEO password) must be set in the platform — not all appear in YAML.

### Local

Root **`package.json`:** `dev:api` / `dev:web` use **`dotenv-cli -e ../../.env`**. **`.env`** is gitignored; **`.env.example`** — **NOT VERIFIED** in repo snapshot.

---

## 12. Known limitations & technical debt

| Topic | Detail |
|--------|--------|
| **Rate limits** | In-memory maps — **not** shared across multiple API instances without external store (`rateLimiter.ts`, `aiGuard.ts`). |
| **Prod `x-session-id`** | Omitting header skips the 60/min **session** window in `aiGuard`; **60/hour/IP** chat limit still applies for non-demo (`chat.ts`). |
| **Schema drift** | `lib/db` Drizzle vs Supabase/API columns (`manual_content`, invites, etc.). |
| **OpenAPI** | `lib/api-spec/openapi.yaml` incomplete vs live routes. |
| **Stripe** | `supabase/stripe_billing.sql` only — **no** `stripe` usage under `api-server/src`. |
| **CORS** | Single `FRONTEND_URL`; missing `Origin` allowed. |
| **CEO auth** | Plain string compare to `CEO_PASSWORD` (`auth.ts`) + rate limit — not slow-hashed. |
| **`build.ts` allowlist** | May list packages not in minimal `api-server` dependency set — keep in sync. |
| **`PROJECT_ARCHITECTURE.md`** | May describe older patterns (e.g. API + Drizzle); prefer this doc + source files. |

---

## 13. Roadmap

No committed **`ROADMAP.md`** in-repo. Inferred next steps:

| Priority | Item |
|----------|------|
| Contracts | Extend OpenAPI + codegen to cover CEO, host, auth, leads, diario. |
| Scale | Redis (or similar) for rate limits across instances. |
| Data | Single source of truth: migrate Drizzle to match Supabase or drop unused mirror. |
| Billing | Implement Stripe flows or remove `stripe_billing.sql` from operator expectations. |
| Hardening | Optional dedicated **`CEO_SESSION_SECRET`**; stricter CORS if required. |
| Ops | Metrics beyond pino; multi-origin support for preview deployments. |

---

*Document generated by merging internal PART 1–3 specs. Update when routes, env, or Supabase SQL change.*
