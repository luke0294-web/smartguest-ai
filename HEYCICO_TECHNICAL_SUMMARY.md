# HeyCico — Technical Summary (External AI Review)

This document summarizes the **current** architecture, security posture, data flow, and operational risks so an external AI or reviewer can assess the system **without** reading the full codebase. It is descriptive, not a substitute for code review.

---

## 1. Project Overview

| Item | Detail |
|------|--------|
| **Name** | HeyCico *(historical / internal reference: SmartGuest — no longer used in product UI)* |
| **Purpose** | AI-powered guest assistant for vacation rentals (B&B, apartments): multilingual chat from property manual, host dashboard, CEO multi-property admin |
| **Primary users** | **Guest** (public chat), **Host** (dashboard, manual, referral links), **CEO** (properties, leads, QR, host passwords) |

**Tech stack (monorepo, pnpm workspaces)**

| Layer | Technology |
|-------|------------|
| Frontend | Vite, React, Tailwind CSS, Wouter (routing), TanStack Query |
| Backend | Node.js, Express 5 |
| Database | Supabase (PostgreSQL), server uses **service role** only on API; guests never get DB credentials |
| AI | OpenAI (`gpt-4o-mini`), **SSE streaming** from API to browser |
| Email | **Resend** (transactional: welcome, password reset, PDF mail); configuration via env (`RESEND_*`, `EMAIL_FROM_NAME`, reply-to) |

**Shared packages (examples):** `@workspace/api-zod`, `@workspace/api-client-react` (generated client + SSE chat helper).

---

## 2. Branding & SEO State

| Item | State |
|------|--------|
| **Production domain** | `https://heycico.com` (also `www` allowed in CORS) |
| **`index.html` (rome-guest)** | `og:image`, favicon, shortcut icon, apple-touch-icon use **absolute** URLs under `https://heycico.com/...` with cache-busting query `?v=2` where applicable |
| **UI** | Primary accent: **blue**; testimonial stars: `text-yellow-400` / `fill-yellow-400` |
| **Copy / metadata** | Product string scan targets **HeyCico** / **Cico**; legacy **SmartGuest** should not appear in shipped UI *(verify periodically with repo-wide search)* |

---

## 3. Security & Anti-Abuse (CRITICAL)

### Secrets & client bundle

- API keys (OpenAI, Supabase service role, Resend, session secrets) are read from **`process.env`** on the **API server** only.
- Frontend exposes at most **`VITE_API_ORIGIN`** (public API base URL) — no provider secrets in the Vite bundle by design.

### Rate limiting & AI cost

| Mechanism | Location | Behavior |
|-----------|----------|----------|
| **IP chat limiter** | `artifacts/api-server/src/lib/rateLimiter.ts` | **`chatRateLimiter`**: **60 requests / IP / hour** (sliding window, in-memory). Applied to **`POST .../chat` for all slugs including `demo`**, so IP rotation is the main bypass vector at app layer. |
| **aiGuard** | `artifacts/api-server/src/lib/aiGuard.ts` | **Demo (`slug === "demo"`)**: **12 messages** per counter key (session id from body/header, else IP), TTL-style cleanup ~1h. **Non-demo**: optional **60 requests / minute** per **`x-session-id`** header when present; if header absent, IP limiter still applies. |
| **OpenAI** | `artifacts/api-server/src/routes/chat.ts` | **`max_tokens: 300`**, **`stream_options: { include_usage: true }`**, temperature ~0.4; **last 6** conversation turns sent as context. |

### Demo isolation

- **`demo`** uses **in-memory / static** manual (`demoProperty.ts`); **no Supabase property row read** for chat load on the demo path.
- Public **`GET /api/properties/demo`** returns parsed demo payload without DB.

### CORS

- **Not** `*`. Allowlist includes **`FRONTEND_URL`**, fixed **`https://heycico.com`**, **`https://www.heycico.com`**, and **`*.vercel.app`** (regex) for previews.
- Requests with **no `Origin`** header are allowed (typical for same-origin or some tools) — see `app.ts` for exact behavior.

### Sessions

- **Host**: HMAC-signed tokens (`host-session.ts`), salt `heycico-host-session-v1`, secret from `HOST_SESSION_SECRET` / `SESSION_SECRET`.
- **CEO**: HMAC with `CEO_PASSWORD` + salt `heycico-ceo-session-v1` (`ceo-session.ts`).

### HTTPS / URLs (production)

- Email links and QR generation require valid **`FRONTEND_URL`**; in **`NODE_ENV === "production"`**, helpers enforce **`https`** for `FRONTEND_URL` where implemented (`hostWelcomeMail.ts`, `generateQr.ts`).

---

## 4. Infrastructure & Deploy Assumptions

| Component | Typical hosting |
|-----------|-----------------|
| **SPA** | Vercel (or static) — **must** set **`VITE_API_ORIGIN`** to the Render API origin in production |
| **API** | Render (or any Node host) — env: Supabase, OpenAI, Resend, `FRONTEND_URL`, session secrets |
| **DB** | Supabase (managed Postgres) |

All user-facing production traffic should be **HTTPS**. QR codes and emails embed **`FRONTEND_URL`** — must match the live SPA (no trailing slash mismatch).

---

## 5. Data Flow (CRITICAL)

### Guest chat (happy path)

1. Browser loads **`/guest/:slug`** (`artifacts/rome-guest/src/pages/guest.tsx`).
2. Client may call **`GET /api/properties/:slug`** — for `demo`, static JSON; else Supabase-backed property + QR data URL.
3. User sends message → **`POST /api/properties/:slug/chat`** with JSON body (Zod-validated); client sends **`x-session-id`** (stable per browser session via `api-client-react`) for prod minute limits when applicable.
4. API: **`enforceAiMessageLimit`** → **IP `chatRateLimiter`** → load property (**demo** vs **Supabase**) → build **system prompt** (manual + referral block + rules) → **OpenAI streaming**.
5. Response: **SSE** (`text/event-stream`): `delta` chunks + final `done` with full reply metadata.
6. **If not demo**: persist **`chat_logs`** (and related pending-question logic) in Supabase.

### Host / CEO flows (abbreviated)

- **Host login**: email/password → session token; properties scoped by email ownership.
- **CEO**: password session → CRUD properties, leads, PDF email, host password reset tooling — routes guarded by `requireCeoSession` / similar.

---

## 6. Latest Cleanup (chronological)

Recent maintenance (example commit):

- Removed **Replit** project files (`.replit`, `.replitignore`, `replit.md`, `.replit-artifact/**`) and unused static assets (`opengraph.jpg`, `mediterranean-bg.png`, `attached_assets` notes).
- Adjusted **`vite.config`** (removed dead `@assets` alias), **`scripts`** package (removed `hello.ts`, added minimal `src/index.ts` for `tsc` inputs).
- Workspace **`pnpm run typecheck`** was run clean after changes.

---

## 7. Current Status

- **Ready for deployment** from a **code + typecheck** perspective, subject to correct **env** and **DNS/CORS** configuration on Vercel/Render.
- **Last stable commit referenced in this summary:** `3582e69c224ce041f5d0d452890ea02abbeb943e` *(update this line after future major commits)*.

---

## 8. Known Limitations & Roadmap

| Topic | Limitation |
|-------|----------|
| **Payments** | **Stripe** (or similar) **not** implemented in this summary’s scope |
| **Rate limiting** | **In-memory** (`Map` in process) — **not** shared across instances; **resets on deploy/restart**; no Redis |
| **Host ↔ property** | Ownership tied to **email** and tables as implemented — no separate doc-level FK summary here |
| **Password policy** | Host passwords: minimum length enforced in API (e.g. 8 chars) — see `passwords.ts` |
| **Tests** | **No** comprehensive automated test suite called out in repo scripts for this summary |

---

## 9. Critical Files Reference

| Concern | Path |
|---------|------|
| **AI chat + SSE + OpenAI** | `artifacts/api-server/src/routes/chat.ts` |
| **Auth (host, CEO, reset, setup)** | `artifacts/api-server/src/routes/auth.ts` |
| **Demo manual & slug** | `artifacts/api-server/src/lib/demoProperty.ts` |
| **Guest UI** | `artifacts/rome-guest/src/pages/guest.tsx` |
| **Limits (demo + prod session)** | `artifacts/api-server/src/lib/aiGuard.ts` |
| **IP rate limiter** | `artifacts/api-server/src/lib/rateLimiter.ts` |
| **CORS / middleware** | `artifacts/api-server/src/app.ts` |
| **Email + PDF** | `artifacts/api-server/src/lib/hostWelcomeMail.ts`, `routes/send-pdf.ts` |
| **Resend** | `artifacts/api-server/src/lib/resend.ts` |

---

## 10. What NOT to Change Without Deep Review

- **SSE streaming** and **OpenAI call shape** in `chat.ts` (breaks UX, costs, error handling).
- **System prompt** and **rule blocks** in `chat.ts` (safety, tone, compliance).
- **`aiGuard.ts`** and **`rateLimiter.ts`** (cost and abuse surface).
- **Session crypto** in `host-session.ts` and `ceo-session.ts` (auth integrity).
- **Zod contracts** in `api-zod` / generated client (breaking changes across FE/BE).

---

## 11. Risks & Attention Points

| Risk | Note |
|------|------|
| **In-memory limits** | Horizontal scaling = **per-instance** counters; abuse window larger under load balancers without sticky sessions or Redis. |
| **Missing `x-session-id`** | Prod **per-minute** session limit may not apply; **IP** limit still applies. |
| **CORS / `FRONTEND_URL`** | Must match real browser origins (including `www` vs apex) or previews break. |
| **OpenAI cost** | Limits reduce risk; **not** a guarantee against distributed or multi-IP abuse. |
| **Logging** | Pino HTTP redacts auth headers; still avoid logging full tokens in new code. |

---

## 12. External AI Usage Context

This document is meant for:

- **External AI assistants** (ChatGPT, Claude, Gemini, etc.) doing **architecture / security Q&A**
- **Onboarding** engineers without dumping the entire repo
- **Pre-audit** checklists before penetration tests or compliance reviews

It is **not** a legal contract, warranty, or substitute for **production** monitoring, **WAF**, or **formal** security assessment.

---

**Final note:** This summary reflects the **intended** production-ready state of **HeyCico** at the time of writing; always verify against the **latest** commit and deployed environment variables.
