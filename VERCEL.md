# Vercel deployment

This build is prepared for Vercel's current Express/Node deployment model.

- Root `server.js` is the Vercel entrypoint.
- The Express application remains in `server/server.js`.
- `public/` contains the frontend and `rraudio.mp3`.
- No `.env` file is included.
- Configure production environment variables in Vercel.
- `DATABASE_URL`, `SESSION_SECRET`, and the other server variables are required as documented in `.env.example`.

For local development:
```cmd
npm install
npm start
```
