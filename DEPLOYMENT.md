# Deploying Custodian

This is a working deployment path, not a hardened one. Read the whole page
before putting real client data in it — the gaps at the bottom are real.

## What you need first

| Thing | Why | Who can do it |
|---|---|---|
| A server with Docker | Runs the stack | You |
| A domain + TLS certificate | Meta only calls HTTPS webhooks | You |
| Meta Business verification | Required for a WhatsApp number | **Only you** — takes days |
| WhatsApp Business number + token | The client channel | **Only you** |
| A TURN server (optional) | Calls across strict networks | You, if calling matters |

Meta verification is the long pole. Start it before anything else; no amount
of deployment work shortens it.

## 1. Generate secrets

Never reuse the development values. Each of these must be unique and random:

```bash
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log('APP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

**Back up `APP_ENCRYPTION_KEY` somewhere separate from the database.** It
decrypts the WhatsApp tokens admins enter through the UI. Lose it and those
must be re-entered; leak it *together with* a database dump and they're
compromised. Keeping it out of the database is the entire point.

## 2. Create the environment file

Create `.env` next to `docker-compose.prod.yml`:

```bash
POSTGRES_ADMIN_USER=custodian_admin
POSTGRES_ADMIN_PASSWORD=<random>
POSTGRES_DB=custodian

# The API connects as the NON-superuser app role (created by db/init-db.sql).
DATABASE_URL=postgresql://custodian_app:<app-role-password>@postgres:5432/custodian?schema=public

JWT_ACCESS_SECRET=<from step 1>
JWT_REFRESH_SECRET=<from step 1>
APP_ENCRYPTION_KEY=<from step 1>

PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_API_BASE=https://api.example.com/api

WHATSAPP_PROVIDER=meta
ENABLE_RLS=false   # see step 5
```

Change the app-role password in `db/init-db.sql` before first boot — it ships
with a development default.

## 3. Start it

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Then run migrations once, as the admin role:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL="postgresql://custodian_admin:<admin-password>@postgres:5432/custodian?schema=public" \
  api npx prisma migrate deploy
```

Create your first company and admin user by adapting `api/prisma/seed.ts` —
**change the seeded password**, it is `ChangeMe123!` in the file.

## 4. Put a reverse proxy in front

Neither container terminates TLS. Point a proxy at them:

- `https://app.example.com` → `admin:3000`
- `https://api.example.com` → `api:3000`

WebSockets must pass through on the API host, or messaging, presence, and
calling all silently degrade to nothing. With nginx that means
`proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`.

## 5. Turn on Row-Level Security

RLS is the database-enforced second layer of tenant isolation. It ships
**off**, because enabling it without the app role configured correctly makes
every query return nothing.

```bash
# Apply the policies (as the admin role)
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U custodian_admin -d custodian < api/prisma/rls.sql
```

Then set `ENABLE_RLS=true` and restart the API.

**Check two things or it is theatre:**

1. `DATABASE_URL` uses `custodian_app`, not `custodian_admin`. Postgres
   superusers ignore RLS entirely — it will look enabled and do nothing.
2. After enabling, log in and load a conversation. If lists come back empty,
   the tenant context is not reaching the database; set `ENABLE_RLS=false`
   and investigate rather than shipping broken.

## 6. Connect WhatsApp

Do this in the app, not in config files: sign in as an admin →
**WhatsApp setup**. Enter the Phone Number ID, WABA ID, access token, app
secret, and a verify token of your choosing, then press **Test connection** —
it calls Meta and reports the real error if anything is wrong.

Paste the webhook URL shown on that screen into Meta's dashboard with the same
verify token.

Storing an app secret makes webhook signature verification **mandatory** for
that number. That is correct and desirable; it also means unsigned test calls
stop working.

## 7. Backups

Nothing here backs itself up.

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U custodian_admin custodian | gzip > custodian-$(date +%F).sql.gz
```

Automate it, store it off the host, encrypt it, and **restore it somewhere at
least once** — an untested backup is a guess. Back up the `uploads` volume
too, or move attachments to S3.

## Known gaps before this is production-grade

These are honest, not hypothetical:

- **Attachments live on a container volume.** Fine on one host, lost if that
  host dies. Implement the `StorageProvider` interface against S3 —
  `api/src/storage/` is already written for that swap.
- **No automated backups.** Step 7 is manual.
- **Single API instance assumed.** The code is written for horizontal scaling
  (Redis-backed presence, stateless auth), but the WebSocket gateway needs
  the Redis adapter wired before running more than one instance, or sockets
  on different instances stop seeing each other.
- **No log aggregation, metrics, or alerting.**
- **Calling has no TURN server** unless you add one, so calls across strict
  networks will fail to connect media.
- **Real audio/video calling has never been verified** with actual
  microphones — signalling and authorization were tested, media was not.
- **Test coverage is partial**: policy enforcement, RBAC, and DLP are well
  covered; the reassignment flow, webhook parsing, calling, and all UI are not.
- **No penetration test.** Get one before client data goes in.
