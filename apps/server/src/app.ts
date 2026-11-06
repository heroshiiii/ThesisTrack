import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import express, { type NextFunction, type Request, type Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { errors, SignJWT, jwtVerify } from "jose";
import { Resend } from "resend";
import { z } from "zod";
import { BlobNotFoundError, del, get, head } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { getDatabase } from "./db.js";
import { getJwtSecret } from "./config.js";
import type { AuthUser, ProjectRecord } from "./types.js";
import { getStorageToken } from "./storage.js";

const app = express();
const cookieName = "thesistrack_session";
const sessionDuration = 14 * 24 * 60 * 60;
const resetTokenDurationMs = 30 * 60 * 1000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function publicUser(user: AuthUser) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function getCookie(req: Request, name: string) {
  const cookies = req.headers.cookie?.split(";") ?? [];
  const entry = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

async function setSession(res: Response, user: AuthUser) {
  const token = await new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${sessionDuration}s`)
    .sign(getJwtSecret());
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionDuration * 1000,
  });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getCookie(req, cookieName);
  if (!token) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  jwtVerify(token, getJwtSecret())
    .then(async ({ payload }) => {
      if (!payload.sub || typeof payload.name !== "string" || typeof payload.email !== "string") {
        res.status(401).json({ error: "Your session is invalid. Please sign in again." });
        return;
      }
      const sql = getDatabase();
      const rows = await sql`SELECT id, name, email, role FROM users WHERE id = ${payload.sub} LIMIT 1`;
      const currentUser = rows[0] as AuthUser | undefined;
      if (!currentUser) {
        res.status(401).json({ error: "Your account is no longer available. Please sign in again." });
        return;
      }
      const role = currentUser.role;
      if (role !== "student" && role !== "adviser" && role !== "admin") {
        res.status(401).json({ error: "Your session is invalid. Please sign in again." });
        return;
      }
      req.user = currentUser;
      next();
    })
    .catch((error: unknown) => {
      if (error instanceof errors.JOSEError) {
        res.status(401).json({ error: "Your session has expired. Please sign in again." });
        return;
      }
      next(error);
    });
}

function requireRole(...roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || (!roles.includes(req.user.role) && req.user.role !== "admin")) {
      res.status(403).json({ error: "You don't have permission to perform this action." });
      return;
    }
    next();
  };
}

async function findAccessibleProject(user: AuthUser, projectId: string) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT id, created_by AS "createdBy", adviser_id AS "adviserId"
    FROM projects
    WHERE id = ${projectId}
      AND (${user.role} = 'admin' OR created_by = ${user.id} OR adviser_id = ${user.id})
    LIMIT 1
  `;
  return rows[0] as { id: string; createdBy: string; adviserId: string | null } | undefined;
}

const uuidSchema = z.string().uuid();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
});
const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});
const resetPasswordSchema = z.object({
  token: z.string().min(40).max(100).regex(/^[A-Za-z0-9_-]+$/),
  password: z.string().min(8).max(72),
});
const projectSchema = z.object({
  title: z.string().trim().min(3).max(180),
  course: z.string().trim().min(2).max(120),
  adviser: z.string().trim().min(2).max(120),
  adviserEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  dueDate: z.string().date(),
});
const projectUpdateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  course: z.string().trim().min(2).max(120),
  adviser: z.string().trim().min(2).max(120),
  adviserEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  dueDate: z.string().date(),
});
const milestoneSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  dueDate: z.string().date(),
});
const milestoneUpdateSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  dueDate: z.string().date().optional(),
  status: z.enum(["Pending", "In progress", "Submitted", "Approved"]).optional(),
}).refine((value) => Object.keys(value).length > 0);
const submissionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  milestoneId: z.string().uuid().optional(),
  documentKey: z.string().min(1).max(500),
  documentName: z.string().trim().min(1).max(255),
});
const reviewSchema = z.object({
  status: z.enum(["Reviewed", "Revision Required", "Approved"]),
  feedback: z.string().trim().min(2).max(5000),
});
const uploadSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  size: z.number().int().positive().max(20 * 1024 * 1024),
}).superRefine((file, context) => {
  const extension = file.fileName.split(".").pop()?.toLowerCase();
  const validExtensions: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  if (!extension || validExtensions[extension] !== file.contentType) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["contentType"], message: "File extension and type must match." });
  }
});
const uploadClientPayloadSchema = z.string().transform((value, context) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "The upload details are invalid." });
    return z.NEVER;
  }
}).pipe(uploadSchema);

class ApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "ThesisTrack API" }));

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const input = registerSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a name, valid email, and password with at least 8 characters." });
    return;
  }
  getJwtSecret();
  const sql = getDatabase();
  const email = input.data.email.toLowerCase();
  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length) {
    res.status(409).json({ error: "An account with this email already exists. Try signing in." });
    return;
  }
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(input.data.password, 12);
  const rows = await sql`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (${id}, ${input.data.name}, ${email}, ${passwordHash}, 'student')
    RETURNING id, name, email, role
  `;
  const user = rows[0] as AuthUser;
  await setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const input = loginSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  getJwtSecret();
  const sql = getDatabase();
  const email = input.data.email.toLowerCase();
  const rows = await sql`SELECT id, name, email, role, password_hash FROM users WHERE email = ${email} LIMIT 1`;
  const account = rows[0] as (AuthUser & { password_hash: string }) | undefined;
  if (!account || !(await bcrypt.compare(input.data.password, account.password_hash))) {
    res.status(401).json({ error: "That email and password don't match. Please try again." });
    return;
  }
  const user = publicUser(account);
  await setSession(res, user);
  res.json({ user });
}));

app.post("/api/auth/forgot-password", asyncRoute(async (req, res) => {
  const input = forgotPasswordSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!apiKey || !emailFrom || !appBaseUrl) {
    throw new ApiError(503, "Password reset is temporarily unavailable. Please try again later.");
  }
  let resetUrl: URL;
  try {
    resetUrl = new URL("/", appBaseUrl);
  } catch {
    throw new ApiError(503, "Password reset is temporarily unavailable. Please try again later.");
  }
  if (process.env.NODE_ENV === "production" && resetUrl.protocol !== "https:") {
    throw new ApiError(503, "Password reset is temporarily unavailable. Please try again later.");
  }

  const sql = getDatabase();
  const email = input.data.email.toLowerCase();
  const users = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (users.length) {
    const userId = (users[0] as { id: string }).id;
    const recentRequests = await sql`
      SELECT 1
      FROM password_reset_tokens
      WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '1 minute'
      LIMIT 1
    `;
    if (recentRequests.length) {
      res.json({ message: "If an account exists for that email, a password reset link will be sent." });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + resetTokenDurationMs);
    await sql.transaction([
      sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId} AND used_at IS NULL`,
      sql`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES (${userId}, ${tokenHash}, ${expiresAt})`,
    ]);

    resetUrl.searchParams.set("reset", token);
    const resetLink = resetUrl.toString();
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: "Reset your ThesisTrack password",
      text: `We received a request to reset your ThesisTrack password. Use this link within 30 minutes: ${resetLink}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>We received a request to reset your ThesisTrack password.</p><p><a href="${resetLink}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this email.</p>`,
    });
    if (error) {
      console.error("Resend password reset email failed:", error);
      await sql`DELETE FROM password_reset_tokens WHERE token_hash = ${tokenHash} AND used_at IS NULL`;
      throw new ApiError(503, "Password reset is temporarily unavailable. Please try again later.");
    }
  }

  res.json({ message: "If an account exists for that email, a password reset link will be sent." });
}));

app.post("/api/auth/reset-password", asyncRoute(async (req, res) => {
  const input = resetPasswordSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "The reset link is invalid or has expired. Request a new one." });
    return;
  }

  const tokenHash = createHash("sha256").update(input.data.token).digest("hex");
  const passwordHash = await bcrypt.hash(input.data.password, 12);
  const sql = getDatabase();
  const rows = await sql`
    WITH consumed_token AS (
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id
    )
    UPDATE users
    SET password_hash = ${passwordHash}, updated_at = NOW()
    WHERE id = (SELECT user_id FROM consumed_token)
    RETURNING id
  `;
  if (!rows.length) {
    res.status(400).json({ error: "The reset link is invalid or has expired. Request a new one." });
    return;
  }

  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ message: "Your password has been reset. You can now sign in." });
}));

app.get("/api/auth/me", asyncRoute(async (req, res) => {
  const token = getCookie(req, cookieName);
  if (!token) {
    res.json({ user: null });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.email !== "string") {
      res.clearCookie(cookieName, { path: "/" });
      res.json({ user: null });
      return;
    }
    const sql = getDatabase();
    const rows = await sql`SELECT id, name, email, role FROM users WHERE id = ${payload.sub} LIMIT 1`;
    const currentUser = rows[0] as AuthUser | undefined;
    if (!currentUser) {
      res.clearCookie(cookieName, { path: "/" });
      res.json({ user: null });
      return;
    }
    const role = currentUser.role;
    if (role !== "student" && role !== "adviser" && role !== "admin") {
      res.clearCookie(cookieName, { path: "/" });
      res.json({ user: null });
      return;
    }
    res.json({ user: publicUser(currentUser) });
  } catch (error) {
    if (!(error instanceof errors.JOSEError)) throw error;
    res.clearCookie(cookieName, { path: "/" });
    res.json({ user: null });
  }
}));

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ ok: true });
});

app.get("/api/projects", requireAuth, asyncRoute(async (req, res) => {
  const sql = getDatabase();
  const rows = await sql`
    SELECT p.id, p.title, p.course, COALESCE(adviser_user.name, p.adviser) AS adviser,
           p.adviser_id AS "adviserId", adviser_user.email AS "adviserEmail",
           owner.name AS "ownerName", p.progress,
           CASE WHEN p.status <> 'Completed' AND (
             p.due_date < CURRENT_DATE OR EXISTS (
               SELECT 1 FROM milestones overdue
               WHERE overdue.project_id = p.id AND overdue.due_date < CURRENT_DATE AND overdue.status <> 'Approved'
             )
           ) THEN 'Needs attention' ELSE p.status END AS status,
           p.due_date::text AS "dueDate", p.updated_at::text AS "updatedAt"
    FROM projects p
    JOIN users owner ON owner.id = p.created_by
    LEFT JOIN users adviser_user ON adviser_user.id = p.adviser_id
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    ORDER BY p.updated_at DESC
  `;
  res.json({ projects: rows as ProjectRecord[] });
}));

app.post("/api/projects", requireAuth, requireRole("student"), asyncRoute(async (req, res) => {
  const input = projectSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Check the project details and try again." });
    return;
  }
  const sql = getDatabase();
  let adviserId: string | null = null;
  let adviserName = input.data.adviser;
  if (input.data.adviserEmail) {
    const adviserRows = await sql`
      SELECT id, name FROM users
      WHERE email = ${input.data.adviserEmail.toLowerCase()} AND role = 'adviser'
      LIMIT 1
    `;
    const adviser = adviserRows[0] as { id: string; name: string } | undefined;
    if (!adviser) {
      res.status(400).json({ error: "No adviser account was found with that email." });
      return;
    }
    adviserId = adviser.id;
    adviserName = adviser.name;
  }
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO projects (id, created_by, title, course, adviser, adviser_id, due_date)
    VALUES (${id}, ${req.user!.id}, ${input.data.title}, ${input.data.course}, ${adviserName}, ${adviserId}, ${input.data.dueDate})
    RETURNING id, title, course, adviser, adviser_id AS "adviserId", progress, status, due_date::text AS "dueDate",
              updated_at::text AS "updatedAt"
  `;
  res.status(201).json({ project: rows[0] as ProjectRecord });
}));

app.patch("/api/projects/:id", requireAuth, requireRole("student"), asyncRoute(async (req, res) => {
  const projectId = uuidSchema.safeParse(req.params.id);
  const input = projectUpdateSchema.safeParse(req.body);
  if (!projectId.success || !input.success) {
    res.status(400).json({ error: "Check the research project details and try again." });
    return;
  }
  const project = await findAccessibleProject(req.user!, projectId.data);
  if (!project || (req.user!.role !== "admin" && project.createdBy !== req.user!.id)) {
    res.status(404).json({ error: "That research project could not be found." });
    return;
  }
  const sql = getDatabase();
  let adviserId: string | null = null;
  let adviserName = input.data.adviser;
  if (input.data.adviserEmail) {
    const adviserRows = await sql`
      SELECT id, name FROM users
      WHERE email = ${input.data.adviserEmail.toLowerCase()} AND role = 'adviser'
      LIMIT 1
    `;
    const adviser = adviserRows[0] as { id: string; name: string } | undefined;
    if (!adviser) {
      res.status(400).json({ error: "No adviser account was found with that email." });
      return;
    }
    adviserId = adviser.id;
    adviserName = adviser.name;
  }
  const rows = await sql`
    UPDATE projects SET title = ${input.data.title}, course = ${input.data.course},
      adviser = ${adviserName}, adviser_id = ${adviserId},
      due_date = ${input.data.dueDate},
      status = CASE
        WHEN status = 'Completed' THEN status
        WHEN ${input.data.dueDate}::date < CURRENT_DATE OR EXISTS (
          SELECT 1 FROM milestones overdue
          WHERE overdue.project_id = projects.id AND overdue.due_date < CURRENT_DATE AND overdue.status <> 'Approved'
        ) THEN 'Needs attention'
        ELSE 'In progress'
      END,
      updated_at = NOW()
    WHERE id = ${projectId.data}
    RETURNING id, title, course, adviser, adviser_id AS "adviserId", progress, status,
              due_date::text AS "dueDate", updated_at::text AS "updatedAt"
  `;
  res.json({ project: rows[0] as ProjectRecord });
}));

app.delete("/api/projects/:id", requireAuth, requireRole("student"), asyncRoute(async (req, res) => {
  const projectId = uuidSchema.safeParse(req.params.id);
  if (!projectId.success) {
    res.status(400).json({ error: "That research project ID is invalid." });
    return;
  }
  const project = await findAccessibleProject(req.user!, projectId.data);
  if (!project || (req.user!.role !== "admin" && project.createdBy !== req.user!.id)) {
    res.status(404).json({ error: "That research project could not be found." });
    return;
  }
  const sql = getDatabase();
  const documentRows = await sql`
    SELECT document_key AS "documentKey"
    FROM submissions
    WHERE project_id = ${projectId.data} AND document_key IS NOT NULL
  `;
  const documentKeys = documentRows.map((row) => (row as { documentKey: string }).documentKey);
  const token = documentKeys.length ? getStorageToken() : null;
  await sql`DELETE FROM projects WHERE id = ${projectId.data}`;
  if (token) {
    try {
      await del(documentKeys, { token });
    } catch (error) {
      console.error("Project deleted, but document cleanup failed:", error);
      res.status(500).json({ error: "The project was deleted, but some attached documents could not be removed from storage. Contact your coordinator." });
      return;
    }
  }
  res.json({ ok: true });
}));

app.get("/api/dashboard", requireAuth, asyncRoute(async (req, res) => {
  const sql = getDatabase();
  const projectRows = await sql`
    SELECT p.id, p.title, p.course, COALESCE(adviser_user.name, p.adviser) AS adviser,
           p.adviser_id AS "adviserId", adviser_user.email AS "adviserEmail",
           owner.name AS "ownerName", p.progress,
           CASE WHEN p.status <> 'Completed' AND (
             p.due_date < CURRENT_DATE OR EXISTS (
               SELECT 1 FROM milestones overdue
               WHERE overdue.project_id = p.id AND overdue.due_date < CURRENT_DATE AND overdue.status <> 'Approved'
             )
           ) THEN 'Needs attention' ELSE p.status END AS status,
           p.due_date::text AS "dueDate", p.updated_at::text AS "updatedAt"
    FROM projects p
    JOIN users owner ON owner.id = p.created_by
    LEFT JOIN users adviser_user ON adviser_user.id = p.adviser_id
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    ORDER BY p.updated_at DESC
  `;
  const milestoneRows = await sql`
    SELECT m.id, m.project_id AS "projectId", p.title AS "projectTitle",
           m.title, m.due_date::text AS "dueDate", m.status
    FROM milestones m
    JOIN projects p ON p.id = m.project_id
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
      AND m.status <> 'Approved'
      AND m.due_date >= CURRENT_DATE
    ORDER BY m.due_date ASC
    LIMIT 12
  `;
  const submissionRows = await sql`
    SELECT s.id, s.project_id AS "projectId", p.title AS "projectTitle",
           s.title, s.document_name AS "documentName", s.status,
           s.submitted_at::text AS "submittedAt", owner.name AS "studentName",
           (SELECT f.body FROM feedback f WHERE f.submission_id = s.id ORDER BY f.created_at DESC LIMIT 1) AS feedback
    FROM submissions s
    JOIN projects p ON p.id = s.project_id
    JOIN users owner ON owner.id = p.created_by
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    ORDER BY s.submitted_at DESC
    LIMIT 30
  `;
  const milestoneStatsRows = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE m.status = 'Approved')::int AS complete,
           COUNT(*) FILTER (WHERE m.status <> 'Approved' AND m.due_date >= CURRENT_DATE)::int AS upcoming
    FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
  `;
  const milestoneStats = milestoneStatsRows[0] as { total: number; complete: number; upcoming: number };
  const activityRows = await sql`
    SELECT COUNT(DISTINCT f.id)::int AS "feedbackCount",
           COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'Pending')::int AS "pendingReviews",
           COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'Revision Required')::int AS "revisionRequests"
    FROM submissions s
    JOIN projects p ON p.id = s.project_id
    LEFT JOIN feedback f ON f.submission_id = s.id
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
  `;
  const activity = activityRows[0] as { feedbackCount: number; pendingReviews: number; revisionRequests: number };
  res.json({
    projects: projectRows as ProjectRecord[],
    milestones: milestoneRows,
    submissions: submissionRows,
    milestoneStats: {
      total: Number(milestoneStats.total),
      complete: Number(milestoneStats.complete),
      upcoming: Number(milestoneStats.upcoming),
    },
    feedbackCount: Number(activity.feedbackCount),
    pendingReviews: req.user!.role === "student"
      ? Number(activity.revisionRequests)
      : Number(activity.pendingReviews),
  });
}));

app.get("/api/advisers", requireAuth, asyncRoute(async (_req, res) => {
  const sql = getDatabase();
  const rows = await sql`SELECT id, name, email FROM users WHERE role = 'adviser' ORDER BY name`;
  res.json({ advisers: rows });
}));

app.get("/api/admin/users", requireAuth, requireRole("admin"), asyncRoute(async (_req, res) => {
  const sql = getDatabase();
  const users = await sql`
    SELECT id, name, email, role, created_at::text AS "createdAt"
    FROM users ORDER BY created_at DESC LIMIT 500
  `;
  res.json({ users });
}));

app.patch("/api/admin/users/:id/role", requireAuth, requireRole("admin"), asyncRoute(async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  const input = z.object({ role: z.enum(["student", "adviser", "admin"]) }).safeParse(req.body);
  if (!id.success || !input.success) {
    res.status(400).json({ error: "Select a valid account and role." });
    return;
  }
  if (id.data === req.user!.id && input.data.role !== "admin") {
    res.status(400).json({ error: "You can't remove your own administrator access." });
    return;
  }
  const sql = getDatabase();
  const rows = await sql`
    UPDATE users SET role = ${input.data.role}, updated_at = NOW()
    WHERE id = ${id.data}
    RETURNING id, name, email, role, created_at::text AS "createdAt"
  `;
  if (!rows.length) {
    res.status(404).json({ error: "That account could not be found." });
    return;
  }
  res.json({ user: rows[0] });
}));

async function refreshProjectProgress(projectId: string) {
  const sql = getDatabase();
  const rows = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'Approved')::int AS approved,
           ROUND(AVG(CASE status
             WHEN 'Approved' THEN 100
             WHEN 'Submitted' THEN 75
             WHEN 'In progress' THEN 50
             ELSE 0
           END))::int AS progress,
           BOOL_OR(due_date < CURRENT_DATE AND status <> 'Approved') AS overdue
    FROM milestones WHERE project_id = ${projectId}
  `;
  const counts = rows[0] as { total: number; approved: number; progress: number | null; overdue: boolean };
  const total = Number(counts.total);
  const approved = Number(counts.approved);
  const progress = total ? Number(counts.progress) : 0;
  const status = total > 0 && approved === total ? "Completed" : counts.overdue ? "Needs attention" : "In progress";
  await sql`UPDATE projects SET progress = ${progress}, status = ${status}, updated_at = NOW() WHERE id = ${projectId}`;
}

app.get("/api/milestones", requireAuth, asyncRoute(async (req, res) => {
  const sql = getDatabase();
  const rows = await sql`
    SELECT m.id, m.project_id AS "projectId", p.title AS "projectTitle",
           m.title, m.due_date::text AS "dueDate", m.status
    FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    ORDER BY m.due_date ASC
  `;
  res.json({ milestones: rows });
}));

app.post("/api/milestones", requireAuth, requireRole("student"), asyncRoute(async (req, res) => {
  const input = milestoneSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Enter a milestone title, project, and due date." });
    return;
  }
  const project = await findAccessibleProject(req.user!, input.data.projectId);
  if (!project || project.createdBy !== req.user!.id) {
    res.status(404).json({ error: "That research project could not be found." });
    return;
  }
  const sql = getDatabase();
  const rows = await sql`
    INSERT INTO milestones (project_id, title, due_date)
    VALUES (${project.id}, ${input.data.title}, ${input.data.dueDate})
    RETURNING id, project_id AS "projectId", title, due_date::text AS "dueDate", status
  `;
  await refreshProjectProgress(project.id);
  res.status(201).json({ milestone: rows[0] });
}));

app.patch("/api/milestones/:id", requireAuth, asyncRoute(async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  const input = milestoneUpdateSchema.safeParse(req.body);
  if (!id.success || !input.success) {
    res.status(400).json({ error: "Check the milestone details and try again." });
    return;
  }
  const sql = getDatabase();
  const matches = await sql`
    SELECT m.id, m.project_id AS "projectId", p.created_by AS "createdBy"
    FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE m.id = ${id.data}
      AND (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    LIMIT 1
  `;
  const milestone = matches[0] as { id: string; projectId: string; createdBy: string } | undefined;
  if (!milestone) {
    res.status(404).json({ error: "That milestone could not be found." });
    return;
  }
  if (req.user!.role === "adviser" && ("title" in input.data || "dueDate" in input.data)) {
    res.status(403).json({ error: "Advisers can update milestone review status, not student deadlines." });
    return;
  }
  if (req.user!.role === "student" && input.data.status === "Approved") {
    res.status(403).json({ error: "Only an adviser can approve a milestone." });
    return;
  }
  const updated = await sql`
    UPDATE milestones SET
      title = COALESCE(${input.data.title ?? null}, title),
      due_date = COALESCE(${input.data.dueDate ?? null}::date, due_date),
      status = COALESCE(${input.data.status ?? null}, status)
    WHERE id = ${id.data}
    RETURNING id, project_id AS "projectId", title, due_date::text AS "dueDate", status
  `;
  await refreshProjectProgress(milestone.projectId);
  res.json({ milestone: updated[0] });
}));

app.delete("/api/milestones/:id", requireAuth, asyncRoute(async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "That milestone ID is invalid." });
    return;
  }
  const sql = getDatabase();
  const rows = await sql`
    SELECT m.project_id AS "projectId", p.created_by AS "createdBy"
    FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE m.id = ${id.data}
      AND (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id})
    LIMIT 1
  `;
  const milestone = rows[0] as { projectId: string; createdBy: string } | undefined;
  if (!milestone) {
    res.status(404).json({ error: "That milestone could not be found." });
    return;
  }
  await sql`DELETE FROM milestones WHERE id = ${id.data}`;
  await refreshProjectProgress(milestone.projectId);
  res.json({ ok: true });
}));

app.post("/api/uploads", (req, res, next) => {
  if (req.body?.type === "blob.upload-completed") {
    next();
    return;
  }
  requireAuth(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }
    requireRole("student")(req, res, next);
  });
}, asyncRoute(async (req, res) => {
  const body = req.body as { type?: string; payload?: { pathname?: string; clientPayload?: string | null } };
  if (body.type === "blob.generate-client-token" && !req.user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const result = await handleUpload({
    request: req,
    body: req.body,
    token: getStorageToken(),
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const input = uploadClientPayloadSchema.safeParse(clientPayload);
      if (!input.success) {
        throw new ApiError(400, "Choose a PDF, DOC, or DOCX file up to 20 MB.");
      }

      const project = await findAccessibleProject(req.user!, input.data.projectId);
      if (!project || project.createdBy !== req.user!.id) {
        throw new ApiError(404, "That research project could not be found.");
      }
      const extension = input.data.fileName.split(".").pop()?.toLowerCase();
      const expectedExtension = {
        "application/pdf": "pdf",
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      }[input.data.contentType];
      if (extension !== expectedExtension || !new RegExp(`^${project.id}/[0-9a-f-]{36}\\.${expectedExtension}$`, "i").test(pathname)) {
        throw new ApiError(400, "The document path is invalid.");
      }

      return {
        allowedContentTypes: [input.data.contentType],
        maximumSizeInBytes: input.data.size,
        addRandomSuffix: false,
        allowOverwrite: false,
      };
    },
  });
  res.json(result);
}));

app.post("/api/projects/:id/submissions", requireAuth, requireRole("student"), asyncRoute(async (req, res) => {
  const projectId = uuidSchema.safeParse(req.params.id);
  const input = submissionSchema.safeParse(req.body);
  if (!projectId.success || !input.success) {
    res.status(400).json({ error: "Provide a title and upload a document before submitting." });
    return;
  }
  const project = await findAccessibleProject(req.user!, projectId.data);
  if (!project || project.createdBy !== req.user!.id) {
    res.status(404).json({ error: "That research project could not be found." });
    return;
  }
  if (!input.data.documentKey.startsWith(`${project.id}/`)) {
    res.status(400).json({ error: "The document does not belong to this research project." });
    return;
  }
  try {
    const blob = await head(input.data.documentKey, { token: getStorageToken() });
    if (blob.size > 20 * 1024 * 1024) {
      res.status(400).json({ error: "Choose a PDF, DOC, or DOCX file up to 20 MB." });
      return;
    }
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      res.status(400).json({ error: "Upload the document before submitting it." });
      return;
    }
    throw error;
  }
  const sql = getDatabase();
  if (input.data.milestoneId) {
    const milestone = await sql`SELECT id FROM milestones WHERE id = ${input.data.milestoneId} AND project_id = ${project.id} LIMIT 1`;
    if (!milestone.length) {
      res.status(400).json({ error: "Choose a milestone from this research project." });
      return;
    }
  }
  const rows = await sql`
    INSERT INTO submissions (project_id, milestone_id, title, document_key, document_name)
    VALUES (${project.id}, ${input.data.milestoneId ?? null}, ${input.data.title}, ${input.data.documentKey}, ${input.data.documentName})
    RETURNING id, project_id AS "projectId", milestone_id AS "milestoneId",
              title, document_name AS "documentName", status, submitted_at::text AS "submittedAt"
  `;
  if (input.data.milestoneId) {
    await sql`UPDATE milestones SET status = 'Submitted' WHERE id = ${input.data.milestoneId} AND status <> 'Approved'`;
    await refreshProjectProgress(project.id);
  }
  res.status(201).json({ submission: rows[0] });
}));

app.get("/api/submissions", requireAuth, asyncRoute(async (req, res) => {
  const sql = getDatabase();
  const rows = await sql`
    SELECT s.id, s.project_id AS "projectId", s.milestone_id AS "milestoneId",
           p.title AS "projectTitle", s.title, s.document_name AS "documentName",
           s.status, s.submitted_at::text AS "submittedAt", owner.name AS "studentName",
           (SELECT f.body FROM feedback f WHERE f.submission_id = s.id ORDER BY f.created_at DESC LIMIT 1) AS feedback
    FROM submissions s JOIN projects p ON p.id = s.project_id
    JOIN users owner ON owner.id = p.created_by
    WHERE (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    ORDER BY s.submitted_at DESC
  `;
  res.json({ submissions: rows });
}));

app.post("/api/submissions/:id/review", requireAuth, requireRole("adviser"), asyncRoute(async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  const input = reviewSchema.safeParse(req.body);
  if (!id.success || !input.success) {
    res.status(400).json({ error: "Choose a review status and enter feedback." });
    return;
  }
  const sql = getDatabase();
  const rows = await sql`
    SELECT s.project_id AS "projectId", s.milestone_id AS "milestoneId"
    FROM submissions s JOIN projects p ON p.id = s.project_id
    WHERE s.id = ${id.data} AND (${req.user!.role} = 'admin' OR p.adviser_id = ${req.user!.id})
    LIMIT 1
  `;
  const submission = rows[0] as { projectId: string; milestoneId: string | null } | undefined;
  if (!submission) {
    res.status(404).json({ error: "That assigned submission could not be found." });
    return;
  }
  const reviewCommands = [
    sql`UPDATE submissions SET status = ${input.data.status}, reviewed_at = NOW() WHERE id = ${id.data}`,
    sql`INSERT INTO feedback (submission_id, adviser_id, body) VALUES (${id.data}, ${req.user!.id}, ${input.data.feedback})`,
  ];
  if (submission.milestoneId && input.data.status === "Approved") {
    reviewCommands.push(sql`UPDATE milestones SET status = 'Approved' WHERE id = ${submission.milestoneId}`);
  } else if (submission.milestoneId && input.data.status === "Revision Required") {
    reviewCommands.push(sql`UPDATE milestones SET status = 'In progress' WHERE id = ${submission.milestoneId}`);
  }
  await sql.transaction(reviewCommands);
  if (submission.milestoneId) await refreshProjectProgress(submission.projectId);
  res.json({ ok: true });
}));

app.get("/api/submissions/:id/download", requireAuth, asyncRoute(async (req, res) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "That submission ID is invalid." });
    return;
  }
  const sql = getDatabase();
  const rows = await sql`
    SELECT s.document_key AS "documentKey", s.document_name AS "documentName"
    FROM submissions s JOIN projects p ON p.id = s.project_id
    WHERE s.id = ${id.data}
      AND (${req.user!.role} = 'admin' OR p.created_by = ${req.user!.id} OR p.adviser_id = ${req.user!.id})
    LIMIT 1
  `;
  const document = rows[0] as { documentKey: string | null; documentName: string | null } | undefined;
  if (!document?.documentKey) {
    res.status(404).json({ error: "That document could not be found." });
    return;
  }
  const blob = await get(document.documentKey, { access: "private", token: getStorageToken() });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    res.status(404).json({ error: "That document could not be found." });
    return;
  }
  const fileName = (document.documentName ?? "research-document").replace(/["\\\r\n]/g, "_");
  res.setHeader("Content-Type", blob.blob.contentType || "application/octet-stream");
  res.setHeader("Content-Length", blob.blob.size);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  await pipeline(Readable.from(blob.stream), res);
}));

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  console.error("ThesisTrack API request failed:", error);
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof Error && (
    error.message.startsWith("DATABASE_URL is not configured.")
    || error.message.startsWith("JWT_SECRET must be set")
    || error.message.startsWith("Document storage is not configured.")
  )) {
    res.status(503).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "The submitted information is invalid." });
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Something went wrong on the server. Please try again." });
});

export default app;
