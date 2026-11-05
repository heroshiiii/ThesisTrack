# ThesisTrack

A responsive thesis and research progress workspace for students and advisers. The frontend is React + TypeScript + Vite; the API is Express on Vercel Functions; PostgreSQL is accessed through Neon’s serverless driver.

## Run locally

Requirements: Node.js 20+, Docker Desktop (or a PostgreSQL 16 database), and a private Vercel Blob store for document uploads.

1. Copy `.env.example` to `.env`. Set `JWT_SECRET` to a unique random value of at least 32 characters and set `BLOB_READ_WRITE_TOKEN` from your Vercel Blob store.
2. Start the local database with `docker compose up -d database`. The schema is applied automatically on the first start.
3. Run `npm install`, then `npm run dev`.
4. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

The demo dashboard can be viewed without an account. Create an account and sign in to save projects to the database.

## Deploy to Vercel

1. Create a PostgreSQL database with [Neon](https://neon.tech/) and run [`database/schema.sql`](./database/schema.sql) in its SQL editor. The schema is safe to re-run and adds the adviser and document-name columns to earlier installs.
2. Import this repository into Vercel. The included `vercel.json` builds the Vite frontend, and the catch-all function in `api/` serves `/api/*`.
3. Create a private Blob store in the Vercel dashboard and connect it to your project. Add `DATABASE_URL`, `JWT_SECRET`, and `BLOB_READ_WRITE_TOKEN` under Vercel **Project Settings → Environment Variables** for each deployment environment. For local development, use the store's read-write token from Vercel and never commit it.
4. Documents upload directly from the browser to the private Blob store using short-lived, project-scoped upload tokens. Downloads are streamed through the authenticated API; no public document URLs or bucket CORS configuration are needed.
5. Deploy. Use a fresh, private `JWT_SECRET` and never commit `.env` files.

### Set up coordinator and adviser accounts

Public registration creates student accounts only. After registering your own account, promote it to coordinator once in the Neon SQL editor:

```sql
UPDATE users SET role = 'admin' WHERE email = 'your-coordinator@school.edu.ph';
```

Sign out and back in to refresh the session. Coordinators can promote registered accounts to adviser or coordinator in **People & access**. Students can assign a project to an existing adviser by entering the adviser's account email. Role changes take effect on the next request.

## API

- `GET /api/health` — API health check
- `POST /api/auth/register` and `POST /api/auth/login` — create an account or start a session
- `GET /api/auth/me` and `POST /api/auth/logout` — retrieve or end the current session
- `GET /api/projects` — list the signed-in user's projects
- `POST /api/projects` and `PATCH`/`DELETE /api/projects/:id` — manage a research project
- `GET /api/dashboard` — role-scoped dashboard data and progress summaries
- `GET`, `POST`, `PATCH`, and `DELETE /api/milestones` — manage deadlines and chapter milestones
- `POST /api/uploads` — authorize direct private Blob uploads
- `POST /api/projects/:id/submissions` and `GET /api/submissions` — submit and list research work
- `POST /api/submissions/:id/review` — adviser review and feedback
- `GET /api/submissions/:id/download` — stream a private document to an authorized user
- `GET /api/admin/users` and `PATCH /api/admin/users/:id/role` — coordinator account management

Document uploads accept PDF, DOC, or DOCX files up to 20 MB and are stored privately in Vercel Blob.

The schema also includes milestones, submissions, and adviser feedback tables for the planned workflow.