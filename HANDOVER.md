# Developer handover

Read this first, then `README.md` (what exists and what doesn't) and
`DEPLOYMENT.md` (how to ship it).

## What this is

A company-controlled messaging platform. Employees work inside Custodian;
clients stay on **ordinary WhatsApp** and install nothing. The company owns
the identities, the client relationships, and the contact details.

The product exists to stop client poaching. Everything else is in service of
that: an employee never sees a client's phone number, can't export the client
list, and when they leave, their clients transfer with the history intact.

## Get it running (about 10 minutes)

Prerequisites: Node 20+, Docker Desktop.

```bash
docker compose up -d

cd api
cp .env.example .env
npm install
DATABASE_URL="postgresql://custodian_admin:custodian_admin_dev_password@localhost:5432/custodian?schema=public" npx prisma migrate deploy
npm run seed
npm run start:dev        # http://localhost:3010/api

cd ../admin
cp .env.example .env.local
npm install
npm run dev -- -p 3001   # http://localhost:3001
```

Sign in as `admin@abctrading.example` / `ChangeMe123!`
(employee: `ahmed@abctrading.example`, same password).

`WHATSAPP_PROVIDER=mock` by default — outbound sends log to the console
instead of calling Meta, so the whole app is usable with no WhatsApp account.

## The five files that carry the product

If you read nothing else, read these:

| File | Why it matters |
|---|---|
| `api/src/rbac/policy.ts` | The role → resource → action matrix. Every route checks it. |
| `api/src/clients/clients.projector.ts` | Decides which client fields leave the server. **This is the phone-number guarantee.** A `Client` is never serialised directly. |
| `api/src/policy/features.ts` | Per-person capability switches. The `resolveFeatures` invariant — overrides may only subtract — is what stops an admin accidentally escalating someone. |
| `api/src/policy/dlp.ts` | Detects contact details in outgoing messages. |
| `api/src/whatsapp/whatsapp.service.ts` | The Meta bridge, both directions. |

## Rules to work by

**1. Never serialise an entity straight to a response.** Client records go
through the projector. This is the single most important convention here — a
`res.json(client)` anywhere leaks phone numbers and defeats the product.

**2. Authorisation belongs in the guard and the service, never the UI.**
Hiding a button is a courtesy, not a control. Every new endpoint needs its
`@RequirePermission(...)`, and anything capability-gated needs
`policy.assertFeature(...)`.

**3. If you add a guard, add its test.** `messages.enforcement.spec.ts` asserts
the guards are *invoked* — that suite exists because a refactor silently
dropping an `assertFeature` call would look completely normal. It was
validated by deleting a guard and confirming the suite went red.

**4. Don't run `npm run build` while `start:dev` is running** — either app. It
wipes `dist/` (or `.next/`) under the running watcher and the server dies with
`MODULE_NOT_FOUND`. Use `npx tsc --noEmit` to type-check a running project.

**5. Meta's limits are product constraints, not TODOs.** Status, groups, and
calls can never reach a WhatsApp client — the Cloud API doesn't expose them.
The UI says so where it matters. Don't "fix" it by faking it.

## Useful commands

```bash
cd api
npm test                     # 54 tests
npx tsc --noEmit             # type-check without touching dist/
npx prisma studio            # browse the database
node scripts/call-guard-test.js    # call signalling authorisation
node scripts/presence-probe.js ADMIN-1 20   # second user for presence
node scripts/call-probe.js ADMIN-1 answer   # second peer for calls
```

## Where to start

Ordered by value, and the README explains each:

1. **Turn on Row-Level Security** and verify with two companies. Wired but
   ships off; it's the database-level backstop for tenant isolation.
2. **Move attachments to S3.** `api/src/storage/` is already an interface with
   one implementation — write the S3 one and swap it in `storage.module.ts`.
3. **Test calling with real microphones.** Signalling and authorisation are
   verified; actual media never was. You'll also need a TURN server.
4. **Broaden test coverage** — reassignment, webhook parsing, calling, UI.
5. **Status media still uses a session token in the URL.** Chat attachments
   moved to signed URLs (`api/src/attachments/signed-url.ts`); apply the same
   pattern to `/api/status/:id/media`.

## The thing only the business can do

Meta Business verification and a WhatsApp Business number take **days to
weeks** and no engineering shortens it. Until that exists, everything
client-facing runs against the mock provider. If the project has a critical
path, that's it — and it belongs to the business, not the developer.
