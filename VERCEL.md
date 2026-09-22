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
