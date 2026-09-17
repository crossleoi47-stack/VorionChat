# VorionChat Project Handover

Last updated: August 25, 2026

This is the single handoff document for the project. It is written so you can paste it to ChatGPT or another developer and let them continue from a solid starting point.

## 1. Project summary

VorionChat is a company-controlled messaging platform.

The core business idea is:

- Employees use the Vorion admin web app.
- Clients stay on normal WhatsApp and do not install anything.
- The company owns the client relationships.
- Employees should not freely extract client phone numbers or take clients with them when leaving.

The product tries to solve client poaching by:

- masking client contact details for normal employees
- routing all client communication through the company system
- logging sensitive actions in an audit trail
- supporting reassignment/offboarding
- enforcing role-based access and feature restrictions on the server

## 2. Current local working state

As of August 25, 2026, the project is running locally with these ports:

- Admin frontend: `http://localhost:3001`
- Login page: `http://localhost:3001/login`
- Main app after login: `http://localhost:3001/inbox`
- API backend: `http://localhost:3010/api`
- Health check: `http://localhost:3010/api/health`
- PostgreSQL: `localhost:5432`

Known local port situation:

- Port `3000` is already used by another project on this machine.
- Because of that, this project was moved to API port `3010`.
- The Next.js admin app auto-runs on `3001`.

Verified local login credentials from the seed data:

- Admin: `admin@abctrading.example` / `ChangeMe123!`
- Employee: `ahmed@abctrading.example` / `ChangeMe123!`

## 3. Important fixes already made

These are important because they explain why login and startup were failing before:

- Backend port conflict fixed:
  The app originally expected the API on `3000`, but another project was already using that port. Vorion API was moved to `3010`.

- Frontend API base fixed:
  The admin app now points to `http://localhost:3010/api`.

- Login throttling relaxed for local development:
  Login was returning `429 Too Many Requests` because the auth route allowed only 5 attempts per minute. This was increased to 20 per minute for login and 30 per minute for refresh.

- Login redirect improved:
  Successful login now redirects directly to `/inbox`, which is the real main app area.

- Backend seed flow fixed:
  The old seed command did not reliably load environment variables. The package script was corrected so seeding works consistently.

- Backend production build fixed:
  TypeScript incremental build artifacts caused incomplete output in `dist/`, which broke `start:prod`. Build config was corrected so the full backend compiles properly.

## 4. Tech stack

- Frontend: Next.js 14, React, TypeScript
- Backend: NestJS, TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Realtime: Socket.IO
- Cache/presence: Redis when available, in-memory fallback when not
- Storage: local disk storage abstraction exists; can later be swapped for S3
- Auth: JWT access token + refresh token

## 5. Project structure

Main folders:

- `admin/`
  Next.js admin dashboard and chat UI

- `api/`
  NestJS backend, auth, permissions, clients, messaging, WhatsApp adapter

- `db/`
  database bootstrap scripts

- `docker-compose.yml`
  local infrastructure for Postgres and Redis

Most important backend files:

- `api/src/rbac/policy.ts`
  role-to-permission matrix

- `api/src/clients/clients.projector.ts`
  controls which client fields are exposed to which users; this is critical for phone masking

- `api/src/policy/features.ts`
  per-user feature controls and "subtract only" logic

- `api/src/policy/dlp.ts`
  data loss prevention checks for outgoing messages

- `api/src/whatsapp/whatsapp.service.ts`
  WhatsApp integration logic

Most important frontend files:

- `admin/app/login/page.tsx`
  login screen

- `admin/app/(dashboard)/inbox/page.tsx`
  main chat/inbox UI

- `admin/app/(dashboard)/layout.tsx`
  authenticated app shell and navigation

- `admin/lib/api.ts`
  frontend API client and token handling

- `admin/lib/socket.ts`
  realtime socket connection logic

## 6. Roles in the system

The system is role-based. The exact policy lives in code, not in the database.

Roles include:

- `COMPANY_ADMIN`
- `EMPLOYEE`
- there are also code paths for higher oversight/admin style roles such as auditors and managers depending on the policy file

What the roles generally mean:

- Admins can manage staff, clients, controls, oversight, WhatsApp setup, and audit views
- Employees can mainly work in assigned conversations and limited operational screens
- Sensitive capabilities are enforced on the backend, not only hidden in the UI

## 7. Functionalities currently present in the project

This is the main feature inventory.

### 7.1 Authentication and session management

- Email + password login
- JWT access token issuance
- Refresh token issuance
- Token refresh endpoint
- Logout endpoint
- Authenticated "who am I" endpoint (`/auth/me`)
- Disabled-user rejection
- Unknown-user / wrong-password rejection
- Generic failure behavior to reduce account enumeration risk
- Rate limiting on login and refresh

### 7.2 Dashboard shell and navigation

- Protected dashboard layout
- Left-side navigation rail
- Role-aware navigation visibility
- Dashboard landing page with summary stats
- Logout from app shell

Main routes in the frontend:

- `/login`
- `/`
- `/inbox`
- `/status`
- `/clients`
- `/employees`
- `/assignments`
- `/controls`
- `/oversight`
- `/whatsapp`
- `/audit-log`

### 7.3 Employee and staff management

- List employees/users
- Create employee/user
- Disable employee/user
- Department listing
- Department creation
- Role-aware employee management screens

### 7.4 Client management

- List clients
- View client details
- Create client
- API-side masking of client phone/email for normal employees
- Company admins can view sensitive client contact fields
- Sensitive reads are audit logged
- Employees only see their assigned clients

### 7.5 Assignment and offboarding flows

- Reassign client ownership/work
- Offboard employee-related assignments
- Preserve client relationship continuity inside the company

### 7.6 Conversations and inbox

- List conversations
- Create/find direct conversations
- Mark conversation read
- Conversation state updates
- WhatsApp conversation handling
- Staff 1:1 chats
- Group conversations for staff
- Inbox UI with conversation list and message thread
- Search and filtering UI
- Archived row / unread grouping behavior in the UI

### 7.7 Messaging

- Fetch messages for a conversation
- Send text messages
- Send media messages
- Send voice notes
- Reactions on messages
- Star messages
- Edit messages
- Delete messages
- Forward messages
- Reply with quoted context
- Copy message action in the UI
- Unread counts
- Pin/mute/archive chat actions in the UI

Important limitation:

- Edit/delete-for-everyone behavior is intentionally restricted for WhatsApp threads where Meta does not support true parity.

### 7.8 Attachments and media

- File upload endpoint
- Attachment download/content endpoint
- Signed attachment links
- Permission checks on attachment access
- Attachment restrictions tied to user capabilities
- Inline image/audio/document rendering in the chat UI
- Local disk storage provider is implemented

### 7.9 Staff groups

- Create group
- Group info pane
- Add members
- Remove members
- Promote/demote group admins
- Leave group
- Admin continuity protections so a group does not become unmanaged

Important limitation:

- Groups are staff-only by design.
- WhatsApp clients are not members of system groups.

### 7.10 Presence and realtime

- WebSocket gateway
- Online presence heartbeat
- Last seen tracking
- Realtime conversation join flow
- Typing indicator events
- Socket auto-reconnect support
- Redis-backed presence when Redis exists
- In-memory fallback when Redis is unavailable
- Last-seen privacy setting

### 7.11 Status / stories

- Post text status
- Post photo status
- 24-hour expiry model
- Viewer tracking
- Viewer list for author
- Story/status viewer UI
- Progress bars and navigation behavior
- Seen/unseen ring behavior

Important limitation:

- Status is staff-only.
- WhatsApp clients do not receive Vorion status updates.

### 7.12 Calls

- Staff-to-staff voice/video call signaling
- Call invite
- Call accept
- Call decline
- Call end
- SDP/ICE relay via server
- Call overlay UI
- Call log
- Call duration tracking
- Ring timeout handling
- Failed-call handling

Important limitations:

- Real audio/video still needs proper end-to-end testing in real browsers/devices
- TURN server is needed for stronger real-world connectivity
- Calls are 1:1 staff calls only
- No group calling
- No WhatsApp client calling

### 7.13 WhatsApp integration

- Mock WhatsApp provider for local development
- Meta/Cloud API oriented provider structure
- WhatsApp webhook endpoint
- Webhook signature verification support
- Inbound client message ingestion
- Outbound WhatsApp message sending
- Inbound media ingestion
- Inbound reply threading using WhatsApp context
- WhatsApp account configuration screen
- Test connection flow for WhatsApp credentials
- Encrypted credential storage
- Credential masking in API responses

Important limitations:

- Real production usage depends on actual Meta Business verification and a real WhatsApp Business number
- Some WhatsApp parity features are impossible because Meta does not expose them

### 7.14 Controls / policy / data loss prevention

- Per-user capability switches
- Company-wide DLP modes
- Capability catalog endpoint
- Read current policy state
- Update user-specific capability overrides
- Update DLP settings
- Server-side enforcement of restrictions
- Subtractive-only permission overrides

Examples of capability-style controls already present:

- send media
- send voice
- download attachments
- start chats
- see client phone numbers
- forward messages
- export
- create groups
- place calls

### 7.15 Audit and oversight

- Audit log endpoint and screen
- Logging of sensitive operations
- Logging of policy changes
- Logging of blocked/flagged DLP events
- Oversight conversation listing
- Oversight conversation reading
- Oversight anomaly endpoint
- Oversight reads are themselves audit logged

### 7.16 Anomaly detection

- Detect suspicious behavior patterns
- Bulk phone-number access visibility
- Repeated DLP trigger detection
- Export-related anomaly signals
- Risk ranking output for oversight/admin use

## 8. Backend API modules currently present

These modules exist in `api/src/`:

- `auth`
- `users`
- `clients`
- `assignments`
- `departments`
- `conversations`
- `messages`
- `attachments`
- `groups`
- `presence`
- `status`
- `calls`
- `policy`
- `audit`
- `oversight`
- `whatsapp`
- `realtime`
- `storage`
- `crypto`
- `prisma`
- `rbac`
- `health`

## 9. Database and seed data

The project uses Prisma with PostgreSQL.

What already exists:

- Prisma schema
- migration history
- seed script
- tenant-aware data model structure
- RLS SQL script prepared for database-level tenant enforcement

Seed data includes:

- demo company
- admin user
- employee user
- demo client data

## 10. Security model already implemented

This project is not just a UI scaffold. There are real backend protections:

- route protection with JWT auth
- role/permission checks through backend guards
- client data projection instead of raw entity exposure
- attachment access checks
- DLP enforcement on outgoing content
- audit logging of sensitive reads and changes
- encrypted storage for WhatsApp secrets/tokens
- signed attachment URLs

Important security note:

- Row-Level Security exists conceptually and has supporting SQL/wiring, but it is not the main active protection by default unless explicitly enabled and verified in deployment.

## 11. Known gaps, limitations, and unfinished areas

These are important for the next ChatGPT or developer to know.

### High-priority gaps

- Full deployment path is not deeply proven in production
- Row-Level Security should be verified carefully with true multi-company test data before trusting it in production
- Real call media testing is still needed
- TURN server setup is still needed for reliable calling outside easy networks
- Some tests are still missing for UI, reassignment, webhook parsing, and calling

### Product/feature limitations by design

- Clients stay on WhatsApp, so they will never get full Vorion feature parity
- WhatsApp clients cannot join staff groups
- WhatsApp clients cannot use Vorion status/stories
- WhatsApp clients cannot use Vorion voice/video calling

### Technical limitations still present

- Redis may be absent locally; presence falls back to in-memory mode
- Status media still deserves the same signed-link treatment used for attachments
- Some policy logic is still code-level static configuration, not admin-editable database policy
- Oversight thresholds are not deeply configurable yet

## 12. How to run the project locally

Recommended order:

### Backend

From `api/`:

```bash
npm install
npm run start:dev
```

Expected local API:

```bash
http://localhost:3010/api
```

### Frontend

From `admin/`:

```bash
npm install
npm run dev
```

Expected local frontend:

```bash
http://localhost:3001
```

### Database

The app expects PostgreSQL on port `5432`.

If using Docker in a fresh setup, the repo includes compose files and bootstrap scripts. If Docker is not available, a local PostgreSQL instance is required.

### Important local environment values

Frontend:

- `admin/.env.local`
- `NEXT_PUBLIC_API_BASE=http://localhost:3010/api`

Backend:

- `api/.env`
- `PORT=3010`

## 13. Current startup/behavior notes

These log messages are currently expected and not fatal:

- Next.js using `3001` because `3000` is busy
- Chrome devtools probing `/.well-known/appspecific/com.chrome.devtools.json` and getting `404`
- Redis unavailable warning, which causes in-memory presence fallback

The API health endpoint should return:

```json
{"status":"ok"}
```

## 14. Recommended next tasks

If another ChatGPT or developer resumes the project, these are good next steps:

1. Verify the full login flow manually in browser and confirm token refresh/logout behavior.
2. Finish the remaining missing tests, especially UI, reassignment, webhook parsing, and calls.
3. Validate Row-Level Security with a true multi-tenant dataset.
4. Improve deployment confidence with a clean production-style run.
5. Review status-media security and align it with signed attachment patterns.
6. Consider moving storage from local disk to S3-compatible object storage.
7. Decide whether policy rules should remain code-based or move into database/admin-managed configuration.

## 15. Best short explanation to give another ChatGPT

If you want to brief another assistant very quickly, use this:

"This is a NestJS + Next.js company-controlled messaging platform where employees use the web app and clients remain on WhatsApp. The core business rule is that employees should not freely access or steal client contact details. Sensitive client fields are projected server-side, actions are audit logged, WhatsApp is integrated through a provider layer, and there are admin controls for permissions, DLP, oversight, assignments, status, groups, and staff-only calls. Local frontend runs on 3001, local API runs on 3010, and login uses admin@abctrading.example / ChangeMe123!."

## 16. Final note

This project is beyond a bare scaffold. It already contains a real backend, real permissions, real seeded data, real login, real chat/inbox flows, WhatsApp-oriented integration structure, and a broad admin surface.

The biggest remaining work is not "build everything from scratch." The real next phase is:

- stabilize
- test deeper
- verify multi-tenant security more strongly
- harden deployment
- finish the remaining product edges
