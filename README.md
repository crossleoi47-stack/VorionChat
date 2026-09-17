# Custodian — Vorion Systems

Backend + web app for the company-controlled messaging platform described in
the architecture blueprint. Employees work inside Custodian; clients stay on
WhatsApp, unchanged, reached through the WhatsApp Business Platform (Cloud
API).

Branded to Vorion Systems: navy `#12379B` / gold `#FDC500` from the wordmark,
Poppins for headings and the logo, Inter for everything else. Both light and
dark themes are defined (`admin/app/globals.css`); the brand navy splits into
`--brand-blue` (solid fills) and `--brand-blue-ink` (text/logo, lightened in
dark mode so it doesn't vanish into the sidebar).

This is the MVP core: auth/RBAC, the phone-masking API layer, client
assignment + offboarding transfer, the admin dashboard, and a WhatsApp
adapter that runs against a mock provider until a real WhatsApp Business
Account exists. Native mobile apps, voice messages, and the rest of Phase 2
are out of scope here — see the blueprint.

## What's built vs. what's left

**Verified end-to-end, live, in a real browser** (not just "compiles" —
actually run against Postgres/Redis in Docker, driven through the admin UI):

- Login (company/employee-code + password) issues a real JWT + refresh pair;
  wrong role/disabled/unknown-company all correctly rejected
- **The core promise, checked directly**: the same client record returns
  `phoneE164`/`email` to `COMPANY_ADMIN` and omits both fields entirely for
  `EMPLOYEE` — not blank, not null, genuinely absent from the JSON — and
  every phone read by an admin is written to the audit log with actor +
  target
- Row-level visibility: an employee hitting a client they're not assigned to
  gets a clean 404, not a masked-but-visible record; their list endpoint
  never includes it either
- WhatsApp adapter, exercised via a simulated Meta webhook: an inbound
  message matched an existing client by phone number, landed in the right
  conversation, and showed up in the assigned employee's inbox; the
  employee's reply went out through the mock provider with the
  shared-inbox name-prefix (`*Ahmed Hassan:* ...`) applied
- **Employee inbox** (`admin/app/(dashboard)/inbox`) — the actual chat
  screen, not just management tooling: conversation list, message thread,
  live delivery over the WebSocket gateway (`RealtimeGateway`). Logged in as
  the employee, in-browser: opened the WhatsApp conversation, sent a
  message, watched it appear instantly with the shared-inbox name-prefix,
  and confirmed it hit the mock provider — same live-verification standard
  as everything else here, not just "the code looks right"
- Admin dashboard (Next.js) — login, dashboard stats, employees, clients
  (phone shown/hidden exactly as the API decides), audit log, inbox — all
  checked live in-browser, zero console errors, **and role-gated**: nav
  items an employee can't use (Employees, Assignments, Audit log) are
  hidden entirely rather than visible-but-403ing, driven by a new
  `GET /api/auth/me` endpoint
- **Media messages** — photos, voice notes, and documents, verified end to
  end: uploaded a real PNG, sent it on a WhatsApp thread, confirmed the mock
  provider logged a `MOCK SEND IMAGE` with the bytes and caption, then
  fetched it back through the download route. Access control checked
  directly: no token → 401, unknown id → 404, and content is gated by the
  same "can you see this conversation" rule as the message carrying it
- **WhatsApp-style chat UI** — chat list with avatars, last-message preview,
  relative timestamps and a gold `WA` channel chip; message bubbles with
  tails, day separators (Today / Yesterday / weekday), grouped consecutive
  messages, delivery ticks (✓ / ✓✓, blue when read), inline image previews
  with a click-to-zoom lightbox, playable voice notes, document chips with
  size, typing indicator, search, and a composer with photo / attach / mic /
  send. Verified live in-browser in both light and dark
- **WhatsApp-shaped app frame** — left icon rail, chat-list panel with
  filter pills (All / Unread / Groups), Archived row, search; thread with
  the doodle wallpaper, header action icons, and WhatsApp's exact bubble
  treatment (tails, timestamp inside the bubble, ticks)
- **Message interactions** — reply-with-quote, emoji reactions, forward
  (with picker), star, edit, delete-for-me / delete-for-everyone, copy,
  plus per-chat pin / mute / archive and real unread counts. Verified in
  the browser: the hover chevron opens the menu, the quick-reaction bar
  applies a reaction, and reacting again with the same emoji removes it —
  WhatsApp's exact semantics
- Edit and delete-for-everyone are **deliberately refused on WhatsApp
  threads** with an explanatory error, because Meta exposes no such API —
  silently "editing" our copy would show staff one text and the client
  another
- **Staff groups** — create a group (two-step member picker, like WhatsApp),
  group info pane with member list, add/remove members, promote/demote group
  admins, leave group. Sender names label each message in a group thread
  (and correctly *don't* label your own). Verified end to end: both members
  see the group, messages carry sender names, and a **removed member is
  fully cut off** — 404 on reading messages, on group info, on posting, and
  the group vanishes from their chat list.
- Groups are **staff-only by design**: a WhatsApp client can never be a
  member. The Cloud API has no group messaging, and a native WhatsApp group
  would expose every member's phone number to every other member — the exact
  leak this product exists to prevent.
- **1:1 staff chats** — "New chat" picks a colleague and opens a direct
  thread. Find-or-create, so tapping the same person twice reopens the one
  thread instead of forking history (verified: two calls return the same id).
- **Presence** — online dots and "last seen today at 7:07 pm", pushed live
  over the socket. Verified end to end with `scripts/presence-probe.js`:
  opened a second user's socket, watched the dot appear in the chat list,
  then watched it clear and turn into a last-seen line when that socket
  closed. Presence lives in Redis with a 70s TTL refreshed by a 30s
  heartbeat, so a crashed instance can't strand people as permanently
  "online"; only `lastSeenAt` is persisted.
- **Last-seen privacy** — a per-user toggle (`PATCH /api/presence/settings`).
  Turning it off hides *both* last-seen and online, like WhatsApp — hiding
  only one of the two makes the setting trivially defeatable.
- Presence is shown for staff only. A WhatsApp client's online/typing state
  is never exposed by Meta, so that header shows the channel instead of
  inventing a status.
- **Status / Stories** — post a text status (8 background colours) or a
  photo; segmented ring around each avatar, one arc per update, dimmed once
  seen; full-screen viewer with auto-advancing progress bars, tap/arrow-key
  navigation, and a viewer list. Verified live: expiry is set to +24h on
  create, viewer tracking records who watched, **only the author can see the
  viewer list** (403 otherwise), and forcing a status's `expiresAt` into the
  past made it vanish from the feed *and* return 404 on view, viewers, and
  media — expiry is enforced on every path, not just the listing.
- Status is staff-only and says so on screen: Meta gives businesses no
  status channel, so a WhatsApp client can never see these.
- **Socket auto-reconnect verified under a real API restart** — killed the
  API mid-session, restarted it, and the open page came back online on its
  own with no reload.
- **Voice & video calling (staff-to-staff, WebRTC)** — incoming calls ring as
  a corner toast so you can keep working, full-screen overlay once live, with
  mute, camera toggle, call timer, picture-in-picture self-view, and a call
  log with direction/status/duration. Media is peer-to-peer; the server only
  relays SDP/ICE.
- **Signalling authorization is tested, not assumed** —
  `scripts/call-guard-test.js` spins up a third user and confirms an outsider
  cannot accept, inject SDP into, or end a call they aren't part of, and
  receives no call events at all. Both assertions pass.
- Verified with `scripts/call-probe.js` acting as a second peer: invite →
  incoming (with caller name and type) → accept → SDP relay all work, and the
  browser overlay drove the correct states throughout.
- **Inbound WhatsApp media — the client channel now works both ways.** A
  client's photo, voice note, video, sticker or document is downloaded off
  Meta's temporary hosting during webhook processing, copied into our own
  storage, and attached to the message with its caption. Verified: an inbound
  photo arrives as `IMAGE` with a real attachment whose bytes download back
  as a valid PNG; a voice note arrives as `VOICE` with `audio/ogg`. If the
  media fetch fails the message is still saved — the text and the fact
  something was sent are never lost to a download error.
- **Inbound replies are threaded.** When a client replies to one of our
  messages, Meta's `context.id` is matched back to our stored `waMessageId`
  so the quote renders in the thread. Verified end to end.
- **Admin control plane** — a Controls screen with nine per-employee
  capability switches (send media, send voice, download attachments, start
  chats, see client phone numbers, forward, export, create groups, place
  calls) plus company-wide DLP.
- **Enforcement is server-side, and that was tested by attacking it**, not by
  clicking the UI. With `sendMedia` off, a direct API call to send a photo
  returns 403 while plain text still sends; with `downloadAttachments` off,
  fetching an attachment by URL returns 403; with `createGroups` off, the
  group endpoint returns 403. Each message names the specific capability.
- **Switches can only subtract, never add.** A per-person override is capped
  by the role's baseline (`resolveFeatures` in `policy/features.ts`), so an
  admin toggling a switch can never accidentally escalate someone's access.
  The UI shows this too — capabilities the role doesn't grant render greyed
  out and un-toggleable.
- **DLP verified against real leak attempts**: "call me directly on +971 50
  987 6543" is blocked (phone *and* restricted phrase), "ahmed.personal@
  gmail.com" is blocked, and "Your order 4471 shipped" still sends — the
  digit-length heuristic keeps order numbers from tripping it. Four modes:
  off / warn / flag / block.
- **Everything lands in the audit trail** — blocked attempts, flagged sends
  (with the exact matched text), and every admin switch change, each
  attributed to a named person. Verified by reading the log back.
- Message text is deliberately *not* copied into audit rows: the conversation
  already holds it, and duplicating client content into a second store widens
  the blast radius of a leak.
- **Oversight screen** — admins and auditors can list every conversation in
  the company and read any of them. **Every read is written to the audit log
  under the reader's name**: oversight is deliberately not invisible. Locked
  to admins/auditors (an employee hitting the endpoint gets 403).
- **Anomaly detection** — flags the access pattern that actually precedes
  someone leaving with a client list: bulk phone-number views, repeated DLP
  hits, and exports over a rolling window. Deliberately simple and
  explainable — it shows the counts behind every flag, because an admin has
  to trust it enough to act on it. Verified on real data: it correctly
  flagged the employee **HIGH** off the DLP hits from the enforcement tests.
- **The test suite went from 12 to 54 tests** (`npm test` in `api/`), now
  covering the policy layer: the "overrides can only subtract, never add"
  invariant across every role, DLP detection *and* false-positive cases
  (order numbers, prices, references must pass), and enforcement wiring.
- **The enforcement tests were themselves verified.** A regression test that
  passes whether or not the code is right is worthless, so I removed the
  `forwardMessages` guard and confirmed the suite went red, then restored it.
- **WhatsApp setup screen** — connect a Business number from inside the app
  instead of editing server config. Enter the Phone Number ID, WABA ID,
  access token, app secret and verify token; **Test connection** calls Meta
  and reports their actual error (verified: a bad token came back as
  `"Malformed access token"`, not a crash).
- **Credentials are encrypted at rest and never returned.** Verified by
  reading the database directly — the stored value is AES-256-GCM ciphertext
  with no plaintext, and the API returns only a mask (`EAAG••••OKEN`).
  Grepping the whole API response for the raw token finds nothing.
- Storing an app secret makes **webhook signature verification mandatory**
  for that number. All four cases verified: unsigned → 403, correctly signed
  → 201, tampered body with an otherwise-valid signature → 403, and the
  verify handshake accepts the UI-entered token while rejecting others.
- **Signed attachment URLs** replace the old `?token=<session JWT>` approach.
  A session token in a URL lands in access logs, browser history and Referer
  headers and grants everything that session can do; a signature grants one
  attachment for five minutes. Verified: valid signature serves the file with
  no auth header, tampered signature → 403, bare URL → 403.
- **Signed links respect revocation immediately** — the download path
  re-checks live permissions, so disabling `downloadAttachments` killed an
  already-issued link on the next request (403) and restoring it brought the
  same link back (200). Plain presigned URLs cannot do that.
- **Row-Level Security is now wired** — `AsyncLocalStorage` carries the tenant
  through the async call chain, a global interceptor binds it per request, and
  `PrismaService.withTenant` sets `app.company_id`. Ships behind
  `ENABLE_RLS=false` with a startup warning; DEPLOYMENT.md step 5 covers
  turning it on safely (including the trap that a superuser DB role silently
  ignores RLS).
- **Deployment** — multi-stage Dockerfiles for both apps (non-root, pruned dev
  deps, healthcheck), `docker-compose.prod.yml`, and a `/api/health` endpoint
  that does a real database round-trip. `DEPLOYMENT.md` walks the whole path
  and ends with an honest list of what's still missing.
- **Email + password sign-in.** The old screen asked for three things
  (company code, employee ID, password) because employee codes are only
  unique *within* a company. Email is globally unique, so it carries the
  tenant itself and two fields suffice — the company is resolved from the
  account. Employee codes remain as the human-readable identity in the UI.
  Verified: email login resolves the right company, uppercase input works,
  and the legacy three-field path still succeeds so nothing broke.
- **Login doesn't leak which accounts exist.** A wrong password and an
  unknown email return byte-identical responses — checked explicitly, because
  differing errors are how attackers enumerate valid addresses. Login is also
  rate-limited (5/min), which the tests hit for real.

**Bugs this live run found and fixed** (the reason "compiles clean" was
never going to be enough — keeping this here so you know what almost
shipped broken):

- `api/prisma/rls.sql` had a real bug: `client_assignments` doesn't carry a
  `companyId` column (it's scoped through `clientId` → `clients.companyId`),
  but the script's blanket policy assumed every tenant-scoped table did,
  which made the whole RLS setup script fail outright. Also found:
  `group_members`, `message_status`, `attachments`, and `sessions` were
  named in a comment as needing join-based policies but never actually got
  one. All fixed, and the script is now idempotent (safe to re-run).
- **Row-Level Security was disabled with no wiring** — the app never set the
  Postgres session variable the policies check, so enabling `prisma/rls.sql`
  would have made every query (including login) return zero rows. Now wired
  via `AsyncLocalStorage` + a global interceptor + `PrismaService.withTenant`,
  and gated behind `ENABLE_RLS` so it can't be half-enabled by accident. It
  still ships **off** by default — turning it on is a deliberate deployment
  step, documented in DEPLOYMENT.md, and **I have not run the app with it on**
  against a multi-tenant dataset. Verify with two companies before trusting it.
- The dashboard and every other admin-only page originally fetched data
  unconditionally (`Promise.all([...])` with no `.catch`) — fine for an
  admin, but an `EMPLOYEE` landing on `/` after login got a wall of
  unhandled-promise-rejection errors and a dashboard showing all zeros,
  because one 403 (`/users`, which employees can't read) took the whole
  `Promise.all` down with it, even though `/clients` would have succeeded.
  Fixed: the dashboard now fetches independently per-field with
  `Promise.allSettled` and only requests what the current role can actually
  read; every other page's fetch got a `.catch(() => {})` safety net so a
  direct hit on an admin-only URL fails quietly instead of throwing.

- Helmet sets `Cross-Origin-Resource-Policy: same-origin` on every response,
  which silently blocked every inline image in the chat (the web app and the
  API are different origins). Caught because the `<img>` reported
  `naturalWidth: 0` despite a 200 response. Relaxed to `cross-origin` on the
  attachment-content route only — the content is still token-gated, so the
  embed grants nothing extra — rather than weakening the header globally.
- Attachment URLs pass the access token as a `?token=` query param, because
  `<img>` and `<audio>` cannot send an `Authorization` header. It works and
  the token is short-lived, but query strings leak into server logs and
  referrer headers: **before production, swap this for per-attachment signed
  URLs** (blueprint §15). Marked in `attachmentUrl()` in `admin/lib/api.ts`.

**Calling: the honest limits**

- **Real audio/video was never verified end to end.** The sandbox browser
  blocks microphone access, so I could only prove signalling, the UI states,
  and the authorization guards. The `getUserMedia` denial surfaced correctly
  as an on-screen error rather than failing silently, which is the right
  behaviour — but two real browsers with real devices still need to be tested
  by you before trusting calls.
- **You will need a TURN server.** Only public STUN is configured. STUN is
  enough when both people can reach each other fairly directly (same office
  LAN, friendly home NATs). Calls across symmetric NATs or strict corporate
  firewalls need a TURN *relay*, which you must run or rent — there is no
  free public TURN worth depending on. Without it, expect some calls to ring,
  connect signalling, then fail to establish media (the UI says exactly
  that). Set `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL` in `api/.env`.
- **1:1 only.** Group calling needs an SFU (a media server) on top of this —
  a separate project, not an increment.
- Calls are staff-to-staff. The buttons are disabled with an explanatory
  tooltip on WhatsApp and group threads rather than hidden, so the limit is
  visible rather than mysterious.

**Not yet done, and worth knowing about before you rely on this:**

- Tests cover the policy layer and authorization well, but still nothing for
  the reassignment flow, WhatsApp webhook parsing, calling, or any UI.
- **Status media still uses a session token in the query string.** Chat
  attachments moved to signed URLs; `/api/status/:id/media` did not, so the
  same logging/Referer concern applies there. Same fix, not yet applied.
- The WhatsApp setup screen can set a credential but not **clear** one — you
  can overwrite a token, not blank it. Removing the number is the workaround.
- **Deployment is untested.** The Dockerfiles and prod compose are written and
  reviewed but were never built or run in this environment; treat the first
  `docker compose -f docker-compose.prod.yml up --build` as a debugging
  session, not a launch.
- Oversight has no **live** supervisor view (watching a conversation as it
  happens) and anomaly thresholds are hardcoded rather than configurable.
- Anomaly detection only sees what passes through Vorion. An employee who
  memorises numbers, photographs the screen, or shares contact details on a
  phone call is invisible to it — it raises the cost of leaking and makes it
  attributable, it does not prevent it.
- `npm audit` flags 1 high-severity Next.js advisory
  (`GHSA-955p-x3mx-jcvp`, Server Actions endpoint disclosure) that only a
  major version bump to Next 16 fixes; this app doesn't use Server Actions,
  so the actual exposure looks low, but that's not the same as confirmed —
  revisit deliberately, don't just `npm audit fix --force` it.
- Departments/groups have minimal CRUD (create + list); the group-messaging
  screens from the blueprint's admin dashboard (§8) aren't built.
- The permissions policy (`api/src/rbac/policy.ts`) is a static, code-level
  map, not the DB-editable table the blueprint's §4 stretch goal describes —
  fine for MVP, but a "managers see phone numbers only for their team" kind
  of rule needs a new scope check added there, not a config change.
- **No client app, by decision.** Clients stay on ordinary WhatsApp and are
  never asked to install anything — that convenience is the point of the
  product. The consequence is permanent, not a backlog item: status, groups,
  and calls are staff-only forever, because Meta exposes none of them to
  businesses. The client experience is text, photos, documents, voice notes,
  replies and reactions, which is what's built.
- Delivery ticks reflect real WhatsApp status webhooks, but internal
  (non-WhatsApp) threads have no read-receipt path yet — those bubbles show
  a single ✓ permanently.
- Voice recording uses `MediaRecorder`, which needs a secure context:
  it works on `localhost` and over HTTPS, but will silently fail if you ever
  serve the app over plain HTTP from another host.
- **Still to build for full WhatsApp parity** (agreed direction: build
  everything; staff get it all, WhatsApp clients get whatever Meta allows):
  staff groups, status/stories, presence (online/last-seen), voice/video
  calling, emoji picker, inbound WhatsApp media, and a client-facing Vorion
  app so clients who install it get the full feature set instead of the
  WhatsApp-limited subset.
- A popover closed itself the instant it opened: a `window` click listener
  was swallowing the very click that opened the menu, because it raced
  React's root-level click handling. Replaced with an explicit backdrop
  element — the reliable pattern, and it removed the propagation guesswork.
- **Calls could hang in `RINGING` forever.** Nothing timed out an unanswered
  call, so a caller closing the tab mid-ring (or a server restart) left the
  row `RINGING` permanently and polluted the call log. Fixed with a 45s ring
  timeout applied by a periodic sweep rather than per-call timers, so it
  survives restarts — verified by watching a stuck call flip to `MISSED`.
- **A call whose media never connected still logged as a normal call.** The
  browser detected `connectionState === "failed"` but only showed a UI error,
  so the log showed a tidy 46-second conversation that never actually
  carried audio. The client now reports the failure and the row records
  `FAILED`.
- **`setState` inside a state updater closed the story viewer instantly.**
  `StoryViewer.next()` called `setAi(...)` and `onClose()` from inside a
  `setIi(prev => …)` updater. Updaters must be pure — React re-invokes them,
  twice under StrictMode — so `onClose()` fired on mount and the viewer shut
  the moment it opened. Rewritten to branch on the current values outside
  the updater. Caught from the React warning in the console, which was
  pointing at the real cause the whole time.
- **Socket died silently after a token refresh.** `getSocket()` passed a
  static `auth: {token}` captured at creation. Access tokens expire every 15
  minutes and are refreshed transparently, so the first reconnect after a
  refresh presented a stale token, the gateway rejected it, and live
  messages plus presence stopped with nothing visible in the UI. Fixed by
  making `auth` a callback that re-reads the current token on every
  connection attempt, plus unbounded reconnection so a sleeping laptop
  recovers on its own. Found because presence reported `online: false` on a
  page that was plainly open.
- **Don't run `npm run build` while `start:dev` is running** — for either
  app. It wipes `dist/` (or `.next/`) underneath the running watcher and the
  server dies with `MODULE_NOT_FOUND`. Use `npx tsc --noEmit` to type-check
  a running project instead. Cost two restarts before it stuck.
- **Orphaned groups.** Removing and re-adding a member brought them back as
  a plain member, so a group could end up with zero admins and become
  unmanageable by anyone except a company admin. Fixed two ways: an explicit
  promote/demote control, a refusal to demote the last admin, and
  auto-promotion of the longest-standing member if the last admin leaves.
  Found only because a live test happened to hit that sequence.

## Run it locally

```bash
# 1. Start Postgres + Redis (needs Docker Desktop running)
docker compose up -d

# 2. Backend
cd api
cp .env.example .env
npm install
DATABASE_URL="postgresql://custodian_admin:custodian_admin_dev_password@localhost:5432/custodian?schema=public" npx prisma migrate dev --name init
npm run seed        # creates company ABC, admin ADMIN-1, employee EMP-1024, a demo client
npm run start:dev   # http://localhost:3010/api — change PORT in .env if something else already owns 3010

# 3. Admin dashboard (separate terminal)
cd admin
cp .env.example .env.local   # update NEXT_PUBLIC_API_BASE if you changed the API's PORT above
npm install
npm run dev -- -p 3001       # http://localhost:3001
```

Sign in with **email and password**:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@abctrading.example` | `ChangeMe123!` |
| Employee | `ahmed@abctrading.example` | `ChangeMe123!` |

(from the seed script — change these before this touches real data). `WHATSAPP_PROVIDER=mock` in `api/.env` means outbound WhatsApp sends
just log to the console instead of calling Meta — see
`api/src/whatsapp/providers/mock-whatsapp.provider.ts`. Switch to
`WHATSAPP_PROVIDER=meta` once you have a real WhatsApp Business Account,
phone number, and access token (blueprint §9/§20 — this has real lead time
with Meta, start it early).

**Don't run `prisma/rls.sql` yet** — see "Row-Level Security is currently
disabled" above. Applying it before the tenant-context wiring exists will
break login and every other query, not just tighten security.

If `docker compose up` fails with `read-only file system`, your C: drive is
full — Docker's virtual disk lives there by default. Move it via Docker
Desktop → Settings → Resources → Advanced → "Disk image location" to a
drive with space.

## Layout

```
custodian/
  api/      NestJS backend — auth, RBAC, clients, assignments, WhatsApp adapter
  admin/    Next.js admin dashboard
  db/       Postgres bootstrap (docker-compose init script)
  docker-compose.yml   Local Postgres + Redis
```

See `api/src/rbac/policy.ts` and `api/src/clients/clients.projector.ts` for
the two files doing the actual work behind "phone numbers are enforced at
the API, not hidden in the UI" — everything else in the backend is built
around routing every request through them.
