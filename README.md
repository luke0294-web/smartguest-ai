# HeyCico

**Assistente AI multilingua per host di case vacanze.** Ogni ospite trova la sua chat pubblica su un link o QR code; **Cico**, l'assistente AI, risponde in tempo reale basandosi sul regolamento della casa scritto dall'host — niente più messaggi ripetitivi su WhatsApp.

🔗 [heycico.com](https://heycico.com) · [Demo live](https://heycico.com/demo)

> Documento aggiornato il 14 ottobre 2026 (controllo generale), allineato al codice di `main` più le PR #43–#50.

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
       → rate limiting (100 richieste/ora per IP, controllato per primo)
       → categorizzazione (domanda turistica vs gestionale)
       → costruzione del system prompt (regolamento casa + language lock)
       → chiamata a OpenAI gpt-4o-mini, risposta in streaming (SSE)
       → rilevamento automatico se Cico non ha saputo rispondere
       → log salvato in chat_logs, con badge "da gestire" per l'host se serve
  → risposta mostrata in chat, parola per parola
```

Punti distintivi dell'implementazione:

- **Risposta in streaming (SSE)**, non un singolo blocco di testo — l'ospite vede Cico scrivere in tempo reale.
- **Language lock**: Cico risponde sempre nella lingua dell'ultimo messaggio dell'ospite, indipendentemente dalla lingua del regolamento caricato dall'host — 11 lingue supportate in UI (IT, EN, DE, FR, ES, NL, ZH, JA, KO, PT, PL).
- **Manual-first**: Cico attinge solo al regolamento fornito dall'host; suggerisce il contatto WhatsApp dell'host solo per informazioni mancanti, emergenze o problemi tecnici irrisolvibili.
- **Modalità demo pubblica** (`/demo`, `/guest/demo`): regolamento fittizio precaricato, limite più stringente (12 messaggi per sessione e 36 per rete, azzerati un'ora dopo l'ultimo messaggio), nessuna persistenza dei log — pensata per far provare il prodotto senza esporre dati di proprietà reali.
- **Demo personalizzate per l'outreach** (`/demo/demo-…`): il CEO crea dal pannello (tab "Demo") un link per un singolo prospect, con informazioni vere sulla sua struttura, da mandare nel messaggio con una "domanda curiosa" da fare a Cico. Stesse regole della demo pubblica; registra quando il prospect scrive per la prima volta.

---

## Struttura del monorepo

```
smartguest-ai/
├── artifacts/
│   ├── rome-guest/       # Frontend — React 19 + Vite (SPA)
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

**Stack:** React 19, Vite, Tailwind CSS, Framer Motion, Wouter, React Hook Form, Zod, react-markdown, qrcode.react, jsPDF.

### Rotte

| Path | Pagina | Accesso |
|---|---|---|
| `/` | Landing + form lead | Pubblico |
| `/demo` | Chat demo incorporata | Pubblico |
| `/demo/:slug` | Demo personalizzata (solo slug `demo-…`) | Pubblico |
| `/guest/:slug` | Chat con Cico | Pubblico |
| `/signup` | Redirect a `/?register=1` (apre il modale di registrazione sulla landing) | Pubblico |
| `/login` | Login host | Host |
| `/host/dashboard` | Lista proprietà | Host autenticato |
| `/host/:slug` | Editor regolamento + tool AI | Host autenticato |
| `/diario/:slug` | Super-Diario (log conversazioni) | Host autenticato |
| `/ceo` | Pannello amministrativo | CEO |
| `/admin` | Redirect a `/ceo` | CEO |
| `/forgot-password`, `/reset-password/:token`, `/setup-password/:token` | Flussi di autenticazione | Pubblico (con token) |
| `/privacy` | Privacy policy | Pubblico |

### Pagine principali

**`landing.tsx`** — Pagina pubblica di marketing, con form di registrazione lead (`POST /api/leads`). Nessun account viene creato automaticamente: il CEO converte il lead in un secondo momento.

**`guest.tsx`** — La chat degli ospiti. Rileva la lingua dal browser, mostra chip di risposta rapida (WiFi, ristoranti, check-out), un messaggio di benvenuto localizzato al primo accesso, e un link WhatsApp come fallback umano sempre visibile.

**`host-dashboard.tsx`** — Editor del regolamento con due strumenti di estrazione testo:
- *Carica Documento*: estrae il testo da un PDF o Word (.docx) caricato — parsing nativo lato server, nessuna chiamata AI
- *Scansiona Foto*: estrazione testo da una foto scattata sul momento (es. cartello WiFi, citofono) via `gpt-4o-mini` (vision)

Mostra anche un badge con il conteggio delle domande in sospeso, aggiornato ogni 15 secondi.

**`diario.tsx`** — Il Super-Diario: log di tutte le conversazioni, diviso tra "in sospeso" (Cico non ha saputo rispondere) e "gestite".

**`ceo.tsx`** — Pannello amministrativo (gestione proprietà, lead, reset password, account host, demo personalizzate).

---

## Backend — `artifacts/api-server`

**Stack:** Express 5, TypeScript, Supabase (solo client `service role`), OpenAI SDK, Pino, Multer, Resend.

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
| POST | `/ai/transcribe` | Host — Whisper, max 25MB (attualmente non usata dal frontend) |
| POST | `/ai/vision` | Host — `gpt-4o-mini` (vision) |
| POST | `/ai/extract-document` | Host — parsing nativo PDF/.docx, max 15MB, nessuna chiamata AI |

**Lead**
| Metodo | Path | Auth |
|---|---|---|
| POST | `/leads` | Pubblico |
| GET / DELETE | `/leads`, `/leads/:id` | CEO |
| PUT | `/leads/:id/status` | CEO |
| POST | `/leads/:id/convert` | CEO — crea host + proprietà, invia email di setup password |

**Demo personalizzate**
| Metodo | Path | Auth |
|---|---|---|
| GET / POST | `/demo-prospects` | CEO |
| DELETE | `/demo-prospects/:slug` | CEO |

La chat e la lettura pubblica di una demo personalizzata passano dalle rotte normali (`/properties/demo-…/chat`, `GET /properties/demo-…`).

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
| GET | `/ciao` | Pubblico — health check legacy ("Il server è vivo e vegeto! 🚀") |

> **OpenAPI:** lo spec in `lib/api-spec/openapi.yaml` copre tutte le rotte. `lib/api-zod` e `lib/api-client-react` si rigenerano con `pnpm --filter @workspace/api-spec codegen`, **ma** il file zod generato contiene alcune correzioni a mano che orval cancella: sono elencate in cima a `lib/api-spec/orval.config.ts` e vanno ripristinate dopo ogni rigenerazione (controlla sempre il `git diff`).

### Flusso lead → host

1. Form pubblico crea un lead (`status: "Nuovo"`)
2. Il CEO converte il lead: viene creata la proprietà con uno slug generato dal nome più un suffisso casuale di 8 caratteri (es. `casa-roma-k3x9p2qa`, così il link ospite non si indovina) e un token di invito a tempo (48 ore)
3. L'host riceve un'email di benvenuto con link di setup, imposta la propria password (hash bcrypt), e da quel momento accede con le proprie credenziali

---

## Database (Supabase)

PostgreSQL gestito da Supabase. Il backend usa **sempre e solo** il client **service role**. Row-Level Security è attiva su tutte le tabelle senza alcuna policy, quindi con la chiave anon/publishable non si legge nulla: l'accesso è riservato al server. Per `properties` va eseguito una volta `supabase/properties_rls.sql`.

| Tabella | Contenuto |
|---|---|
| `properties` | Struttura ricettiva: slug, nome, regolamento (`content`/`manual_content`), numero WhatsApp, link di referral, contatore domande in sospeso, token di invito/reset |
| `hosts` | Account host: email (univoca), password (hash bcrypt) |
| `chat_logs` | Ogni scambio ospite↔Cico: messaggio, risposta, stato risolto/in sospeso |
| `leads` | Lead dalla landing page: nome, email, struttura dichiarata, stato pipeline |
| `demo_prospects` | Demo personalizzate per l'outreach: slug `demo-…`, nome e fatti reali della struttura, domanda suggerita, primo messaggio ricevuto |

La relazione host → proprietà è basata sull'email (`properties.email = hosts.email`), non su una foreign key esplicita. Allo stesso modo `chat_logs.property_slug` non ha una foreign key: è il codice a spostare le conversazioni quando una proprietà cambia slug e a cancellarle quando viene eliminata.

Gli script SQL (da eseguire a mano nel SQL Editor di Supabase) sono in `artifacts/api-server/supabase/`. `lib/db` è solo un mirror Drizzle a scopo di documentazione: il server non lo usa.

---

## Sicurezza

Alcune scelte di design pensate per un prodotto che espone una chat pubblica non autenticata:

- **Rate limiting in-memory** per IP (`req.ip`, con `trust proxy` = 1 hop; gli IPv6 sono raggruppati per /64, perché una sola connessione riceve un intero /64):
  - chat: 100/ora, controllato prima di tutto il resto, più 60/minuto per sessione (`x-session-id`, o per IP se manca);
  - demo: 12 messaggi per sessione e 36 per IP, azzerati un'ora dopo l'ultimo messaggio; il limite per IP risponde `Demo IP limit reached` e non blocca la scheda;
  - trascrizione e vision: 10/ora ciascuna; lettura documenti: 20/ora;
  - login CEO: 5/ora per IP (nessun blocco globale, che permetterebbe a chiunque di chiudere fuori il CEO);
  - login host, recupero password e form lead: 10/ora ciascuno, con contatori separati;
  - recupero password: al massimo una email ogni 15 minuti per indirizzo (la risposta è sempre la stessa);
  - lettura pubblica di una proprietà: 300/ora.

  Per verificare che Render passi davvero un solo proxy, imposta `LOG_PROXY_DEBUG=true`, apri il sito e confronta `ip` e `xForwardedFor` nei log.
- **Sessioni host** firmate HMAC-SHA256, TTL di 8 ore, accettate via header `Authorization: Bearer` o `x-host-session`.
- **Ownership check esplicito**: ogni operazione su una proprietà verifica che l'email della sessione host corrisponda a quella proprietaria (`requireHostOwnsPropertySlug`), non solo che la sessione sia valida.
- **Guardrail AI dedicato**: limite separato di messaggi sulla modalità demo, per evitare abusi del limite di spesa OpenAI. Il campo `language` della chat accetta solo le lingue supportate (finisce nel prompt di sistema). Non esiste un tetto di spesa globale nel codice: va impostato un limite mensile nella dashboard OpenAI.
- **Limiti sui campi**: nome struttura 200 caratteri, WhatsApp 30, link di referral 2000, regolamento 20.000; form lead: nome 120, email 254, struttura 200.
- **Log puliti**: i token di reset e invito negli URL vengono oscurati (`[redacted]`), le email mascherate (`ma***@gmail.com`). Anche gli URL inviati a Vercel Analytics hanno i token oscurati.
- **Token di reset e invito**: 256 bit casuali, salvati come hash SHA-256, monouso (consumati con una scrittura atomica), scadenza 2 ore (reset) e 48 ore (invito).
- **Scanning automatico attivo sul repository**: GitHub Secret Scanning, Push Protection e Dependabot abilitati.

---

## Variabili d'ambiente

Obbligatorie all'avvio del server (il boot fallisce esplicitamente se mancano):

| Variabile | Descrizione |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Accesso al database |
| `OPENAI_API_KEY` | Chat, trascrizione, vision |
| `CEO_PASSWORD` | Accesso al pannello CEO — nessun default, deve essere impostata |
| `FRONTEND_URL` | URL pubblico del frontend (CORS, link nelle email) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Invio email transazionali |
| `HOST_SESSION_SECRET` **o** `SESSION_SECRET` | Firma delle sessioni host |

All'avvio il server avvisa nei log (senza bloccarsi) se `CEO_PASSWORD` ha meno di 16 caratteri o il segreto di sessione meno di 32. `SUPABASE_ANON_KEY` non serve più: il server usa solo la chiave service role.

**Frontend (Vercel):** `VITE_API_ORIGIN`, cioè l'URL pubblico dell'API su Render, è **obbligatoria**: senza di lei la build di produzione si ferma, invece di pubblicare un sito bianco.

**Build dell'intero monorepo** (`pnpm run build`, come in CI): oltre a `VITE_API_ORIGIN` servono `PORT` e `BASE_PATH`, richieste dal `vite.config.ts` di `artifacts/mockup-sandbox` (bastano valori fittizi, es. `PORT=5174 BASE_PATH=/`).

Opzionali lato server: `PORT` (default `8080`), `LOG_LEVEL`, `EMAIL_FROM_NAME`, `ENABLE_RATE_LIMITING`, `EMAIL_REPLY_TO` / `RESEND_REPLY_TO`, `LOG_PROXY_DEBUG`. Lato frontend/dev: `BASE_PATH`, `REPL_ID`, `API_PROXY_TARGET`.

`ENABLE_RATE_LIMITING` (`true`/`false`): forza esplicitamente l'hardening di produzione (rate limiting, limiti AI, allowlist CORS, occultamento errori Supabase dettagliati). Se non impostata, vale `NODE_ENV === "production"`. **Nota:** `build.ts` fissa `NODE_ENV` a `"production"` dentro il bundle, quindi il server compilato ha sempre l'hardening attivo, qualunque sia il `NODE_ENV` impostato su Render; l'unico modo di spegnerlo è `ENABLE_RATE_LIMITING=false`.

`BASE_PATH`: base path del deploy frontend (usato da Vite in `vite.config.ts`, es. per servire l'app da un sottopercorso). `EMAIL_REPLY_TO` / `RESEND_REPLY_TO`: indirizzo reply-to per le email transazionali via Resend. `REPL_ID`: usato dal plugin Vite Replit-specific in sviluppo. `API_PROXY_TARGET`: target del proxy Vite verso l'API in sviluppo locale.

**Variabili in `.env` non referenziate nel codice:** `EMAIL_USER`, `EMAIL_PASS`, `AI_INTERNAL_API_KEY`, `VITE_INTERNAL_API_KEY`, `STRIPE_PRICE_ID`, `STRIPE_SECRET_KEY`. Sono riservate per feature future (billing Stripe, non ancora implementato su `main`) e possono essere rimosse in sicurezza se non si prevede di implementarle a breve.

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
pnpm run test        # test Vitest del backend (artifacts/api-server/src/**/*.test.ts)
pnpm run build       # build di produzione (typecheck + vite build + bundle API)
```

**Deploy:** il frontend è un progetto Vercel (`artifacts/rome-guest`, output `dist/public`) e serve `heycico.com`; il backend gira su Render come Node service persistente, non su Vercel. Node è fissato a `22.x` (`engines` nei `package.json`), lo stesso della CI.

La configurazione di Render vive solo nella sua dashboard (non c'è un `render.yaml`). Valori di riferimento: build `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`, start `node artifacts/api-server/dist/index.cjs`. La build usa dipendenze di sviluppo (`tsx`, `esbuild`): se un giorno Render installasse solo quelle di produzione (per esempio con `NODE_ENV=production` già attivo durante l'installazione), la build fallirebbe.

---

## Limiti noti

Trasparenza sullo stato attuale, non tutto è rifinito:

- **Test solo sul backend**: Vitest copre le librerie di `api-server` (sessioni, password, token, rate limiter, slug, log, documenti). Il frontend non ha test automatici.
- **Fatturazione Stripe non implementata** — esiste solo una bozza SQL, nessuna route API né UI collegata.
- **Rate limiting in-memory**: funziona bene su una singola istanza, andrebbe spostato su uno store condiviso (es. Redis) in caso di scaling orizzontale.
- **Contatore "domande in sospeso"**: incrementato con lettura+scrittura, non atomico — due messaggi nello stesso istante possono contarne uno solo. Serve una funzione SQL per renderlo atomico.

---

## Contatti

📧 [hello.heycico@gmail.com](mailto:hello.heycico@gmail.com)
