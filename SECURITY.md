# StudySync — Security Hardening (OWASP Top 10 Compliance)

This document describes the security measures implemented across the StudySync platform to protect against the **OWASP Top 10 (2021)** vulnerability categories.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Security Layers                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)                                           │
│  ├─ Automatic JWT refresh (15m access / 7d refresh)         │
│  ├─ Token deduplication on concurrent 401s                  │
│  └─ Auto-redirect to /login on auth failure                 │
├─────────────────────────────────────────────────────────────┤
│  Express Middleware Stack (request → response)              │
│  ├─ Helmet (HTTP security headers)                          │
│  ├─ CORS (origin whitelist)                                 │
│  ├─ Rate Limiter (100 req/15min global, 20 uploads/15min)  │
│  ├─ Login Rate Limiter (5 attempts → 15min lockout)         │
│  ├─ Body Parser (10MB limit)                                │
│  ├─ Security Headers (X-Frame, X-Content-Type, etc.)        │
│  ├─ Request Logger (4xx/5xx → security log)                 │
│  └─ Error Sanitizer (never leaks stack traces)              │
├─────────────────────────────────────────────────────────────┤
│  Route-Level Protection                                     │
│  ├─ JWT Authentication (authenticate middleware)            │
│  ├─ Ownership Verification (user_id / owner_id checks)      │
│  ├─ Input Sanitization (XSS, injection prevention)          │
│  ├─ File Upload Validation (size + extension blocklist)     │
│  └─ Path Traversal Protection (uploads dir confinement)     │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├─ Parameterized SQL Queries (pg-pool, no string concat)   │
│  ├─ UUID Validation (prevents PostgreSQL 22P02 errors)      │
│  ├─ Bcrypt Password Hashing (12 salt rounds)                │
│  └─ Cryptographic Tokens (crypto.randomBytes)               │
└─────────────────────────────────────────────────────────────┘
```

---

## A01: Broken Access Control

| Fix | File(s) |
|-----|---------|
| Added `authenticate` middleware to all previously unprotected routes | `collabRoutes.js`, `quizRoutes.js`, `webrtcRoutes.js`, `vaultRoutes.js` |
| Ownership checks on all resource access (GET/PATCH/DELETE) | All route files |
| Prevented privilege escalation — registration forces `student` or `teacher` role only | `authRoutes.js` |
| Document restore requires ownership (was hardcoded `user_id: '1'`) | `collabRoutes.js` |
| Permission management requires document ownership | `collabRoutes.js` |

**Protected routes added (previously public):**
- `GET /documents/:id/content`
- `GET /documents/:id/versions`
- `GET /documents/:id/versions/:versionId`
- `POST /documents/:id/restore`
- `GET /documents/:id/permissions`
- `POST /documents/:id/permissions`
- `GET /documents/:id/comments`
- `POST /documents/ai/generate`
- `GET /quizzes/documents/:id`
- `GET /quizzes/history/:docId`
- `GET /quizzes/:quizId`
- `GET /webrtc/rooms`
- `GET /webrtc/rooms/:id`
- `POST /vaults/:token/upload`
- `DELETE /vaults/file/:fileToken`
- `POST /vaults/verify/:token`
- `POST /auth/logout-all`

---

## A02: Cryptographic Failures

| Fix | Detail |
|-----|--------|
| Real secrets removed from `.env` | OpenRouter API key and PostgreSQL credentials replaced with placeholders |
| Strong JWT secret | 128-character hex string generated via `crypto.randomBytes(64)` |
| Short-lived access tokens | `JWT_EXPIRES_IN=15m` (was 7 days) |
| Separate refresh token expiry | `JWT_REFRESH_EXPIRES_IN=7d` |
| Session expiry matches refresh token | Parsed from env string (e.g., `7d` → 604800000ms) |
| Server refuses to start without JWT_SECRET | Validates at module load time |
| Bcrypt hashing | 12 salt rounds (configurable via `BCRYPT_SALT_ROUNDS`) |
| Vault tokens | 24 random bytes (48 hex chars) |
| File share tokens | 24 random bytes (48 hex chars) |

---

## A03: Injection

### XSS Prevention
- `sanitizeHtml()` escapes `& < > " '` on all user-supplied strings
- Applied to: document titles/content, comments, quiz topics, deadline fields, study plan milestones, profile names
- Avatar URL validated against `^https?://[^\s<>\"']{1,500}$`

### Header Injection Prevention
- `sanitizeFilenameForHeader()` strips control characters and quotes from `Content-Disposition`
- Applied to all file download routes

### Input Length Limits
| Field | Max Length |
|-------|-----------|
| Full name | 100 chars |
| Email | 254 chars |
| Document title | 200 chars |
| Document content | 100,000 chars |
| Comment content | 5,000 chars |
| Quiz topic | 500 chars |
| Deadline title | 200 chars |
| Deadline description | 1,000 chars |
| Phone number | 20 chars (digits, `+`, `-`, `()`, space only) |

### SQL Injection
- All queries use parameterized statements via `pg-pool` (`$1`, `$2`, etc.)
- `dbStore` ORM wrapper validates UUID format before queries

---

## A05: Security Misconfiguration

### HTTP Security Headers (via Helmet + custom middleware)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Powered-By: (removed)
Content-Security-Policy: defaultSrc 'self'; styleSrc 'self' 'unsafe-inline';
                         scriptSrc 'self'; imgSrc 'self' data: blob:;
                         connectSrc 'self' ws: wss:; fontSrc 'self' data:
```

### CORS
- Whitelisted origins: `FRONTEND_URL` env var (default `http://localhost:5173`)
- Credentials: true
- Methods: GET, POST, PUT, PATCH, DELETE
- Headers: Content-Type, Authorization

### Error Handling
- Global error handler never sends stack traces to client
- In production (`NODE_ENV=production`), all 500 errors return generic message
- Multer errors return user-friendly messages
- CORS violations return `403 Origin not allowed`

### Other
- Health check endpoint returns minimal info (status + timestamp only)
- Body parser limit reduced from 50MB → 10MB
- `express.urlencoded` uses `extended: false` (prevents prototype pollution)

---

## A07: Identification and Authentication Failures

### Login Rate Limiting
- **Per-IP tracking** with in-memory Map
- **5 attempts** maximum per 15-minute window
- **15-minute lockout** after exceeding limit
- Successful login resets the counter
- Returns `429 Too Many Requests` with `retryAfter` seconds

### Global API Rate Limiting
- **100 requests** per 15-minute window (all `/api/` routes)
- **20 uploads** per 15-minute window (upload routes)
- Standard `RateLimit` headers enabled

### Password Policy
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Enforced on registration and password change

### Token Management
- Access tokens: 15-minute expiry (short-lived)
- Refresh tokens: 7-day expiry, stored in `sessions` table
- Frontend automatically refreshes access tokens on 401
- Concurrent refresh requests are deduplicated
- Password change invalidates all sessions (logout from all devices)

---

## A08: Software and Data Integrity Failures

### File Upload Validation
| Check | Detail |
|-------|--------|
| Size limit | 25 MB (all upload routes) |
| Extension blocklist | `.exe .bat .cmd .com .msi .scr .pif .vbs .vbe .js .jse .wsf .wsh .ps1 .sh .bash .csh .ksh .rb .pl .py .php .asp .aspx .jsp .cgi` |
| MIME type validation | Study plans: PDF, DOCX, TXT, MD only; Quizzes: PDF, DOCX, PPTX, TXT only |
| Random filenames | `crypto.randomBytes(16).toString('hex')` + original extension |

### Path Traversal Protection
- All file download routes validate `file_path` resolves within `uploads/` directory
- Token format validation (hex string only, max 128 chars)
- Applied to: `/download/:token`, `/vaults/vault-file/:fileToken`

### Vault Security
- Vault password minimum 8 characters
- Bcrypt hashing with 12 salt rounds
- Vault token: 48-character hex string
- Upload requires authentication

---

## A09: Security Logging and Monitoring Failures

### Security Event Logger
All security events are logged with structured data:
```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "type": "AUTH_FAILURE|AUTH_SUCCESS|ACCESS_DENIED|RATE_LIMIT|FILE_UPLOAD|FILE_DOWNLOAD|SENSITIVE_OP|HTTP_ERROR",
  "ip": "192.168.1.1",
  "userId": "uuid",
  "email": "user@example.com",
  "path": "/api/auth/login",
  "message": "Login failed: Invalid credentials",
  "severity": "info|warn|error|critical"
}
```

### Logged Events
| Event | Severity | Trigger |
|-------|----------|---------|
| `AUTH_SUCCESS` | info | Login, registration |
| `AUTH_FAILURE` | warn | Failed login, wrong password |
| `ACCESS_DENIED` | critical | Path traversal, ownership violation |
| `RATE_LIMIT` | warn/error | Login lockout, API rate limit |
| `FILE_DOWNLOAD` | info | Any file download |
| `SENSITIVE_OP` | info/warn | Vault create/delete, password change, logout-all |
| `HTTP_ERROR` | warn/error | All 4xx/5xx responses |

---

## A10: Server-Side Request Forgery (SSRF)

### AI Proxy Protection
- Fetch URL hardcoded to `https://openrouter.ai/api/v1/chat/completions`
- No user-controlled URLs in any server-side fetch
- Input validation on proxied requests:
  - `messages`: must be array, max 20 items
  - `model`: string, max 100 chars
- AI proxy route requires authentication

---

## Quick Reference: Files Modified

| File | OWASP Categories |
|------|-----------------|
| `.env` | A02 |
| `backend/middleware/security.js` | A01, A03, A05, A07, A08, A09 |
| `backend/server.js` | A03, A05, A07, A08, A09 |
| `backend/services/authService.js` | A02, A07 |
| `backend/routes/authRoutes.js` | A01, A03, A07, A09 |
| `backend/routes/vaultRoutes.js` | A01, A03, A07, A08, A09 |
| `backend/routes/collabRoutes.js` | A01, A03, A10 |
| `backend/routes/quizRoutes.js` | A01, A03, A08 |
| `backend/routes/studyPlanRoutes.js` | A03 |
| `backend/routes/deadlineRoutes.js` | A03 |
| `backend/routes/webrtcRoutes.js` | A01 |
| `frontend/src/services/api.js` | A02, A07 |

---

## Production Deployment Checklist

Before deploying to production:

1. **Set a unique JWT_SECRET** — run:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

2. **Set `NODE_ENV=production`** — enables sanitized error responses

3. **Replace placeholder credentials in `.env`:**
   - `OPENROUTER_API_KEY` — your actual API key
   - `DATABASE_URL` — your PostgreSQL connection string
   - `SMTP_USER` / `SMTP_PASS` — your email credentials

4. **Enable HTTPS** — required for secure token transmission

5. **Set up persistent security logging** — current implementation logs to console; production should pipe to a SIEM or log aggregation service

6. **Consider additional hardening:**
   - Redis-backed rate limiting (current: in-memory, resets on restart)
   - Helmet's `Strict-Transport-Security` header
   - Content Security Policy reporting
   - Dependency audit (`npm audit`)
   - Regular dependency updates
