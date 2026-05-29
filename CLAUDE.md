# chadai_server — Detailed Context for Claude

Express/Node.js backend for ChadAI. CommonJS throughout. Run with `npm run dev` on port 3001.

---

## Directory Map

```
chadai_server/
├── server.js                        # Entry point: CORS, route mounting, Stripe raw-body
├── config/
│   ├── db.js                        # Mongoose connection
│   ├── openai.js                    # OpenAI client instance
│   ├── cloudinary.js                # Cloudinary client instance
│   ├── stripe.js                    # Stripe client instance
│   └── plans.js                     # PLANS config — source of truth for all plan limits
├── routes/
│   ├── authRoutes.js                # /api/v2/auth/
│   ├── apiRoutes.js                 # /api/v2/ai/
│   ├── chatRoutes.js                # /api/v2/chat/
│   ├── billingRoutes.js             # /api/v2/billing/
│   ├── adminRoutes.js               # /admin/
│   ├── waitlistRoutes.js            # /api/v1/web/ (legacy)
│   └── index.js                     # /api/v1/ (legacy)
├── controllers/
│   ├── authController.js            # register, login, refresh, logout, Google OAuth, sessions
│   ├── apiController.js             # message (main AI endpoint)
│   ├── chatController.js            # getMessages (paginated)
│   ├── billingController.js         # createCheckoutSession, createPortalSession
│   ├── stripeWebhookController.js   # handleStripeWebhook (idempotent)
│   ├── adminController.js
│   └── waitlistController.js
├── middlewares/
│   ├── authMiddleware.js            # protect — verifies Bearer JWT, sets req.user
│   ├── usageLimitMiddleware.js      # usageLimit() — checks daily/monthly limits, sets req.usageStats + req.plan
│   ├── adminMiddleware.js
│   └── rateLimitAuth.js             # express-rate-limit on auth routes
├── models/                          # Mongoose schemas (see Data Models section)
├── services/
│   └── subscriptionService.js       # applyActiveSubscription, applyCanceledSubscription
└── utils/
    ├── jwt.js                       # generateAccessToken, generateRefreshToken, hashToken
    ├── buildContext.js              # Assembles OpenAI message array from chat history
    ├── modelSelector.js             # Validates model against plan, handles downgrade/block
    ├── summarizationWorker.js       # In-process async queue for message + conversation summarization
    ├── openaiUsage.js               # calculateUsage — token count → cost in USD
    ├── uploadImage.js               # Cloudinary upload (base64)
    ├── sendEmail.js                 # Nodemailer wrapper
    ├── loadTemplate.js              # Loads HTML email templates
    ├── validatePassword.js          # 8+ chars, uppercase, number
    ├── dateHelpers.js               # nextDay(), nextMonth() for UsageStats reset dates
    └── resetUsageStats.js           # Resets daily/monthly counters if past reset date
```

---

## Route Map

All v2 routes are mounted in `server.js`. Middleware listed left to right.

```
POST   /api/v2/auth/register                  authLimiter
POST   /api/v2/auth/login                     authLimiter
POST   /api/v2/auth/refresh                   authLimiter
POST   /api/v2/auth/logout
GET    /api/v2/auth/me                        protect
POST   /api/v2/auth/verify-email
POST   /api/v2/auth/resend-verification
GET    /api/v2/auth/sessions                  protect
DELETE /api/v2/auth/sessions/:id              protect
GET    /api/v2/auth/google                    (redirects to Google)
GET    /api/v2/auth/google/callback           (Google redirects here)
POST   /api/v2/auth/google/link-confirm

POST   /api/v2/ai/message                     protect → usageLimit()

GET    /api/v2/chat/messages                  protect (cursor-paginated)

POST   /api/v2/billing/create-checkout-session   protect
POST   /api/v2/billing/create-portal-session     protect
POST   /api/v2/billing/webhook                   express.raw() — MUST stay before express.json()
```

---

## Data Models & Relationships

```
User (users)
  ├── 1:1  UsageStats (usage_stats)      — created on register/google-signup
  ├── 1:N  Chat (chats)                  — one created on register/google-signup
  ├── 1:N  Message (messages)            — via chatId
  ├── 1:N  AuthRefresh (auth_refresh)    — one per active session
  ├── 0:1  Subscription (subscriptions)  — ref stored as User.activeSubscriptionId
  ├── 0:N  OAuthAccount (oauth_accounts) — one per linked provider
  └── 1:N  Usage (usage)                 — per-request audit log
```

**User** — core fields: `email`, `plan` (free/basic/pro/unlimited), `role` (user/admin/dev), `status` (active/blocked/deleted), `authProvider` (email/google), `stripeCustomerId`, `loginAttempts`, `lockUntil`

**UsageStats** — `dailyCount`, `monthlyCount`, `dailyResetAt`, `monthlyResetAt`, `modelTokenMonthly` (Map<modelName, tokens>). Reset logic is in `utils/resetUsageStats.js`, triggered by `usageLimitMiddleware` on every AI request.

**Chat** — `source` (extension/website), `type` (text/image/mixed), `conversationSummary`, `messageCount`, `lastSummaryAt`

**Message** — `content.text`, `content.imageUrl`, `content.imageMeta`, `summary` (filled async by summarizationWorker), `role`, token fields

**AuthRefresh** — stores `refreshTokenHash` (SHA-256 of raw token), never the raw token. Fields: `revokedAt`, `expiresAt`, `lastUsedAt`, `userAgent`, `ipAddress`.

**Subscription** — mirrors Stripe state: `stripeSubscriptionId`, `plan`, `interval`, `status`, `currentPeriodStart/End`, `cancelAtPeriodEnd`

**StripeEvent** — idempotency table: stores `stripeEventId`, `processed` flag. Checked before processing any webhook.

**Usage** — immutable per-request audit log: `type` (chat/image/analysis), `model`, token counts, `costUSD`, `source`

---

## Auth System

**Access token:** JWT, 15-minute expiry, signed with `ACCESS_SECRET`. Payload: `{ id, email, plan, role }`. Sent as `Authorization: Bearer <token>` header. The `protect` middleware injects `req.user` from this.

**Refresh token:** Random 80-char hex, 30-day expiry. Stored as SHA-256 hash in `AuthRefresh`. Raw token set as httpOnly cookie (`refreshToken`). Cookie is `secure: true, sameSite: "none"` in prod, `secure: false, sameSite: "lax"` in dev.

**Token rotation:** Each `/refresh` call generates a new refresh token and updates the session record in-place (no delete/create). This means each session has exactly one DB row.

**Account locking:** 10 failed login attempts triggers a 30-minute lock (`lockUntil`). Resets on successful login.

**Google OAuth:** Custom implementation (Passport is installed but not used for this flow). Flow:
1. `/google` — generate CSRF state, set `oauth_state` cookie, redirect to Google
2. `/google/callback` — verify state, exchange code for token, get Google profile
3. Look up `OAuthAccount` by `providerAccountId`
   - Found → login existing user
   - Not found, email doesn't exist → create User + Chat + UsageStats + OAuthAccount
   - Not found, email exists with `authProvider: "email"` → create `AccountLink`, send confirmation email, redirect to `/link-google-pending`
4. After login: generate access+refresh tokens, set cookie, redirect to `FRONTEND_URL/oauth-success?token=<accessToken>`

**Known bug in `refreshToken` controller (authController.js:201):** `res.cookie("refreshToken", refreshToken, ...)` passes the function reference `refreshToken` instead of the local variable `newRefreshToken`. The cookie is set incorrectly. Fix: change to `newRefreshToken`.

---

## Usage & Plan Limits

`config/plans.js` is the single source of truth. Plans: `free`, `basic`, `pro`, `unlimited`.

Each plan defines: `dailyRequests`, `monthlyRequests`, `allowImages`, `defaultModel`, `allowedModels`, `fallbackModel`, `modelTokenMonthly` (per-model token budget).

**Request flow through limits:**
1. `usageLimitMiddleware` — checks `UsageStats.dailyCount` vs `plan.dailyRequests` and `monthlyCount` vs `plan.monthlyRequests`. Returns 429 with `upgradeRequired: true` if exceeded. Sets `req.usageStats` and `req.plan`.
2. `modelSelector.selectModelForRequest` — validates requested model against `plan.allowedModels`, checks `UsageStats.modelTokenMonthly` vs `plan.modelTokenMonthly`. If over limit: tries fallback model. If fallback also over limit: `blocked: true` → 429.
3. After response: `UsageStats.updateOne` increments `dailyCount`, `monthlyCount`, and `modelTokenMonthly[model]`.

---

## AI Message Pipeline (apiController.js `message`)

1. Parse `{ text, screenshot, chatId, model }` from body
2. Upload `screenshot` to Cloudinary if present → get `imageData.url`
3. Save user `Message` (text + imageUrl)
4. Update `Chat.messageCount++`
5. `buildContext({ chatId })` — assembles history (last 6 msgs, reversed; uses `msg.summary` if available else `msg.content.text`). Prepends system prompt + optional `chat.conversationSummary`. Trims to `HARD_TOKEN_LIMIT = 3500` tokens (rough estimate: chars/4) by dropping oldest messages.
6. `selectModelForRequest` — determine actual model to use
7. Build OpenAI messages array: history is text-only; only the last user message gets image_url parts (hybrid vision approach)
8. Call `openai.chat.completions.create`
9. Save assistant `Message`
10. Save `Usage` audit record
11. `UsageStats.updateOne` — increment counters
12. Async: `enqueueMessageSummary(userMsg._id)` and `enqueueMessageSummary(assistantMsg._id)`
13. If `chat.messageCount % 15 === 0`: `enqueueConversationSummary(chatId)`
14. Respond: `{ reply, modelUsed, modelDowngraded, remaining: { daily, monthly } }`

---

## Summarization Worker (utils/summarizationWorker.js)

In-process FIFO queue (not a separate process — queue is lost on restart). Two job types:

- **message-summary:** Summarizes messages with text > 400 chars or with an image. Uses `gpt-5-nano`. Stores result in `Message.summary`.
- **conversation-summary:** Every 15 messages. Takes last 40 messages (using summary or truncated text). Uses `gpt-5-mini`. Stores in `Chat.conversationSummary`. Then calls `pruneOldMessages`.
- **pruneOldMessages:** If chat has > 200 messages, deletes oldest summarized ones.

`buildContext` prefers `message.summary` over `message.content.text` for history — so summarization directly improves context quality for long conversations.

---

## Stripe / Billing

**Checkout:** `POST /billing/create-checkout-session` body: `{ plan, interval }`. Creates Stripe customer if user doesn't have one. Returns `{ url }` for redirect.

**Portal:** `POST /billing/create-portal-session`. Returns Stripe billing portal URL.

**Webhook** (`POST /billing/webhook`):
- Must use `express.raw()` — already wired in `server.js` before `express.json()`
- Idempotent: checks `StripeEvent` table before processing
- Handles: `customer.subscription.created/updated/deleted`
- Maps `priceId → planKey` via `mapPriceToPlan` (iterates PLANS config)
- Active/trialing/past_due → `subscriptionService.applyActiveSubscription` (upserts Subscription, sets `User.plan`)
- Canceled → `subscriptionService.applyCanceledSubscription` (sets `User.plan = "free"`, clears `activeSubscriptionId`)
- Toggle between test/live webhook secret via `STRIPE_MODE=live` env var

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
STRIPE_SECRET_KEY
STRIPE_MODE                       "live" | "test"
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
GOOGLE_REDIRECT_URI               Must match what's registered in Google Cloud Console
FRONTEND_URL                      https://chad-ai-nd2k.onrender.com in prod
```

---

## Key Invariants & Gotchas

- **CORS:** Allowed origins are hardcoded in `server.js`. Add new origins there.
- **Webhook body parser:** The Stripe webhook route uses `express.raw()` and is registered before `express.json()`. Never move it below `app.use(express.json())`.
- **`connectDB()` called twice:** Once at the top of `server.js` (line 18) and once inside `start()`. The second call is redundant but harmless.
- **Auth token is Bearer, not cookie:** `protect` middleware reads `Authorization: Bearer` header. Access token is returned in the JSON login response, not a cookie. Only the refresh token is a cookie.
- **`getCurrentUser` returns hardcoded usage zeros:** `UsageStats.findOne` is commented out; the endpoint returns `{ dailyUsed: 0, monthlyUsed: 0 }` always. Don't rely on this until fixed.
- **Test endpoints in `apiController.js`:** `messageNorm` and `messageErr` are exported but their routes are commented out. Safe to leave as-is; don't accidentally uncomment in prod.
- **Summarization queue is in-memory:** Server restarts drop pending summaries. This is intentional for now — summaries are non-critical.
- **Model names** in `PLANS` use internal naming (`gpt-5-nano`, `gpt-5-mini`, etc.) that maps to OpenAI model IDs. If OpenAI model IDs change, update `plans.js` and `summarizationWorker.js`.
- **When adding a new plan or model:** Update `config/plans.js` only. `usageLimitMiddleware`, `modelSelector`, and `stripeWebhookController` all derive behavior from that config.
- **When adding a new auth-protected route:** Import `protect` from `middlewares/authMiddleware.js` and use it as the first middleware. For AI routes also add `usageLimit()` after `protect`.
- **Stripe price IDs** come from env vars (in `plans.js`). If they're undefined, `createCheckoutSession` returns 500. Check env before debugging billing issues.
