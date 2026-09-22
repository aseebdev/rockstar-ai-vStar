## Vercel deployment

This project includes a root `server.js` entrypoint for Vercel's Express/Node deployment detection. Configure the environment variables from `.env.example` in Vercel; never upload `.env`.

# Rockstar AI

A polished ChatGPT-style AI interface built with Node.js + Express, PostgreSQL and Astra API.

## Architecture

Browser → Rockstar AI Node/Express server → Astra API

Each account uses **BYOK (Bring Your Own Key)**:
- Every user enters their own Astra API key.
- The key is encrypted and stored per user in PostgreSQL so it can be reused after login.
- The plaintext key is never returned to the browser after saving.
- Therefore AI requests consume the user's Astra credits, not the Rockstar AI owner's credits.

## Database

Recommended free database: **Supabase PostgreSQL**.

Create a Supabase project, then copy its PostgreSQL connection string into:

```env
DATABASE_URL=postgresql://...
DATABASE_SSL=true
```

The server automatically creates the required tables. `schema.sql` is also included.

## Environment

Copy `.env.example` to `.env` and configure:

```env
ASTRA_BASE_URL=https://api.experientiallabs.ai/v1
ASTRA_MODEL=gpt-5.6-luna
DATABASE_URL=postgresql://...
SESSION_SECRET=use-a-long-random-secret
OWNER_EMAIL=your-email@example.com
DAILY_MESSAGE_LIMIT=20
MONTHLY_MESSAGE_LIMIT=500
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
ALLOWED_ORIGINS=
TRUST_PROXY=true
```

Do **not** put a user's Astra API key in `.env`.

## Run locally

```bat
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Create an account, open **Settings → API & Model**, paste your own Astra key, test it, select a model, and chat.

## Public deployment

A simple setup is:

- **Render** for the Node.js web service.
- **Supabase** for PostgreSQL.

On Render, add the environment variables from `.env.example` in the service's Environment settings. Do not commit `.env`.

Before public launch:
- keep HTTPS enabled;
- keep BYOK mandatory;
- keep database-backed login enabled;
- keep daily/monthly limits enabled for normal users;
- use a strong `SESSION_SECRET`;
- set `OWNER_EMAIL` to the owner's account email;
- never expose Astra keys in frontend source;
- do not log API keys.

## User limits

`DAILY_MESSAGE_LIMIT` and `MONTHLY_MESSAGE_LIMIT` limit normal Rockstar AI accounts.

The owner account (`OWNER_EMAIL`) is exempt from Rockstar AI's app-level usage limits, but the owner still supplies their own Astra API key, so the owner's Astra credits are used for the owner's requests.

## About

Creator: Abdul Aseeb  
Focus: Full-Stack MERN Development + Cloud + AI Integration  
LinkedIn: https://www.linkedin.com/in/aseebdev/

Rockstar AI is a portfolio/personal project and should be hardened further before handling sensitive production data at large scale.


## Updated Rockstar AI build

This build is BYOK: each user supplies their own Astra API key from Settings → API & Model. No owner Astra key is stored in the server environment.

### First run
1. Keep your existing `.env` out of the ZIP and copy/configure it locally.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000`.

### Added in this build
- Clear API-key-required banner and professional no-key messaging.
- Local Rockstar Help responses for creator/About/API-key questions without an Astra key.
- Built-in creator context for questions about Aseebdev, Abdul Ajmal, Princy/Pathu, and the LinkedIn profile.
- About page with LinkedIn link and subtle personal note.
- Image attachments plus text/code files.
- PDF, DOCX, XLS/XLSX and PPTX text extraction when the added npm dependencies are installed.
- Multimodal image payload support for Astra models that support image input.
- Cache-busting asset version updated to prevent stale browser JavaScript/CSS.

Attachment support is deliberately bounded for safety: up to 5 files per message and 8 MB per file. Not every Astra model supports image understanding; image requests depend on the selected model's capabilities.


## Rockstar Core offline mode
If a user has not added an Astra API key, the composer remains fully usable. Questions are answered by the built-in Rockstar Core knowledge engine. Adding a key automatically switches new messages to the selected Astra model.

Rockstar Core is intentionally not described as a hidden cloud LLM; it is a deterministic local assistant with curated developer/web knowledge, arithmetic, code examples, creator/app help and text-attachment inspection.

## Security

See `SECURITY.md` for the current hardening, rate limits, deployment requirements, and threat-model notes.

## Connected tools in this build

The multimodal tool layer is now implemented as backend-controlled adapters. The browser never receives provider secrets.

### 1. Real web search
Set `TAVILY_API_KEY`. Rockstar uses the server-side Tavily search adapter, records an audit event, and returns source URLs/titles/dates. Current-oriented chat requests automatically attempt the web tool; if it is unavailable, Rockstar tells the model not to claim live verification.

### 2. Real image generation + editing
Set `OPENAI_API_KEY`. The server exposes `/api/tools/image/generate` and `/api/tools/image/edit`, with size/quality/background controls. Images are returned as base64 only to the authenticated requesting browser.

### 3. Secure code execution
Set `ENABLE_CODE_EXECUTION=true` and configure `PISTON_BASE_URL` to a self-hosted/authorized Piston sandbox. Optional `PISTON_API_KEY` is supported. The application never executes arbitrary user code inside the Rockstar Node process.

### 4. Real DOCX/XLSX/PPTX/PDF creation
DOCX and PPTX are generated as OOXML packages and XLSX uses the existing `xlsx` package. PDF is generated server-side and stored as an authenticated generated file. Generated files are persisted in PostgreSQL and downloads require the owning session.

### 5. Voice/TTS
Browser speech recognition remains available for input. Server TTS is available through `/api/tools/voice/tts` when `OPENAI_API_KEY` is configured. The browser receives the generated audio only for the authenticated request.

### 6. Secure conversation sharing
`POST /api/tools/share` creates a random, hashed share token. The token can expire or be revoked. Shared conversations are read-only and expose only the selected conversation.

### 7. Background jobs
`jobs` are persisted in PostgreSQL with queued/running/completed/failed states and timestamps. `/api/tools/jobs` creates work and `/api/tools/jobs/:id` returns persistent status. The current implementation starts work immediately from the serverless request; for long-running production workloads, point the same job table at a dedicated worker.

### 8. Audit + download authorization
Tool calls, share creation/revocation, file creation/download, code execution, image actions, web search and TTS are recorded in `audit_logs`. Generated-file downloads require an authenticated owner session and an unexpired file record.

### Required Vercel variables

In addition to the existing Astra/database/session variables, configure the provider variables you want to enable:

```env
TAVILY_API_KEY=
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_TTS_MODEL=gpt-4o-mini-tts
ENABLE_CODE_EXECUTION=false
PISTON_BASE_URL=https://your-authorized-piston-host/api/v2/piston
PISTON_API_KEY=
PUBLIC_BASE_URL=https://your-domain.example
```

Do not commit these values. Use Vercel Environment Variables for production.
