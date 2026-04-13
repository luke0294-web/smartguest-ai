# HeyCico — Monorepo Architecture

High-level technical reference for architectural review, deployment planning, and cross-model brainstorming. Paths are relative to the repository root unless stated otherwise.

---

## 1. Project Overview

**HeyCico** is a hospitality product that connects **guests**, **property hosts**, and a **CEO / operator** through a single stack:

| Actor | Role | Primary surfaces |
|-------|------|------------------|
| **Guest** | Chats with an AI co-host (“Marco”) scoped to a property’s manual / knowledge base. | Public route: `/guest/:slug` (React). |
| **Host** | Edits property content (manual, WhatsApp SOS number, name), uses AI helpers (voice / image), reads the **Diario** (chat logs). | Host dashboard, Diario, login (`rome-guest`). |
| **CEO** | Full lifecycle: properties CRUD, leads pipeline, PDF/QR collateral, host administration, sensitive operations. | CEO panel (`ceo.tsx` and related routes). |

**Product goals (conceptual):** reduce repetitive host messaging, standardize property info for the AI, surface unanswered or escalated guest threads to the host (badge + diario), and give the operator tools to onboard properties and hosts securely.

---

## 2. Tech Stack

### 2.1 Frontend — `@workspace/rome-guest`

| Layer | Choice |
|-------|--------|
| Build / dev | **Vite 7**, **TypeScript** |
| UI | **React 19**, **Tailwind CSS 4** (`@tailwindcss/vite`), **Framer Motion** |
| Routing | **Wouter** |
| Forms / validation | **React Hook Form**, **Zod**, `@hookform/resolvers` |
| Markdown (guest chat) | **react-markdown** + **rehype-sanitize** (XSS mitigation) |
| PDF | **jsPDF** (client composes A4 PDF; embeds backend-provided QR image) |
| Misc UI | Radix primitives, Lucide icons, TanStack Query (workspace client), `qrcode.react` may remain as dependency but QR for print/PDF is intended to come from the API |

**Runtime configuration:** `vite.config.ts` requires `PORT` and `BASE_PATH` at config time; dev server proxies `/api` → `http://localhost:8080`.

### 2.2 Backend — `@workspace/api-server`

| Layer | Choice |
|-------|--------|
| Runtime | **Node.js**, **ESM** (`"type": "module"`) |
| HTTP | **Express 5** |
| Data access | **Drizzle ORM** + **`pg`** pool (`@workspace/db`) |
| Validation (shared) | **Zod** schemas from **`@workspace/api-zod`** |
| AI | **OpenAI** official SDK (`openai` package) — chat completions, Whisper, vision |
| Email | **Resend** HTTP API (`resend` SDK; `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) |
| QR (deterministic, server-side) | **`qrcode`** → PNG **data URL** (`data:image/png;base64,...`) |
| Security middleware | **helmet**, **cors** (allowlist), **trust proxy** |
| Logging | **pino** + **pino-http** (sensitive fields redacted) |
| Passwords | **bcryptjs** (host passwords; CEO uses env-based session, see §6) |
| Uploads (AI routes) | **multer** |

### 2.3 Database

| Item | Choice |
|------|--------|
| Engine | **PostgreSQL** |
| ORM | **Drizzle** (`drizzle-orm`), migrations/push via **`drizzle-kit`** in `lib/db` |
| Bridge | `DATABASE_URL` → `node-postgres` pool |

### 2.4 Shared libraries

| Package | Responsibility |
|---------|----------------|
| **`@workspace/db`** | Drizzle `db` instance, schema exports, `drizzle-zod` insert helpers where used |
| **`@workspace/api-zod`** | Request/response Zod contracts consumed by the API (and optionally frontends) |
| **`@workspace/api-client-react`** | Thin re-exports of generated API types/schemas for React apps (TanStack Query–oriented) |
| **`@workspace/api-spec`** | **Orval** codegen config (`npm run codegen` in that package) — OpenAPI → client artifacts |
| **`scripts`** | Workspace tooling scripts (typecheck in monorepo build graph) |

### 2.5 Other artifacts

- **`artifacts/mockup-sandbox`**: separate TypeScript package (typecheck in CI graph); not the production guest app.

### 2.6 Monorepo tooling

- **pnpm** workspaces (`pnpm-workspace.yaml`): `artifacts/*`, `lib/*`, `scripts`
- **TypeScript project references** at root (`tsc --build` for libs)
- **Catalog** in `pnpm-workspace.yaml` pins shared versions (e.g. `drizzle-orm`, `zod`, `vite`, `react`)

---

## 3. Monorepo Structure & Communication

```
Guest-Assistant-AI/
├── artifacts/
│   ├── api-server/          # Express API (mounts under /api)
│   ├── rome-guest/          # Vite + React SPA (guest, host, CEO UIs)
│   └── mockup-sandbox/      # Secondary artifact
├── lib/
│   ├── db/                  # Drizzle schema + db singleton
│   ├── api-zod/             # Zod API contracts
│   ├── api-client-react/    # Generated-friendly exports
│   └── api-spec/            # Orval / OpenAPI codegen
├── scripts/
├── package.json             # Root scripts: typecheck, build
└── pnpm-workspace.yaml
```

### How packages communicate

1. **HTTP (primary):** The browser loads `rome-guest`. API calls use `fetch` (or generated client) against **`/api/...`**. In development, Vite proxies `/api` to the API server port (**8080** by default in proxy config).
2. **Shared types/contracts:** The API imports **`@workspace/api-zod`** to parse/serialize bodies and responses. Frontends can import the same package or **`@workspace/api-client-react`** for aligned types.
3. **Database:** Only **`@workspace/api-server`** (and tooling) should use **`@workspace/db`** at runtime; the SPA never connects to Postgres directly.

### API surface (conceptual grouping)

Routes are registered in `artifacts/api-server/src/routes/index.ts` and mounted at **`/api`** in `app.ts`. Non-exhaustive map:

| Area | Examples |
|------|----------|
| Health | `GET /api/healthz` |
| Guest chat | `POST /api/properties/:slug/chat` (rate limited) |
| Host diario | `GET /api/super-diario/:slug`, resolve/refresh endpoints (host session + slug ownership) |
| CEO properties | `GET/POST/PUT/DELETE /api/properties...` |
| Host property edit | `GET/PUT /api/host/:slug`, `POST .../reset-pending-questions` |
| Auth | `POST /api/auth/ceo-login`, `POST /api/auth/host-login`, forgot-password, etc. |
| Leads | Public `POST /api/leads`, CEO-only management routes |
| AI helpers | `POST /api/ai/transcribe`, `POST /api/ai/vision` (Bearer host session) |
| Email | `POST /api/send-pdf` (CEO session, larger JSON body limit) |
| Admin | `GET/POST /api/admin/hosts` (CEO) |

---

## 4. Core Business Logic (Key Flows)

### 4.1 Deterministic QR code and PDF flow

**Goal:** Guest-facing URL encoded in a QR, suitable for print (A4), generated **without external QR HTTP APIs**.

1. **URL construction:** `generateGuestQrDataUrl(slug)` in `artifacts/api-server/src/lib/generateQr.ts` builds  
   `{FRONTEND_URL}/guest/{slug}` (trailing slash stripped on base). **Fails fast** if `FRONTEND_URL` is missing.
2. **QR image:** Node **`qrcode`** produces a **PNG data URL** with fixed options: `errorCorrectionLevel: "M"`, `width: 300`, `margin: 2`.
3. **API exposure:** Property payloads (CEO `GET /api/properties/:slug` and host `GET /api/host/:slug`) attach optional **`qrCodeBase64`** after generation. Zod schemas in `@workspace/api-zod` include this field where applicable.
4. **PDF composition (client):** CEO UI uses **jsPDF** to lay out title, subtitle, and **`doc.addImage(qrCodeBase64, 'PNG', ...)`** centered. Output is typically a **data URI** string passed to the email endpoint.
5. **Determinism:** Same slug + same `FRONTEND_URL` + fixed QR options ⇒ predictable bitmap (modulo library patch updates).

### 4.2 Resend email sending (`POST /api/send-pdf` and transactional mail)

1. **Authorization:** **`requireCeoSession`** — only the CEO session can trigger `send-pdf` (see §6). Host welcome, lead convert, and password flows use **`sendResendEmail`** / **`hostWelcomeMail.ts`** with the same Resend configuration.
2. **Payload (`/api/send-pdf`):** JSON with recipient `email`, `propertyName`, `pdfBase64` (full data URI or raw base64), optional `chatLink`.
3. **Validation:** Base64 segment normalized and validated before `Buffer.from(..., "base64")` for the attachment.
4. **Provider:** **`resend`** SDK — **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`** (verified sender), optional **`EMAIL_FROM_NAME`** for display name (default HeyCico). Implemented in **`artifacts/api-server/src/lib/resend.ts`**.
5. **Errors:** API responses use **generic Italian messages**; details stay in **pino** server logs only.

### 4.3 AI chat, logging, and `pending_questions_count` badge

**Chat path:** `POST /api/properties/:slug/chat`

1. **Rate limiting:** Per-IP limiter before OpenAI call.
2. **Context:** System prompt injects property **`content`** (house manual) and behavioral rules; **OpenAI** `gpt-4o-mini` returns the assistant reply.
3. **Persistence:** Each exchange can be written to **`chat_logs`** with a **`resolved`** flag derived from message category (`categorizeMessage`), **`detectNeedsAttention(reply)`**, and whether the reply is treated as a host-escalation/fallback.
4. **Pending counter:** If the reply matches **`shouldIncrementPendingQuestions(reply)`**, the API increments **`properties.pending_questions_count`** via SQL increment. This function combines:
   - **`isHostFallbackResponse`** (canonical phrases / legacy patterns from `categorizeMessage.ts`), and  
   - **broader substring hints** (e.g. `proprietario`, `host`, `whatsapp`, `non so`, English “don’t know” variants) — **intentionally sensitive**; reviewers may want to tighten for false positives (e.g. tourism copy that mentions WhatsApp).
5. **Host UI:** Host dashboard loads property via **`GET /api/host/:slug`**, reads **`pendingQuestionsCount`**, shows a badge on **Diario**. Opening Diario can **`POST .../reset-pending-questions`** to zero the counter after acknowledgment.

### 4.4 CEO vs Host permissions and views

| Concern | CEO | Host |
|---------|-----|------|
| **Session mechanism** | Token from `CEO_PASSWORD` login; sent as **`X-CEO-Session`** (HMAC-signed payload, TTL) | JWT-like token from host login; sent as **`Authorization: Bearer`** |
| **Properties** | List/create/update/delete; full-edit; host password endpoints | Read/update **own** property by slug only (`requireHostOwnsPropertySlug`) |
| **Leads** | List, status, convert | No access |
| **send-pdf** | Allowed | Denied |
| **Diario** | Not the host diario routes (host-scoped) | Full access to own slug’s logs and resolve/refresh |
| **AI transcribe/vision** | Typically host-facing | Bearer token required |
| **Admin hosts** | `GET/POST /api/admin/hosts` | Denied |

Implementation references: `artifacts/api-server/src/lib/ceo-session.ts`, `host-session.ts`, `host-auth.ts`, and per-route `requireCeoSession` / `requireHostSession` guards.

---

## 5. Database Schema Summary

Logical model (PostgreSQL, Drizzle). **Foreign keys** are not always declared in schema; some relationships are **by convention** (e.g. matching `email`).

### `properties`

- **Primary key:** `id`
- **Identity:** `slug` (unique), `name`, `content` (manual / knowledge for Marco)
- **Contact:** `whatsapp_number`, `email` (owner email; ties host login to properties)
- **Host credentials (legacy / transitional):** `host_password` on row when not using `hosts` table; CEO may migrate to `hosts`
- **Ops:** `pending_questions_count` (notification badge), `reset_token`, `reset_requested_at` for password-reset flows
- **Timestamps:** `created_at`, `updated_at`

### `hosts`

- **Primary key:** `id`
- **`email`** (unique), **`host_password`** (bcrypt hash after migration)
- **`created_at`**
- **Link to properties:** properties with same **`properties.email`** are considered owned by that host for dashboard routing and `requireHostOwnsPropertySlug`.

### `leads`

- Sales/onboarding pipeline: `host_name`, `email`, `property_name`, `status`, `created_at`
- CEO converts leads into properties/hosts (business logic in `leads` routes)

### `chat_logs`

- **`property_slug`**, `guest_message`, `marco_reply`, `resolved`, `created_at`
- Drives Diario UI and unresolved counts; refresh endpoints can recompute `resolved` from heuristics

### `host_knowledge`

- Optional global/host knowledge blob (`content`, `updated_at`) — check usage in routes if extending RAG-style features

---

## 6. Security & Environment

### 6.1 Startup validation

`artifacts/api-server/src/lib/validateEnv.ts` requires (non-empty after trim):

- **`SUPABASE_URL`**, **`SUPABASE_ANON_KEY`**, **`SUPABASE_SERVICE_ROLE_KEY`**, **`OPENAI_API_KEY`**, **`CEO_PASSWORD`**, **`FRONTEND_URL`**, **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`**
- Plus **`HOST_SESSION_SECRET`** or **`SESSION_SECRET`**

**Optional (not in `validateEnv`):** **`EMAIL_FROM_NAME`** — display name in the Resend `From` header.

Failure logs Italian messages and aborts boot. **`PORT`** is enforced in `index.ts` separately.

### 6.2 Authentication & secrets

- **CEO:** `CEO_PASSWORD` gates `POST /auth/ceo-login`. Issued token is an **HMAC-signed, expiring** payload (`ceo-session.ts`); verification derives key material from `CEO_PASSWORD`. **Implication:** rotating CEO password invalidates existing CEO tokens.
- **Host:** Passwords stored as **bcrypt** (`bcryptjs`, 10 rounds) when hashed; `verifyHostPassword` supports legacy plaintext comparison and can re-hash on login (`host-dashboard` authenticate flow). Session tokens signed with **`HOST_SESSION_SECRET`** (or `SESSION_SECRET` fallback).
- **Guest chat:** No login; protection is **rate limiting** + **no raw DB secrets** in responses.

### 6.3 Transport and headers

- **Helmet** for secure headers.
- **CORS** allowlist: `FRONTEND_URL` + `http://localhost:5173`; credentials enabled.
- **`trust proxy: 1`** so rate limiting and IP logging work behind one reverse proxy hop (e.g. Vercel/load balancer).

### 6.4 Data minimization & logging

- CEO list and property responses **omit** sensitive columns where applicable (`host_password`, `reset_token`, `reset_requested_at`).
- **pino-http** **redacts** `Authorization`, `X-CEO-Session`, `X-Host-Session`, and sensitive body fields (`password`, `hostPassword`, `pdfBase64`).
- API errors avoid exposing **raw stack or upstream messages** to clients in hardened routes (Italian generic copy).

### 6.5 Operational environment (typical)

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Postgres connection |
| `OPENAI_API_KEY` | OpenAI API |
| `CEO_PASSWORD` | CEO login + signing key input |
| `HOST_SESSION_SECRET` | Host JWT-like session signing |
| `FRONTEND_URL` | CORS, QR links, email/chat links |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Verified sender address in Resend |
| `EMAIL_FROM_NAME` | Optional display name (HeyCico) for `From` |
| `PORT` | HTTP listen port |
| `BASE_PATH`, `PORT` (frontend) | Vite base URL and dev server port |

Use **`.env`** locally (gitignored); production should inject secrets via the host platform (e.g. Vercel/Railway/Render env UI).

---

## 7. Deployment Notes (High Level)

- **Two deployable units in practice:** static/SPA **`rome-guest`** build output and **Node** **`api-server`** process.
- **CORS:** Production `FRONTEND_URL` must exactly match the browser origin (scheme + host + port).
- **Database:** Run Drizzle **`push`** or migrations from `lib/db` against production `DATABASE_URL` as per your release process.
- **Graceful shutdown:** `SIGTERM` / `SIGINT` handlers close the HTTP server with a timeout fallback (`index.ts`).

---

## 8. Suggested Review Questions for External Models

1. Should **`shouldIncrementPendingQuestions`** move to a single configurable ruleset or ML classifier to reduce false positives (e.g. “WhatsApp” in tourism disclaimers)?
2. Is deriving **CEO signing keys from `CEO_PASSWORD`** acceptable vs a dedicated `CEO_SESSION_SECRET`?
3. **Multi-tenant** scale: sharding properties by org, audit logs, and stricter RBAC beyond CEO/host/guest.
4. **PDF generation server-side** vs client-only: trade-offs for consistency, font embedding, and attachment size limits.

---

*Generated from repository analysis. Update this file when major flows or packages change.*
