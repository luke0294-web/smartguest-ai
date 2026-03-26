# RomeGuest AI Workspace

## Overview

pnpm workspace monorepo using TypeScript. Multi-property RAG-based AI chat platform for professional Airbnb hosts. Marco is the AI assistant that responds only from the host's knowledge base, always in the guest's language.

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

## Application: RomeGuest AI — Professional Host Suite

A multi-property RAG-based AI chat platform. Hosts manage multiple properties from the CEO panel. Each property gets its own guest-facing chat URL.

### Routes

- `/` → Landing page (public)
- `/login` → Host login (slug + password)
- `/ceo` → Super-admin CEO panel — **secret** (password: `fleming2026`)
- `/admin` → redirect to `/ceo` (deprecated)
- `/guest/:slug` → Tourist chat interface for a specific property
- `/host/:slug` → Individual host dashboard (host auth)
- `/forgot-password` → Password recovery form (email input)
- `/reset-password/:token` → Set new password via magic link token
- `*` → 404 not-found page

### Features

1. **CEO Panel** (`/ceo`, 3 tabs): Manage all properties with inline editing (name, slug, email, password). "Richieste Reset" tab shows pending password reset tokens with copyable magic links for WhatsApp forwarding.
2. **Host Login** (`/login`): Slug + password auth, stores session in sessionStorage (8h expiry). "Hai dimenticato la password?" link opens recovery flow.
3. **Password Recovery**: Host enters email → server generates 32-byte hex token (stored in DB). CEO sees the magic link in the "Richieste Reset" tab and forwards it via WhatsApp. Token is **single-use** — invalidated after password reset.
4. **Host Dashboard** (`/host/:slug`): Hosts edit their property name, content, and WhatsApp number.
5. **Guest Chat** (`/guest/:slug`): Mobile-friendly chat. Marco responds only from property-specific content, always in guest's language. WhatsApp SOS button, 4 quick-reply buttons, typing animation.
6. **AI Safety**: Anti-over-refusal — Marco proactively suggests from available info before refusing. Falls back to WhatsApp only when genuinely missing info.

### API Endpoints

- `GET /api/properties?ceoPassword=...` — List all properties (CEO only, returns `hostPassword`, `email` in full)
- `POST /api/properties` — Create property (CEO only)
- `GET /api/properties/:slug` — Get one property (public)
- `PUT /api/properties/:slug` — Update property (CEO only)
- `PUT /api/properties/:slug/full-edit` — CEO inline edit: name, slug, email, hostPassword
- `PUT /api/properties/:slug/host-password` — Set host password (CEO only)
- `DELETE /api/properties/:slug` — Delete property (CEO only)
- `POST /api/properties/:slug/chat` — Send message to Marco for a property
- `GET /api/host/:slug?hostPassword=...` — Host auth (returns property without password)
- `PUT /api/host/:slug` — Host updates name/content/whatsapp (host auth)
- `POST /api/auth/forgot-password` — Accepts email, generates reset token (always returns success)
- `GET /api/auth/reset-password/:token` — Validates token (returns propertyName + slug)
- `POST /api/auth/reset-password/:token` — Consumes token, sets new password (single-use)
- `GET /api/auth/resets?ceoPassword=...` — CEO: list pending reset requests
- `DELETE /api/auth/resets/:slug` — CEO: cancel a pending reset token
- `GET /api/healthz` — Health check

### DB Schema: `properties` table

`id`, `slug` (unique), `name`, `content`, `whatsapp_number`, `host_password`, `email`, `reset_token`, `reset_requested_at`, `created_at`, `updated_at`

### Environment Variables

- `OPENAI_API_KEY` — OpenAI API key (required)
- `CEO_PASSWORD` — CEO panel password (default: `fleming2026`)
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/              # Express API server with OpenAI integration
│   │   └── src/routes/
│   │       ├── properties.ts    # CRUD for properties (CEO-authenticated)
│   │       ├── chat.ts          # Marco AI chat per property slug
│   │       ├── health.ts        # Health check
│   │       └── index.ts         # Router aggregator
│   └── rome-guest/              # React + Vite frontend
│       └── src/pages/
│           ├── guest.tsx        # Tourist chat interface (/guest/:slug)
│           ├── ceo.tsx          # Super-admin CEO panel (/ceo)
│           └── not-found.tsx    # 404 page
├── lib/
│   ├── api-spec/                # OpenAPI spec + Orval codegen config
│   ├── api-client-react/        # Generated React Query hooks
│   ├── api-zod/                 # Generated Zod schemas from OpenAPI
│   └── db/                      # Drizzle ORM schema
│       └── src/schema/
│           └── properties.ts    # properties table (id, slug, name, content, whatsappNumber, timestamps)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Database

- Table: `properties` (id SERIAL, slug TEXT UNIQUE, name TEXT, content TEXT, whatsapp_number TEXT, created_at, updated_at)
- Old table `host_knowledge` is superseded but may still exist in DB (not exported from schema)
