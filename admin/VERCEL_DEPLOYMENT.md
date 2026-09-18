# Vercel frontend deployment

The recommended Vercel project points directly at the Next.js application in
`admin/`. Configure the Vercel project as follows:

| Setting | Value |
| --- | --- |
| Root Directory | `admin` |
| Framework Preset | Next.js |
| Install Command | Default (`npm install` or lockfile-based install) |
| Build Command | `npm run build` |
| Output Directory | Framework default (or `.next`, never `admin/.next`) |

Do not deploy `public/` or serve `.next/` as a generic static directory.
Use Vercel's Next.js framework integration.

The App Router root route is `app/(dashboard)/page.tsx` (route groups do
not appear in URLs). Its layout sends unauthenticated browsers to `/login`.
Successful login sends the user to `/inbox`. Neither `/dashboard` nor
`/workspace-management` is an application route.

In Vercel, verify the connected repository and production branch against
the intended release. Then verify the production deployment's unique
`vercel.app` URL at both `/` and `/login`. If those work but
`chatapp.vorionsystems.com` does not, check that the custom domain is assigned
to this project and its production environment. Apply the exact DNS values
shown by Vercel, rather than guessing a CNAME target. Redeploy after changing
build settings, and confirm the deployment is promoted to production.

For the current deployment, the backend is on a separate public origin. Set
the Vercel Production environment variable to:

```text
NEXT_PUBLIC_API_BASE=https://chatapp.vorionsystems.com/api
```

The value must be the API origin plus `/api`, with no trailing slash. Do not
set it to the frontend's `*.vercel.app` URL or to an endpoint such as
`/auth/login`; the client appends `/auth/login` and `/auth/me` itself. Redeploy
after changing the variable because `NEXT_PUBLIC_*` values are inlined during
the Next.js build. When the backend is later exposed through the same
production domain, the variable may instead be omitted and the client will
use `/api`. The local fallback `http://localhost:3010/api` is used only during
development.

There is no checked-in Vercel project link or domain mapping. This document
records the required configuration; it does not prove the live project or
domain uses these settings. A successful build alone does not verify them.
