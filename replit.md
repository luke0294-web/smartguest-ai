# RomeGuest AI Workspace

## Overview

pnpm workspace monorepo using TypeScript. Hosts a full-stack AI-powered guest assistant for Airbnb hosts in Rome.

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
- **AI**: OpenAI GPT-4o-mini (RAG pattern)
- **Frontend**: React + Vite, Tailwind CSS, Wouter routing

## Application: RomeGuest AI

A RAG-based AI chat assistant for Airbnb hosts. Tourists ask questions about the apartment and get answers based solely on the host's provided knowledge base.

### Features

1. **Tourist Chat** (`/`): Mobile-friendly chat interface where tourists ask questions. AI responds only from host-provided content.
2. **Host Panel** (`/host`): Protected panel where the host enters apartment rules, WiFi password, tips etc. Password protected (`host123` default, configurable via `HOST_PASSWORD` env var).
3. **AI Safety Rule**: If the question isn't in the host's text, AI politely says to contact the host.

### API Endpoints

- `GET /api/host/knowledge` — Get the current host knowledge base
- `PUT /api/host/knowledge` — Update host knowledge (requires `hostPassword`)
- `POST /api/chat` — Send a message and get an AI response
- `GET /api/healthz` — Health check

### Environment Variables

- `OPENAI_API_KEY` — OpenAI API key (required)
- `HOST_PASSWORD` — Password for host panel (default: `host123`)
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Replit)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server with OpenAI integration
│   └── rome-guest/         # React + Vite frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema (host_knowledge table)
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

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with OpenAI integration. Routes:
- `src/routes/chat.ts` — RAG chat with GPT-4o-mini
- `src/routes/host.ts` — Host knowledge base CRUD
- `src/routes/health.ts` — Health check

### `artifacts/rome-guest` (`@workspace/rome-guest`)

React + Vite frontend. Pages:
- `src/pages/chat.tsx` — Tourist chat interface
- `src/pages/host.tsx` — Host panel

### `lib/db` (`@workspace/db`)

- `src/schema/knowledge.ts` — `host_knowledge` table (id, content, updatedAt)
