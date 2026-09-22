# Rockstar AI — Security Notes

This project is hardened for a normal public portfolio deployment, but no web application can be guaranteed impossible to hack.

## Protections in this build

- No owner Astra API key is required or exposed to browsers; users supply their own key.
- Astra keys are encrypted at rest with AES-256-GCM using a key derived from `SESSION_SECRET`.
- Passwords are stored with Node.js `scrypt` hashes and per-user salts.
- Production sessions use an `HttpOnly`, `Secure`, `SameSite=Strict` `__Host-` cookie.
- Production startup fails if `SESSION_SECRET` or `DATABASE_URL` is missing.
- Same-origin protection blocks browser state-changing requests from unrelated origins.
- Optional `ALLOWED_ORIGINS` supports a separately hosted frontend.
- Security headers include HSTS (production), CSP, clickjacking protection, MIME sniffing protection, Referrer-Policy, Permissions-Policy, COOP and CORP.
- Global, authentication, chat, attachment, and API-key rate limits reduce brute force and abuse.
- Request body sizes and chat/file payloads are bounded.
- Uploaded document extraction is authenticated and size-limited.
- Markdown rendering escapes untrusted HTML before formatting.
- Upstream Astra errors are translated instead of returning server stack traces.
- Client-disconnected streaming requests abort the upstream request.

## Important deployment rules

1. Use HTTPS only in production.
2. Keep `.env` out of Git and never upload it with the ZIP.
3. Generate a new random `SESSION_SECRET` for production.
4. If an Astra key has ever been exposed in chat, logs, screenshots, or source files, revoke it and issue a new one.
5. Set `TRUST_PROXY=true` only when the deployment platform terminates HTTPS and supplies the correct client IP through a trusted reverse proxy.
6. If frontend and API are on different origins, set `ALLOWED_ORIGINS` to the exact frontend origin(s).
7. For multi-instance/high-traffic deployments, move rate limiting to a shared Redis/edge/WAF layer because this built-in limiter is process-local.
8. Keep Supabase credentials server-side only.

## Abuse response

When a request exceeds a configured security rate limit, the API returns HTTP 429 with:

> Try hard buddy — it’s built different. — Aseebdev

That message is a rate-limit response, not a claim that the server has positively identified a human attacker.
