# Vercel frontend deployment

The repository root is an npm workspace that builds the Next.js application
from `admin/`. Configure the Vercel project as follows:

| Setting | Value |
| --- | --- |
| Root Directory | repository root (`.`) |
| Framework Preset | Next.js |
| Install Command | Default (`npm install` or lockfile-based install) |
| Build Command | `npm run build` (also set in root `vercel.json`) |
| Output Directory | `admin/.next` (also set in root `vercel.json`) |

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

Set `NEXT_PUBLIC_API_BASE` to the deployed HTTPS backend URL including `/api`
before building. The local fallback `http://localhost:3010/api` cannot reach
your backend from visitors' browsers. This affects API requests after page
load, not Vercel's platform-level `NOT_FOUND` response.

There is no checked-in Vercel project link or domain mapping. This document
records the required configuration; it does not prove the live project or
domain uses these settings. A successful build alone does not verify them.
