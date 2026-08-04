# HeyCico

**Assistente AI multilingua per host di case vacanze.** Ogni ospite trova la sua chat pubblica su un link o QR code; **Cico**, l'assistente AI, risponde in tempo reale basandosi sul regolamento della casa scritto dall'host — niente più messaggi ripetitivi su WhatsApp.

🔗 [heycico.com](https://heycico.com) · [Demo live](https://heycico.com/demo)

> Documento aggiornato il 4 agosto 2026, verificato riga per riga contro il codice sul branch `main`.

---

## Cos'è HeyCico

HeyCico è una piattaforma **multi-tenant SaaS** per host di case vacanze italiane. Ogni host gestisce una o più proprietà; ogni proprietà ha una **chat pubblica** (`/guest/:slug`) accessibile agli ospiti tramite link o QR code. La chat è gestita da **Cico**, un assistente conversazionale basato su `gpt-4o-mini`, che risponde attingendo esclusivamente al regolamento della casa (House Manual) scritto dall'host.

Gli host gestiscono i contenuti da una dashboard dedicata, consultano il log di tutte le conversazioni (**Super-Diario**) e vengono avvisati quando Cico non riesce a rispondere. Un **pannello CEO** gestisce l'intero ciclo commerciale: lead, onboarding delle proprietà, credenziali degli host.

**Stack:** React/Vite SPA + Express API + Supabase Postgres, interamente in TypeScript, organizzato come monorepo pnpm.

---

## Indice

- [Come funziona la chat](#come-funziona-la-chat)
- [Struttura del monorepo](#struttura-del-monorepo)
- [Frontend](#frontend---artifactsrome-guest)
- [Backend — Route map completa](#backend---artifactsapi-server)
- [Database](#database-supabase)
- [Sicurezza](#sicurezza)
- [Variabili d'ambiente](#variabili-dambiente)
- [Sviluppo locale](#sviluppo-locale)
- [Limiti noti](#limiti-noti)

---

## Come funziona la chat

```
Ospite apre /guest/:slug (o scansiona un QR code)
  → il frontend recupera i dati pubblici della proprietà
  → l'ospite scrive un messaggio
  → POST /api/properties/:slug/chat
       → rate limiting (60 richieste/ora per IP)
       → categorizzazione (domanda turistica vs gestionale)
       → costruzione del system prompt (regolamento casa + language lock)
       → chiamata a OpenAI gpt-4o-mini, risposta in streaming (SSE)
       → rilevamento automatico se Cico non ha saputo rispondere
       → log salvato in chat_logs, con badge "da gestire" per l'host se serve
  → risposta mostrata in chat, parola per parola
```

Punti distintivi dell'implementazione:

- **Risposta in streaming (SSE)**, non un singolo blocco di testo — l'ospite vede Cico scrivere in tempo reale.
- **Language lock**: Cico risponde sempre nella lingua dell'ultimo messaggio dell'ospite, indipendentemente dalla lingua del regolamento caricato dall'host — 11 lingue supportate in UI (IT, EN, DE, FR, ES, NL, PT, RU, JA, ZH, AR).
- **Manual-first**: Cico attinge solo al regolamento fornito dall'host; suggerisce il contatto WhatsApp dell'host solo per informazioni mancanti, emergenze o problemi tecnici irrisolvibili.
- **Modalità demo pubblica** (`/demo`, `/guest/demo`): regolamento fittizio precaricato, limite più stringente (12 messaggi/ora per sessione), nessuna persistenza dei log — pensata per far provare il prodotto senza esporre dati di proprietà reali.

---

## Struttura del monorepo

```
smartguest-ai/
├── artifacts/
│   ├── rome-guest/       # Frontend — React 18 + Vite (SPA)
│   ├── api-server/       # Backend — Express 5 + OpenAI + Supabase
│   └── mockup-sandbox/   # Mockup UI, non in produzione
├── lib/
│   ├── db/                  # Schema Drizzle ORM (mirror parziale di Supabase)
│   ├── api-zod/             # Schemi Zod condivisi, generati da OpenAPI
│   ├── api-spec/            # Spec OpenAPI + config Orval
│   └── api-client-react/    # Client React Query generato, incl. parser SSE
├── scripts/
└── package.json              # Root workspace pnpm
```

---

## Frontend — `artifacts/rome-guest`

**Stack:** React 18, Vite, Tailwind CSS, Framer Motion, Wouter, React Hook Form, Zod, react-markdown, qrcode.react, jsPDF.

### Rotte

| Path | Pagina | Accesso |
|---|---|---|
| `/` | Landing + form lead | Pubblico |
| `/demo` | Chat demo incorporata | Pubblico |
| `/guest/:slug` | Chat con Cico | Pubblico |
| `/login` | Login host | Host |
| `/host/dashboard` | Lista proprietà | Host autenticato |
| `/host/:slug` | Editor regolamento + tool AI | Host autenticato |
| `/diario/:slug` | Super-Diario (log conversazioni) | Host autenticato |
| `/ceo` | Pannello amministrativo | CEO |
| `/forgot-password`, `/reset-password/:token`, `/setup-password/:token` | Flussi di autenticazione | Pubblico (con token) |
| `/privacy` | Privacy policy | Pubblico |

### Pagine principali

**`landing.tsx`** — Pagina pubblica di marketing, con form di registrazione lead (`POST /api/leads`). Nessun account viene creato automaticamente: il CEO converte il lead in un secondo momento.

**`guest.tsx`** — La chat degli ospiti. Rileva la lingua dal browser, mostra chip di risposta rapida (WiFi, ristoranti, check-out), un messaggio di benvenuto localizzato al primo accesso, e un link WhatsApp come fallback umano sempre visibile.

**`host-dashboard.tsx`** — Editor del regolamento con due strumenti AI:
- *Registra vocale*: trascrizione audio via Whisper, appesa direttamente al regolamento
- *Scansiona foto*: estrazione testo da un'immagine (es. foto del citofono) via GPT-4o Vision

Mostra anche un badge con il conteggio delle domande in sospeso, aggiornato ogni 15 secondi.

**`diario.tsx`** — Il Super-Diario: log di tutte le conversazioni, diviso tra "in sospeso" (Cico non ha saputo rispondere) e "gestite".

**`ceo.tsx`** — Pannello amministrativo (gestione proprietà, lead, reset password, account host).

---

## Backend — `artifacts/api-server`

**Stack:** Express 5, TypeScript, Supabase (client `anon` + `service role`), OpenAI SDK, Pino, Multer, Resend.

Tutte le rotte sono prefissate `/api`. Validazione tramite Zod, boot-check delle variabili d'ambiente obbligatorie (`validateEnv.ts` — il server non si avvia se manca qualcosa di critico).

### Route map

**Guest chat & Diario**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/properties/:slug/chat` | Pubblico (rate limited) |
| GET | `/super-diario/:slug` | Host |
| GET | `/super-diario/:slug/unresolved-count` | Host |
| PATCH | `/super-diario/:slug/resolve/:id` | Host |
| POST | `/super-diario/:slug/refresh-all` | Host |

**Proprietà (CEO)**
| Metodo | Path | Auth |
|---|---|---|
| GET / POST | `/properties` | CEO |
| GET | `/properties/:slug` | Pubblico |
| PUT | `/properties/:slug`, `/properties/:slug/full-edit` | CEO |
| POST | `/properties/:slug/resend-host-welcome` | CEO |
| DELETE | `/properties/:slug` | CEO |

**Dashboard host**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/auth/host-login` | Pubblico (rate limited) |
| GET / PUT | `/host/:slug` | Host |
| POST | `/host/:slug/reset-pending-questions` | Host |
| POST | `/host/:slug/resolve-all-logs` | Host |
| PUT | `/properties/:slug/host-password` | CEO |

**Autenticazione**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/auth/ceo-login` | Pubblico |
| GET | `/auth/host/me` | Host (Bearer) |
| POST | `/auth/forgot-password` | Pubblico |
| GET/POST | `/auth/reset-password/:token`, `/auth/setup-password/:token` | Pubblico (token) |
| GET / DELETE | `/auth/resets`, `/auth/resets/:slug` | CEO |

**AI (strumenti host)**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/ai/transcribe` | Host — Whisper, max 25MB |
| POST | `/ai/vision` | Host — GPT-4o Vision |

**Lead**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/leads` | Pubblico |
| GET / DELETE | `/leads`, `/leads/:id` | CEO |
| PUT | `/leads/:id/status` | CEO |
| POST | `/leads/:id/convert` | CEO — crea host + proprietà, invia email di setup password |

**Admin host**
| Metodo | Path | Auth |
|---|---|---|
| GET / POST | `/admin/hosts` | CEO |
| DELETE | `/admin/hosts/:email` | CEO |
| GET | `/admin/properties-by-email` | CEO |

**Altro**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/send-pdf` | CEO — invia QR code proprietà via email |
| GET | `/healthz`, `/healthz/db` | Pubblico |

> **Nota copertura OpenAPI:** lo spec in `lib/api-spec/openapi.yaml` documenta solo le rotte principali di chat e proprietà. La maggior parte delle rotte CEO/host/auth non è ancora nello spec — miglioramento noto, non bloccante.

### Flusso lead → host

1. Form pubblico crea un lead (`status: "Nuovo"`)
2. Il CEO converte il lead: viene creata la proprietà con uno slug generato automaticamente e un token di invito a tempo (48 ore)
3. L'host riceve un'email di benvenuto con link di setup, imposta la propria password (hash bcrypt), e da quel momento accede con le proprie credenziali

---

## Database (Supabase)

PostgreSQL gestito da Supabase. Il backend opera quasi sempre tramite il client **service role**, con Row-Level Security attiva a livello di schema ma senza policy `anon` — l'accesso è di fatto riservato al server.

| Tabella | Contenuto |
|---|---|
| `properties` | Struttura ricettiva: slug, nome, regolamento (`content`/`manual_content`), numero WhatsApp, link di referral, contatore domande in sospeso, token di invito/reset |
| `hosts` | Account host: email (univoca), password (hash bcrypt) |
| `chat_logs` | Ogni scambio ospite↔Cico: messaggio, risposta, stato risolto/in sospeso |
| `leads` | Lead dalla landing page: nome, email, struttura dichiarata, stato pipeline |

La relazione host → proprietà è basata sull'email (`properties.email = hosts.email`), non su una foreign key esplicita.

---

## Sicurezza

Alcune scelte di design pensate per un prodotto che espone una chat pubblica non autenticata:

- **Rate limiting in-memory** per IP: 60 richieste/ora sulla chat, 10/ora sugli endpoint AI (trascrizione, vision), 10/ora su login/lead — rispetta `X-Forwarded-For` dietro proxy.
- **Sessioni host** firmate HMAC-SHA256, TTL di 8 ore, accettate via header `Authorization: Bearer` o `x-host-session`.
- **Ownership check esplicito**: ogni operazione su una proprietà verifica che l'email della sessione host corrisponda a quella proprietaria (`requireHostOwnsPropertySlug`), non solo che la sessione sia valida.
- **Guardrail AI dedicato**: limite separato di messaggi per sessione sulla modalità demo, per evitare abusi del limite di spesa OpenAI.
- **Scanning automatico attivo sul repository**: GitHub Secret Scanning, Push Protection e Dependabot abilitati.

---

## Variabili d'ambiente

Obbligatorie all'avvio del server (il boot fallisce esplicitamente se mancano):

| Variabile | Descrizione |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Accesso al database |
| `OPENAI_API_KEY` | Chat, trascrizione, vision |
| `CEO_PASSWORD` | Accesso al pannello CEO — nessun default, deve essere impostata |
| `FRONTEND_URL` | URL pubblico del frontend (CORS, link nelle email) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Invio email transazionali |
| `HOST_SESSION_SECRET` **o** `SESSION_SECRET` | Firma delle sessioni host |

Opzionali: `PORT` (default `8080`), `NODE_ENV`, `LOG_LEVEL`, `VITE_API_ORIGIN`, `EMAIL_FROM_NAME`.

---

## Sviluppo locale

```bash
pnpm install
pnpm dev
```

Avvia contemporaneamente API (porta 8080) e frontend (porta 5173), leggendo le variabili da un `.env` nella root — **mai committato**, vedi `.gitignore`.

Altri comandi utili:

```bash
pnpm run typecheck   # type-check di tutto il monorepo
pnpm run build       # build di produzione (typecheck + vite build + bundle API)
```

**Deploy:** frontend e backend sono due progetti Vercel separati; il frontend serve `heycico.com`.

---

## Limiti noti

Trasparenza sullo stato attuale, non tutto è rifinito:

- **Nessuna suite di test automatici** (né Playwright né Vitest) — il typecheck TypeScript è l'unico controllo automatizzato oggi.
- **Fatturazione Stripe non implementata** — esiste solo una bozza SQL, nessuna route API né UI collegata.
- **Rate limiting in-memory**: funziona bene su una singola istanza, andrebbe spostato su uno store condiviso (es. Redis) in caso di scaling orizzontale.
- **Copertura OpenAPI parziale**: solo le rotte principali sono documentate nello spec.

---

## Contatti

📧 [hello.heycico@gmail.com](mailto:hello.heycico@gmail.com)
