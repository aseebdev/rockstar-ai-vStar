# Vercel deployment

This build uses Vercel's current zero-configuration Express deployment model.

- `server.js` at the project root is the Express entrypoint.
- The Express app is exported; it does **not** call `listen()` on Vercel.
- `server/server.js` still starts a normal HTTP server for local/self-hosted runs.
- `public/` contains the frontend and `rraudio.mp3`.
- No `.env` file is included.
- Configure production environment variables in Vercel.
- `DATABASE_URL`, `SESSION_SECRET`, and the other server variables are required as documented in `.env.example`.

Vercel automatically maps the Express routes, so no API rewrites are required.

For local development:
```cmd
npm install
npm start
```

## Important for v4.6.2

The app does not require a global server-side Astra key. Each authenticated user stores their own Astra key encrypted in PostgreSQL. The gateway is OpenAI-compatible at `https://api.experientiallabs.ai/v1`; `/v1/models` and `/v1/chat/completions` use the user's Bearer key. The app intentionally leaves `ASTRA_MODEL` blank by default so the Settings model picker uses the models actually available to that user's key.

If a deployment returns HTTP 503 from `/api/models` or `/api/chat`, check the Vercel function logs first for `DB_INIT_FAILED`. Database initialization is now scoped to database-backed routes so `/api/health` remains usable even when the database is unavailable.
