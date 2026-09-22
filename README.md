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
