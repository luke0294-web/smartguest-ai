# HeyCico — Documentazione Tecnica Completa

> Documento redatto il 31 marzo 2026. Aggiornare questa sezione ad ogni modifica architetturale rilevante.

---

## Cos'è HeyCico

HeyCico è una piattaforma **multi-tenant SaaS** per host di case vacanze italiane.
Ogni host ha una o più proprietà. Ogni proprietà ha una **chat pubblica** accessibile agli ospiti tramite un link o un QR code. La chat è gestita da **Marco AI**, un assistente virtuale alimentato da `gpt-4o-mini` che risponde alle domande degli ospiti basandosi sul regolamento inserito dall'host.

Il progetto è interamente in TypeScript, organizzato come monorepo pnpm con tre artifact principali.

---

## Struttura del Monorepo

```
workspace/
├── artifacts/
│   ├── rome-guest/          # Frontend React + Vite (tutto il browser)
│   └── api-server/          # Backend Express + OpenAI
├── lib/
│   ├── db/                  # Schema Drizzle ORM + client Postgres
│   ├── api-zod/             # Schemi Zod condivisi (validazione request/response)
│   └── api-client-react/    # Client React Query generato da openapi-ts
└── package.json             # Root workspace pnpm
```

---

## Artifact 1 — Frontend (`artifacts/rome-guest`)

**Stack:** React 18, Vite, Tailwind CSS, Framer Motion, Wouter, React Hook Form, Zod, react-markdown, qrcode.react, jsPDF.

### Routing (Wouter)

| Path | Componente | Chi accede |
|---|---|---|
| `/` | `Landing` | Pubblico — landing page + form lead |
| `/login` | `HostLogin` | Host — login con email + password |
| `/guest/:slug` | `GuestChat` | Ospiti — chat con Marco AI |
| `/host/dashboard` | `HostProperties` | Host autenticato — lista strutture |
| `/host/:slug` | `HostDashboard` | Host autenticato — editor regolamento + AI tools |
| `/diario/:slug` | `DiarioDiBordo` | Host autenticato — log conversazioni |
| `/ceo` o `/admin` | `CeoPanel` | CEO — pannello admin completo |
| `/forgot-password` | `ForgotPassword` | Host — richiesta reset password |
| `/reset-password/:token` | `ResetPassword` | Host — impostazione nuova password |
| `/privacy` | `PrivacyPolicy` | Pubblico |

### Pagine principali

#### `landing.tsx`
La pagina pubblica di marketing. Contiene anche il **form di registrazione lead**: quando un host compila il form (nome, email, nome struttura), viene creato un record nella tabella `leads` via `POST /api/leads`. Nessun account viene creato automaticamente — il CEO dovrà convertire il lead.

#### `guest.tsx`
La chat degli ospiti. Caratteristiche principali:
- Mostra i **quick reply button** in 11 lingue (IT, EN, DE, FR, ES, NL, PT, RU, JA, ZH, AR). La lingua è rilevata automaticamente dal browser.
- Mantiene la `conversationHistory` in stato locale (array di `{ role, content }`).
- Ogni messaggio chiama `POST /api/properties/:slug/chat` passando il testo e la cronologia.
- L'interfaccia `ConversationMessage` è definita localmente nel file (`role: "user" | "assistant"`) — **non** importata da api-client.
- Il link WhatsApp SOS è visibile nella UI come fallback umano.

#### `host-dashboard.tsx`
Dashboard dell'host per una singola struttura. Funzionalità:
- **Form di modifica**: nome struttura, numero WhatsApp SOS, textarea del regolamento (Knowledge Base).
- **Template default**: se il campo `content` è vuoto al caricamento, la textarea viene pre-riempita con un template Markdown completo (WiFi, check-in/out, parcheggio, rifiuti, regole, ecc.).
- **AI Tools**:
  - *Registra Vocale*: registra audio via `MediaRecorder`, invia a `POST /api/ai/transcribe` (OpenAI Whisper), appende il testo trascritto alla textarea.
  - *Scansiona Foto*: carica un'immagine, invia a `POST /api/ai/vision` (GPT-4o Vision), appende il testo estratto alla textarea.
- **Badge Diario**: mostra il conteggio delle conversazioni in sospeso, aggiornato ogni 15 secondi.
- La sessione host è in `sessionStorage` (chiave `host_session`, TTL 8 ore).

#### `host-properties.tsx`
Lista delle strutture dell'host loggato. Legge la sessione da `sessionStorage`, ri-autentica via `POST /api/auth/host-login` e mostra le proprietà associate all'email. Da qui si naviga alla dashboard di ogni struttura o al Diario.

#### `diario.tsx`
Il **Diario di Bordo** — log di tutte le conversazioni ospiti per una struttura. Le conversazioni sono classificate in:
- **In sospeso** (bordo rosso): Marco non ha saputo rispondere — rilevato da `detectNeedsAttention()`.
- **Gestite**: conversazioni normali o già segnate come risolte dall'host.

L'host può premere "Segna come gestito" per marcare una conversazione come `resolved: true` via `PATCH /api/super-diario/:slug/resolve/:id`.

#### `ceo.tsx`
Pannello CEO (1800+ righe). Autenticazione tramite `CEO_PASSWORD` (env var, obbligatoria, nessun default). Quattro tab:
1. **Proprietà**: lista completa, creazione, eliminazione, modifica inline (slug, nome, password host, email, content).
2. **Lead**: lista dei lead da landing page, cambio stato, eliminazione, **conversione in host** (crea host + proprietà + slug automatico).
3. **Reset password**: lista dei token di reset in attesa, possibilità di annullarli.
4. **Host**: gestione diretta degli account host (creazione, cambio password, eliminazione).

Contiene due sub-modale:
- `QrModal`: genera QR code della chat ospiti, scarica PDF A4, copia link, invia PDF via email.
- `HostPasswordModal`: imposta/reimposta la password host di una proprietà.
- `ContentEditModal`: modifica la knowledge base di una proprietà direttamente dal CEO panel.

### Lib files

#### `lib/detectNeedsAttention.ts`
Funzione `detectNeedsAttention(marcoReply: string): boolean`.
Rileva se la risposta di Marco indica che non ha saputo rispondere (e l'ospite ha bisogno di assistenza umana). Usa una lista di **negative indicators** in 6+ lingue: scuse, frasi "non ho questa info", suggerimenti di contattare l'host, presenza della parola "whatsapp", ecc. Usata sia dal frontend (`diario.tsx`) sia dal backend (`chat.ts`) per impostare il flag `resolved` del log.

---

## Artifact 2 — Backend (`artifacts/api-server`)

**Stack:** Express 5, TypeScript, **Supabase** (PostgreSQL), OpenAI SDK, Pino (logger), Multer (upload file), **Resend** (email transazionale), pino-http.

Il server ascolta sulla porta definita da `process.env.PORT` (default 8080). Tutte le route sono prefissate `/api`.

### Route Files

#### `routes/chat.ts` — Marco AI

**`POST /api/properties/:slug/chat`**

Il cuore del prodotto. Flusso:
1. **Rate limiting** (30 req/ora per IP, implementato in `lib/rateLimiter.ts`).
2. Validazione params e body con schemi Zod (`SendPropertyChatParams`, `SendPropertyChatBody`).
3. Recupero proprietà dal DB via slug.
4. Guardia: se `content` è vuoto, risponde con messaggio generico.
5. **Categorizzazione**: `categorizeMessage()` da `lib/categorizeMessage.ts` determina se la domanda è turistica o gestionale.
6. Costruzione **System Prompt** con architettura a due modalità:
   - `FLEXIBLE MODE`: domande sul territorio, ristoranti, trasporti — Marco può usare le sue conoscenze generali + un disclaimer.
   - `STRICT MODE`: domande su WiFi, regole, parcheggio, rifiuti — Marco legge SOLO la Knowledge Base. Se non trova risposta, usa la frase canonica `"non ho questa info"` + redirect WhatsApp.
7. Chiamata a OpenAI `gpt-4o-mini` con `temperature: 0.4`.
8. `detectNeedsAttention()` sul reply → se `true`, il log viene salvato con `resolved: false` (comparirà nel Diario).
9. Salvataggio in `chat_logs` + risposta al client.

**`GET /api/super-diario/:slug`** — tutti i log di una proprietà, ordinati per data decrescente.
**`PATCH /api/super-diario/:slug/resolve/:id`** — marca un log come risolto.
**`GET /api/super-diario/:slug/unresolved-count`** — contatore badge Diario.

#### `routes/properties.ts` — Gestione proprietà (CEO)

Tutte le route richiedono `ceoPassword` nel body o nei query params.

| Method | Path | Descrizione |
|---|---|---|
| `GET` | `/properties` | Lista completa |
| `POST` | `/properties` | Crea nuova proprietà |
| `GET` | `/properties/:slug` | Dati pubblici di una proprietà |
| `PUT` | `/properties/:slug` | Aggiorna content, whatsapp, ecc. |
| `PUT` | `/properties/:slug/full-edit` | Edit completo (slug, nome, password, email) |
| `DELETE` | `/properties/:slug` | Elimina proprietà |
| `PUT` | `/properties/:slug/host-password` | Imposta password host |

#### `routes/leads.ts` — CRM leads

| Method | Path | Auth | Descrizione |
|---|---|---|---|
| `POST` | `/leads` | Nessuna | Registra nuovo lead dalla landing |
| `GET` | `/leads` | CEO | Lista lead ordinata per data |
| `DELETE` | `/leads/:id` | CEO | Elimina lead |
| `PUT` | `/leads/:id/status` | CEO | Aggiorna stato (Nuovo / Contattato / In Trattativa / Chiuso / Non Interessato) |
| `POST` | `/leads/:id/convert` | CEO | **Converte lead in host**: crea record in `hosts`, crea proprietà con slug auto-generato, imposta password `"Benvenuto2026!"`, mette lead a "Chiuso" |

#### `routes/host-dashboard.ts` — Auth e dashboard host

| Method | Path | Descrizione |
|---|---|---|
| `POST` | `/auth/host-login` | Login host (email + password) → restituisce lista proprietà |
| `GET` | `/host/:slug` | Legge dati proprietà (autenticato con email + hostPassword) |
| `PUT` | `/host/:slug` | Salva modifiche regolamento/whatsapp (autenticato) |

#### `routes/auth.ts` — Reset password

Flusso reset: l'host inserisce email → viene generato un token UUID → viene inviata un'email con link (`/reset-password/:token`) → l'host clicca e imposta nuova password → il token viene cancellato.

Il token è salvato in `properties.resetToken` e `properties.resetRequestedAt`. L'email è inviata tramite **Resend** (`RESEND_API_KEY`, mittente verificato in `RESEND_FROM_EMAIL`, nome visualizzato opzionale `EMAIL_FROM_NAME`).

Il CEO può vedere tutti i token in sospeso (`GET /api/auth/resets`) e cancellarli (`DELETE /api/auth/resets/:slug`).

#### `routes/ai.ts` — AI Services

| Method | Path | Descrizione |
|---|---|---|
| `POST` | `/ai/transcribe` | Audio upload (Multer, max 25MB) → OpenAI Whisper → testo trascritto |
| `POST` | `/ai/vision` | Immagine upload → GPT-4o Vision → estrae testo/regole dall'immagine |

Entrambi usano `OPENAI_API_KEY` dall'ambiente.

#### `routes/admin-hosts.ts` — Gestione host (CEO)

CRUD sugli account host. `POST /api/admin/hosts` è idempotente: se l'host esiste già, aggiorna la password.

#### `routes/send-pdf.ts` — Email PDF

`POST /api/send-pdf` riceve il PDF codificato base64 + email destinatario → invia tramite **Resend** con il PDF allegato. Usato dal `QrModal` nel CEO panel.

### Lib files backend

| File | Descrizione |
|---|---|
| `lib/logger.ts` | Istanza Pino con pino-http |
| `lib/resend.ts` | Client Resend (`RESEND_API_KEY`), `getResendFromHeader()`, `sendResendEmail()` |
| `lib/hostWelcomeMail.ts` | Email benvenuto host, reset password, PDF allegato (PDFKit + QR) |
| `lib/rateLimiter.ts` | Rate limiter in-memory (mappa IP → contatore) — 30 req/ora |
| `lib/detectNeedsAttention.ts` | Stessa logica del frontend (copia isomorfica) |
| `lib/categorizeMessage.ts` | Categorizza il messaggio come FLEXIBLE (tourism) o STRICT (house management) |

---

## Artifact 3 — Database (`lib/db`)

**Stack:** Drizzle ORM + `drizzle-kit` + PostgreSQL (Replit Database).

La stringa di connessione è in `DATABASE_URL` (env var, impostata automaticamente da Replit).

### Schema Tabelle

#### `properties`
La tabella centrale. Ogni riga è una struttura ricettiva.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `serial` | PK |
| `slug` | `text` | Unique. Usato in tutti gli URL (`/guest/:slug`, `/host/:slug`) |
| `name` | `text` | Nome visualizzato della struttura |
| `content` | `text` | Knowledge Base — il testo che Marco AI usa per rispondere |
| `whatsappNumber` | `text` | Numero SOS (solo cifre, es: `393901234567`) |
| `hostPassword` | `text` | Password dell'host per accedere alla dashboard |
| `email` | `text` | Email dell'host proprietario |
| `resetToken` | `text` | Token UUID per reset password (nullable) |
| `resetRequestedAt` | `timestamp` | Quando è stato richiesto il reset (nullable) |
| `createdAt` | `timestamp` | Auto |
| `updatedAt` | `timestamp` | Auto-update ad ogni modifica |

#### `hosts`
Account di autenticazione host. Separato da `properties` per consentire un host con più proprietà.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `serial` | PK |
| `email` | `text` | Unique. Chiave di login |
| `hostPassword` | `text` | Password dell'account |
| `createdAt` | `timestamp` | Auto |

> **Importante**: la relazione host → proprietà non è una FK esplicita ma è basata sull'email. In `properties.email` è memorizzata l'email dell'host. Al login, si recuperano tutte le proprietà dove `properties.email = hosts.email`.

#### `leads`
Lead dal form landing page. Non autenticati, non hanno ancora un account.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `serial` | PK |
| `hostName` | `text` | Nome del potenziale host |
| `email` | `text` | Email di contatto |
| `propertyName` | `text` | Nome della struttura dichiarata |
| `status` | `text` | `Nuovo` / `Contattato` / `In Trattativa` / `Chiuso` / `Non Interessato` |
| `createdAt` | `timestamp` | Auto |

#### `chat_logs`
Log di ogni scambio di messaggi tra un ospite e Marco AI.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | `serial` | PK |
| `propertySlug` | `varchar(255)` | Riferimento allo slug della proprietà |
| `guestMessage` | `text` | Messaggio dell'ospite |
| `marcoReply` | `text` | Risposta di Marco AI |
| `createdAt` | `timestamp` | Auto |
| `resolved` | `boolean` | `false` = appare nel Diario come "in sospeso". `true` = gestito dall'host |

#### `host_knowledge` (legacy / non usata attivamente)
Tabella originale per la knowledge base globale. Il sistema attuale usa `properties.content` come KB per-proprietà. Questa tabella può essere ignorata.

---

## Variabili d'Ambiente

Variabili richieste all’avvio dell’API (`validateEnv` in `artifacts/api-server/src/lib/validateEnv.ts`), oltre a **`HOST_SESSION_SECRET`** o **`SESSION_SECRET`**.

| Variabile | Descrizione | Note |
|---|---|---|
| `SUPABASE_URL` | URL progetto Supabase | Obbligatoria |
| `SUPABASE_ANON_KEY` | Chiave anon Supabase | Obbligatoria |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (solo server) | Obbligatoria |
| `OPENAI_API_KEY` | Chiave API OpenAI | Obbligatoria |
| `CEO_PASSWORD` | Password pannello CEO | Obbligatoria |
| `FRONTEND_URL` | URL pubblico del frontend (CORS, QR, link nelle email) | Obbligatoria — deve essere `https://...` completo |
| `RESEND_API_KEY` | Chiave API [Resend](https://resend.com) | Obbligatoria |
| `RESEND_FROM_EMAIL` | Mittente verificato in Resend (es. dominio o sandbox Resend) | Obbligatoria |
| `EMAIL_FROM_NAME` | Nome visualizzato nel mittente (es. HeyCico) | Opzionale |
| `HOST_SESSION_SECRET` / `SESSION_SECRET` | Firma sessioni host | Obbligatoria (una delle due) |
| `PORT` | Porta HTTP API | Default `8080` |

---

## Flussi Chiave

### Flusso ospite (chat)
```
Ospite apre /guest/:slug
  → frontend chiama GET /api/properties/:slug (verifica esistenza)
  → ospite scrive messaggio
  → POST /api/properties/:slug/chat { message, conversationHistory }
  → backend: rate limit → categorizza → costruisce prompt → OpenAI → detectNeedsAttention
  → salva in chat_logs (resolved = !needsAttention)
  → risposta visualizzata in chat
```

### Flusso host login
```
/login → form email + password
  → POST /api/auth/host-login
  → backend verifica in tabella `hosts`
  → se ok: restituisce lista properties dove email corrisponde
  → frontend salva sessione in sessionStorage { email, password, ts }
  → redirect a /host/dashboard
```

### Flusso conversione lead → host (CEO)
```
CEO panel → tab Lead → bottone Converti
  → POST /api/leads/:id/convert { ceoPassword }
  → backend:
      1. Cerca lead per id
      2. Crea host in `hosts` (se non esiste già) con password "Benvenuto2026!"
      3. Genera slug da propertyName (auto-incremento se già esistente)
      4. Crea proprietà in `properties` (email = lead.email, hostPassword = "Benvenuto2026!")
      5. Mette lead.status = "Chiuso"
  → CEO invia link /host/:slug + password all'host
```

### Flusso Diario di Bordo
```
/diario/:slug
  → GET /api/super-diario/:slug
  → frontend filtra con detectNeedsAttention(marcoReply)
  → conversazioni con needs_attention: true → sezione "In Sospeso" (bordo rosso)
  → host clicca "Segna come gestito"
  → PATCH /api/super-diario/:slug/resolve/:id
  → backend: UPDATE chat_logs SET resolved = true WHERE id = :id
```

---

## Convenzioni di Codice

- **Router**: sempre `wouter` (mai `react-router-dom`).
- **baseUrl**: sempre `import.meta.env.BASE_URL.replace(/\/$/, "")` prima di ogni `fetch`.
- **ReactMarkdown**: i componenti custom devono ricevere `children` esplicitamente: `({ node, children, ...props }) => <tag {...props}>{children}</tag>`.
- **Sessione host**: `sessionStorage` con chiave `"host_session"`, TTL 8 ore. La struttura è `{ email, password, ts }`.
- **CEO_PASSWORD**: letta da `process.env.CEO_PASSWORD`, obbligatoria all'avvio — nessun fallback.
- **Slug**: solo lettere minuscole, numeri e trattini (`/^[a-z0-9-]+$/`). Generato automaticamente dal nome struttura, con suffix numerico se già esistente.
- **Marco AI temperatura**: `0.4` (bilanciato tra creatività e precisione).
- **Lingua**: il frontend e la UI sono in italiano. Il sistema prompt di Marco supporta 11 lingue di risposta.

---

## Workflow Replit

| Nome workflow | Comando | Porta |
|---|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/rome-guest: web` | `pnpm --filter @workspace/rome-guest run dev` | (PORT env) |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` | 8081 |

Dopo modifiche al backend, riavviare il workflow `API Server`. Vite (frontend) applica HMR automaticamente.

---

## File da Non Toccare

- `lib/api-zod/src/generated/api.ts` — schemi Zod generati. Se devi aggiungere un campo, modificalo qui direttamente (non è un file auto-generato in questo progetto, è source-of-truth manuale).
- `lib/api-client-react/src/generated/` — client React Query generato da openapi-ts. Non modificare manualmente.
- `artifact.toml` / `.replit` — configurazione Replit. Usare i tool Replit per modificarli, non editare a mano.
