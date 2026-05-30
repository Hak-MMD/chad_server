# chadai_server — Detailed Context for Claude

Express/Node.js backend for ChadAI. CommonJS throughout. Run with `npm run dev` on port 3001.

---

## Directory Map

```
chadai_server/
├── server.js                        # Entry point: CORS, morgan, route mounting, Stripe raw-body, global error handler
├── config/
│   ├── db.js                        # Mongoose connection
│   ├── openai.js                    # OpenAI client instance
│   ├── cloudinary.js                # Cloudinary client instance
│   ├── stripe.js                    # Stripe client — throws on startup if secret key env var is missing
│   ├── plans.js                     # PLANS config — single source of truth for all plan limits and model lists
│   └── models.js                    # AI model name constants (summarization models only; plan models live in plans.js)
├── routes/
│   ├── authRoutes.js                # /api/v2/auth/
│   ├── apiRoutes.js                 # /api/v2/ai/
│   ├── chatRoutes.js                # /api/v2/chat/
│   ├── billingRoutes.js             # /api/v2/billing/
│   ├── adminRoutes.js               # /admin/
│   ├── waitlistRoutes.js            # /api/v1/web/ (legacy)
│   └── index.js                     # /api/v1/ (legacy)
├── controllers/
│   ├── authController.js            # register, login, refresh, logout, Google OAuth, sessions, getCurrentUser, verifyEmail
│   ├── apiController.js             # message — main AI endpoint (idempotency, ownership check, model selection)
│   ├── chatController.js            # listChats, createChat, getMessages, updateChat, deleteChat
│   ├── billingController.js         # createCheckoutSession, createPortalSession
│   ├── stripeWebhookController.js   # handleStripeWebhook (idempotent, signature-verified)
│   ├── adminController.js           # upgradeUser, downgradeUser (admin-only plan management)
│   └── waitlistController.js
├── middlewares/
│   ├── authMiddleware.js            # protect — verifies Bearer JWT, sets req.user
│   ├── requireEmailVerified.js      # gates routes: checks req.user.emailVerified (JWT fast path, DB fallback)
│   ├── usageLimitMiddleware.js      # usageLimit() — atomic check+reserve slot; sets req.usageStats + req.plan
│   ├── validate.js                  # express-validator chains: validateRegister, validateLogin, validateVerifyEmail,
│   │                                #   validateMessage, validateCreateChat, validateUpdateChat
│   ├── adminMiddleware.js           # admin — checks req.user.role is "admin" or "dev"
│   └── rateLimitAuth.js             # authLimiter (10/15min), verifyEmailLimiter (5/15min)
├── models/                          # Mongoose schemas (see Data Models section)
├── services/
│   └── subscriptionService.js       # applyActiveSubscription, applyCanceledSubscription,
│                                    #   upgradeUserPlan, downgradeUserPlan (admin direct-manipulation)
└── utils/
    ├── jwt.js                       # generateAccessToken (payload includes emailVerified), generateRefreshToken, hashToken
    ├── logger.js                    # Structured logger — JSON in production, readable text in dev
    ├── buildContext.js              # Assembles OpenAI message array from chat history
    ├── modelSelector.js             # Validates model against plan, handles downgrade/block
    ├── summarizationWorker.js       # In-process async queue for message + conversation summarization
    ├── openaiUsage.js               # calculateUsage — token count → cost in USD
    ├── uploadImage.js               # Cloudinary upload (base64); rejects payloads > ~5 MB
    ├── sendEmail.js                 # Nodemailer wrapper — returns true/false
    ├── loadTemplate.js              # Loads HTML email templates from /emails/
    ├── validatePassword.js          # 8+ chars, uppercase, number
    ├── dateHelpers.js               # nextDay(), nextMonth() for UsageStats reset dates
    └── resetUsageStats.js           # Resets daily/monthly counters if past reset date (called by usageLimitMiddleware)
```

---

## Route Map

All v2 routes are mounted in `server.js`. Middleware listed left to right.

```
GET    /health                                        (no auth — platform health check)

POST   /api/v2/auth/register                          authLimiter → validateRegister
POST   /api/v2/auth/login                             authLimiter → validateLogin
POST   /api/v2/auth/refresh                           authLimiter
POST   /api/v2/auth/logout
GET    /api/v2/auth/me                                protect
POST   /api/v2/auth/verify-email                      verifyEmailLimiter → validateVerifyEmail
POST   /api/v2/auth/resend-verification
GET    /api/v2/auth/sessions                          protect
DELETE /api/v2/auth/sessions/:id                      protect
GET    /api/v2/auth/google                            (redirects to Google)
GET    /api/v2/auth/google/callback                   (Google redirects here)
POST   /api/v2/auth/google/link-confirm

POST   /api/v2/ai/message                             protect → requireEmailVerified → aiMessageLimiter
                                                        → validateMessage → usageLimit()

GET    /api/v2/chat/                                  protect → requireEmailVerified
POST   /api/v2/chat/                                  protect → requireEmailVerified → validateCreateChat
GET    /api/v2/chat/:id/messages                      protect → requireEmailVerified  (cursor-paginated)
PATCH  /api/v2/chat/:id                               protect → requireEmailVerified → validateUpdateChat
DELETE /api/v2/chat/:id                               protect → requireEmailVerified
GET    /api/v2/chat/getMessages                       protect → requireEmailVerified  (legacy — Chrome extension)

POST   /api/v2/billing/create-checkout-session        protect → requireEmailVerified
POST   /api/v2/billing/create-portal-session          protect → requireEmailVerified
POST   /api/v2/billing/webhook                        express.raw() — MUST stay before express.json()

POST   /admin/users/:id/upgrade                       protect → admin
POST   /admin/users/:id/downgrade                     protect → admin
```

---

## Data Models & Relationships

```
User (users)
  ├── 1:1  UsageStats (usage_stats)      — created on register/google-signup
  ├── 1:N  Chat (chats)                  — one created on register; more via POST /chat/
  ├── 1:N  Message (messages)            — via chatId
  ├── 1:N  AuthRefresh (auth_refresh)    — one per active session
  ├── 1:N  AuditLog (audit_logs)         — auth events (register, login, logout, etc.)
  ├── 0:1  Subscription (subscriptions)  — ref stored as User.activeSubscriptionId
  ├── 0:N  OAuthAccount (oauth_accounts) — one per linked provider
  └── 1:N  Usage (usage)                 — per-request audit log (immutable)
```

**User** — core fields: `email`, `emailVerified`, `plan` (free/basic/pro/unlimited), `role` (user/admin/dev), `status` (active/blocked/deleted), `authProvider` (email/google), `stripeCustomerId`, `loginAttempts`, `lockUntil`

**UsageStats** — `dailyCount`, `monthlyCount`, `dailyResetAt`, `monthlyResetAt`, `modelTokenMonthly` (Map<modelName, tokens>). Reset logic is in `utils/resetUsageStats.js`, triggered by `usageLimitMiddleware` on every AI request.

**Chat** — `userId`, `source` (extension/website), `type` (text/image/mixed), `conversationSummary`, `messageCount`, `lastSummaryAt`, `isDeleted` (soft delete), `isArchived`

**Message** — `chatId`, `userId`, `role`, `content.text`, `content.imageUrl`, `content.imageMeta`, `summary` (filled async by summarizationWorker), `idempotencyKey` (optional, indexed), token fields

**AuthRefresh** — stores `refreshTokenHash` (SHA-256 of raw token), never the raw token. Fields: `revokedAt`, `expiresAt`, `lastUsedAt`, `userAgent`, `ipAddress`

**AuditLog** — `userId`, `action` (register/login/login_locked/logout/email_verified/google_signup/google_login), `source`, `metadata`. Written fire-and-forget on all auth events.

**Subscription** — mirrors Stripe state: `stripeSubscriptionId`, `plan`, `interval`, `status`, `currentPeriodStart/End`, `cancelAtPeriodEnd`

**StripeEvent** — idempotency table: `stripeEventId`, `processed` flag. Checked before processing any webhook.

**Usage** — immutable per-request audit: `type` (chat/image/analysis), `model`, token counts, `costUSD`, `source`

---

## Auth System

**Access token:** JWT, 15-minute expiry, signed with `ACCESS_SECRET`. Payload: `{ id, email, plan, role, emailVerified }`. Sent as `Authorization: Bearer <token>` header. The `protect` middleware sets `req.user` from this.

**Refresh token:** Random 80-char hex (crypto.randomBytes), 30-day expiry. Stored as SHA-256 hash in `AuthRefresh`. Raw token set as httpOnly cookie (`refreshToken`). Cookie is `secure: true, sameSite: "none"` in prod, `secure: false, sameSite: "lax"` in dev.

**Token rotation:** Each `/refresh` call generates a new refresh token, updates the session record in-place (no delete/create). One DB row per session.

**Email verification:** 6-digit code generated with `crypto.randomInt` (not Math.random). Code hashed with SHA-256 before storing in `EmailVerification`. Rate limited to 5 attempts per 15 minutes. `emailVerified: true` is included in subsequent access tokens once verified.

**Account locking:** 10 failed login attempts → 30-minute lock (`lockUntil`). Resets on successful login. Lockout events logged to AuditLog.

**Google OAuth:** Custom implementation (Passport is installed but unused for this flow).
1. `/google` — generate CSRF state, set `oauth_state` cookie, redirect to Google
2. `/google/callback` — verify state, exchange code for Google profile
3. Look up `OAuthAccount` by `providerAccountId`:
   - Found → login (AuditLog: google_login)
   - Not found, email doesn't exist → create User + Chat + UsageStats + OAuthAccount (AuditLog: google_signup)
   - Not found, email exists with `authProvider: "email"` → create `AccountLink`, send confirmation email, redirect to `/link-google-pending`
4. After login: generate tokens, set cookie, redirect to `FRONTEND_URL/oauth-success?token=<accessToken>`

---

## Usage & Plan Limits

`config/plans.js` is the single source of truth. Plans: `free`, `basic`, `pro`, `unlimited`.

Each plan defines: `dailyRequests`, `monthlyRequests`, `allowImages`, `defaultModel`, `allowedModels`, `fallbackModel`, `modelTokenMonthly` (per-model token budget).

**Request flow through limits:**
1. `usageLimitMiddleware` — atomically checks AND reserves a slot using `findOneAndUpdate` with `$lt` guards (prevents concurrent bypass). Returns 429 with `upgradeRequired: true` if exceeded. Sets `req.usageStats` (post-increment) and `req.plan`.
2. `modelSelector.selectModelForRequest` — validates requested model against `plan.allowedModels`, checks `UsageStats.modelTokenMonthly` vs `plan.modelTokenMonthly`. Tries fallback model if over limit. Returns `blocked: true` → 429 if fallback is also over.
3. After AI response: `UsageStats.updateOne` increments `modelTokenMonthly[model]` only. (dailyCount/monthlyCount were already incremented atomically in step 1.)
4. `remaining` in the response is calculated from `req.usageStats` which already reflects the increment.

---

## AI Message Pipeline (`apiController.js` `message`)

1. **Idempotency check** — if `idempotencyKey` sent and a matching user message exists, return the cached assistant response and release the reserved usage slot (`$inc: -1`)
2. **Chat ownership** — `Chat.findById(chatId)`, verify `chat.userId === req.user.id`; 403 if mismatch
3. Upload `screenshot` to Cloudinary if present (max ~5 MB) → `imageData.url`
4. Save user `Message` (text + imageUrl + optional idempotencyKey)
5. Atomic `Chat.findOneAndUpdate($inc messageCount)` — result used for summarization trigger
6. `buildContext({ chatId })` — last 6 messages (reversed), uses `msg.summary` if available. Prepends system prompt + optional `chat.conversationSummary`. Trims to `HARD_TOKEN_LIMIT = 3500` tokens by dropping oldest messages.
7. `selectModelForRequest` — determine actual model to use
8. Build OpenAI messages array: history text-only; only the last user message gets `image_url` parts (hybrid vision)
9. Call `openai.chat.completions.create` — errors: 429 → 503, 400 → 400, other → 500
10. Save assistant `Message`
11. Save `Usage` audit record
12. `UsageStats.updateOne` — increment `modelTokenMonthly[model]`
13. Async (non-blocking): `enqueueMessageSummary(userMsg._id)` + `enqueueMessageSummary(assistantMsg._id)`
14. If `updatedChat.messageCount % 15 === 0`: `enqueueConversationSummary(chatId)`
15. Respond: `{ reply, modelUsed, modelDowngraded, remaining: { daily, monthly } }`

---

## Summarization Worker (`utils/summarizationWorker.js`)

In-process FIFO queue (queue is lost on server restart — intentional; summaries are non-critical). Two job types:

- **message-summary:** Summarizes messages with text > 400 chars or with an image. Uses `MODELS.SUMMARIZE_MESSAGE` (`gpt-5-nano`). Stores result in `Message.summary`.
- **conversation-summary:** Every 15 messages. Takes last 40 messages (summary preferred over text). Uses `MODELS.SUMMARIZE_CONVERSATION` (`gpt-5-mini`). Stores in `Chat.conversationSummary`. Then calls `pruneOldMessages`.
- **pruneOldMessages:** If chat has > 200 messages, deletes the oldest ones that have been summarized.

Model names for summarization come from `config/models.js`, not hardcoded. `buildContext` prefers `message.summary` over raw text — summarization directly improves context quality for long conversations.

---

## Stripe / Billing

**Checkout:** `POST /billing/create-checkout-session` body: `{ plan, interval }`. Creates Stripe customer if user doesn't have one. Returns `{ url }` for redirect. Requires verified email.

**Portal:** `POST /billing/create-portal-session`. Returns Stripe billing portal URL. Requires verified email.

**Webhook** (`POST /billing/webhook`):
- Must use `express.raw()` — wired in `server.js` before `express.json()`. Never move it.
- Validates webhook secret exists before calling `constructEvent` — returns 500 if env var missing.
- Idempotent: checks `StripeEvent` table before processing.
- Handles: `customer.subscription.created/updated/deleted`
- Maps `priceId → planKey` via `mapPriceToPlan` (iterates PLANS config)
- Active/trialing/past_due → `subscriptionService.applyActiveSubscription` (upserts Subscription, sets `User.plan`)
- Canceled → `subscriptionService.applyCanceledSubscription` (sets `User.plan = "free"`, clears `activeSubscriptionId`)
- Toggle live/test via `STRIPE_MODE=live` env var

**Admin billing:** `POST /admin/users/:id/upgrade` and `/downgrade` bypass Stripe for manual overrides.

---

## Input Validation

All key routes use `express-validator` chains from `middlewares/validate.js`. Validation failures return:
```json
{ "error": "Validation failed", "details": [{ "field": "email", "message": "Valid email address required" }] }
```

Validated routes: `register` (email, password, name), `login` (email, password), `verify-email` (email, 6-digit code), `message` (valid ObjectId chatId, text max 20k chars, optional idempotencyKey), `createChat` (optional title/source), `updateChat` (title required).

---

## Logging & Observability

- **HTTP requests:** `morgan` — `combined` format in production, colored `dev` in development.
- **Application logs:** `utils/logger.js` — call `logger.info/warn/error(msg, meta)`. Outputs JSON objects in production (ready for Datadog/Papertrail), readable text in dev.
- **Audit trail:** `AuditLog` model — all auth events written via fire-and-forget `.catch(console.error)` so logging failures never break auth.
- **Health check:** `GET /health` — returns `{ status, db, ts }`. Used by Render/Railway for liveness checks.

---

## Environment Variables

```
NODE_ENV                          "production" | "development"
ACCESS_SECRET                     JWT signing secret
MONGO_URI                         MongoDB connection string
OPENAI_API_KEY                    OpenAI key
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
STRIPE_MODE                       "live" | "test"
STRIPE_SECRET_KEY_LIVE            Required if STRIPE_MODE=live (server throws on startup if missing)
STRIPE_SECRET_KEY_TEST            Required if STRIPE_MODE=test
STRIPE_WEBHOOK_SECRET_LIVE
STRIPE_WEBHOOK_SECRET_TEST
STRIPE_PRICE_BASIC_MONTHLY
STRIPE_PRICE_BASIC_YEARLY
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_YEARLY
STRIPE_PRICE_UNLIMITED_MONTHLY
STRIPE_PRICE_UNLIMITED_YEARLY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI               Must match exactly what's in Google Cloud Console
FRONTEND_URL                      https://chad-ai-nd2k.onrender.com in prod
SMTP_USER                         Gmail address for Nodemailer
SMTP_PASS                         Gmail app password
ALLOWED_ORIGINS                   Optional comma-separated list to override default CORS origins
```

---

## Key Invariants & Gotchas

- **Webhook body parser:** The Stripe webhook route uses `express.raw()` and is registered before `express.json()` in `server.js`. Never move it below `app.use(express.json())` or webhook signature verification will break.
- **Auth token is Bearer, not cookie:** `protect` reads `Authorization: Bearer` header. Access token is returned in the JSON login/refresh response body. Only the refresh token is a cookie.
- **JWT includes emailVerified:** The `requireEmailVerified` middleware reads this from the token (fast path). Tokens issued before this field was added fall back to a DB check. Users need to re-login to get updated tokens.
- **Usage slot reserved in middleware, not controller:** `usageLimitMiddleware` atomically increments `dailyCount` and `monthlyCount`. The controller only increments `modelTokenMonthly`. Do not re-increment daily/monthly in the controller.
- **Idempotency key releases the slot:** If a request hits the idempotency cache, the controller does `$inc: { dailyCount: -1, monthlyCount: -1 }` to release the slot reserved by the middleware.
- **Summarization queue is in-memory:** Server restarts drop pending summaries. Intentional — summaries are non-critical and expensive to persist.
- **When adding a new plan or model:** Update `config/plans.js` only. `usageLimitMiddleware`, `modelSelector`, `billingController`, and `stripeWebhookController` all derive behavior from that config.
- **When adding a new protected route:** Apply `protect` first, then `requireEmailVerified` for any route that touches user data or costs money, then `usageLimit()` for AI routes.
- **Soft delete on chats:** The `isDeleted` flag is set to `true` on delete; messages are NOT deleted. All chat queries include `isDeleted: false`.
- **CORS origins:** Controlled by `ALLOWED_ORIGINS` env var (comma-separated). Falls back to the hardcoded list in `server.js` if the var is not set.
- **Stripe price IDs** come from env vars in `plans.js`. If undefined, `createCheckoutSession` returns 500. Verify env vars before debugging billing.
- **`config/stripe.js` throws on startup** if the appropriate secret key env var is not set. This is intentional — fail fast rather than silently initializing with `undefined`.
