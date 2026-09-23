# Rockstar AI v4.6.2 — Production Deployment Checklist

## 1. Vercel environment variables

Set these in the **Production** environment. Never commit `.env`.

```env
NODE_ENV=production
DATABASE_URL=<Supabase PostgreSQL connection string>
DATABASE_SSL=true
SESSION_SECRET=<32+ random characters>
ASTRA_KEY_ENCRYPTION_SECRET=<32+ random characters; keep stable forever>
OWNER_EMAIL=<owner account email>
ASTRA_BASE_URL=https://api.experientiallabs.ai/v1
ASTRA_MODEL=
ASTRA_MAX_MESSAGES=36
ASTRA_TIMEOUT_MS=30000
DAILY_MESSAGE_LIMIT=20
MONTHLY_MESSAGE_LIMIT=500
TRUST_PROXY=true
ALLOWED_ORIGINS=
PUBLIC_BASE_URL=https://<your-production-domain>
```

Optional provider variables are in `.env.example`. Only add the providers/features you actually use.

### Astra key model

Do **not** put a user's Astra key in `ASTRA_API_KEY`. This build is BYOK. Each account saves its own Astra key through **Settings → API & Model**. The server encrypts it before storing it in PostgreSQL and never returns the plaintext key to the browser.

`ASTRA_MODEL` is intentionally blank. The Settings model picker obtains the models available to the authenticated user's key instead of assuming that a particular model is available.

## 2. Deploy

1. Push the project without `.env`, `node_modules/`, or `.git/`.
2. Import the repository into Vercel.
3. Add the environment variables above.
4. Deploy.
5. After deployment, open `/api/health`. It should return HTTP 200.

## 3. Functional verification

Test in this order:

1. Register a test account.
2. Log in.
3. Open **Settings → API & Model**.
4. Paste that account's own Astra key.
5. Save the key.
6. Confirm the UI reports the key as saved without displaying the key.
7. Open the model selector.
8. Confirm models load.
9. Run **Test Connection**.
10. Send `hi`.
11. Send a longer message and verify streaming.
12. Refresh the page and verify the session and key status remain available.
13. Log out, then verify protected API calls reject the old session.

## 4. Interpreting failures

- `/api/health` = `200`: the Express function is alive.
- `/api/models` = `401`: the user is not authenticated.
- `/api/models` = `503`: database initialization/configuration is failing. Check `DATABASE_URL` and Vercel function logs.
- `/api/models` returns an Astra error: the stored user key or provider/model access is the next thing to check.
- `/api/chat` = `401`: the session or stored Astra key is missing.
- `/api/chat` = `429`: an app usage limit or provider quota/rate limit has been reached.
- `/api/chat` = `5xx`: inspect the Vercel function log and the normalized Astra error returned by the endpoint.

## 5. Security requirements

- Keep HTTPS enabled.
- Keep `SESSION_SECRET` stable and private.
- Keep `ASTRA_KEY_ENCRYPTION_SECRET` stable and private if configured. Changing it makes previously encrypted Astra keys unreadable.
- Do not log request headers containing authorization credentials.
- Do not expose provider keys in frontend JavaScript or localStorage.
- Keep `ALLOWED_ORIGINS` empty for a same-origin Vercel deployment unless another trusted origin genuinely needs API access.
- Review provider/tool secrets before enabling optional integrations.
