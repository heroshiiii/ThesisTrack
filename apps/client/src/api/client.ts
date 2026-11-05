import { upload } from "@vercel/blob/client";
import type { Adviser, Dashboard, Milestone, MilestoneStatus, Project, Submission, User } from "../types";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return body;
}

export const api = {
  me: () => request<{ user: User | null }>("/auth/me"),
  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  projects: () => request<{ projects: Project[] }>("/projects"),
  dashboard: () => request<Dashboard>("/dashboard"),
  advisers: () => request<{ advisers: Adviser[] }>("/advisers"),
  createProject: (project: Pick<Project, "title" | "course" | "adviser" | "adviserEmail" | "dueDate">) =>
    request<{ project: Project }>("/projects", {
      method: "POST",
      body: JSON.stringify(project),
    }),
  updateProject: (id: string, project: Pick<Project, "title" | "course" | "adviser" | "adviserEmail" | "dueDate">) =>
    request<{ project: Project }>(`/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(project),
    }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  milestones: () => request<{ milestones: Milestone[] }>("/milestones"),
  createMilestone: (milestone: Pick<Milestone, "projectId" | "title" | "dueDate">) =>
    request<{ milestone: Milestone }>("/milestones", {
      method: "POST",
      body: JSON.stringify(milestone),
    }),
  updateMilestone: (id: string, changes: { title?: string; dueDate?: string; status?: MilestoneStatus }) =>
    request<{ milestone: Milestone }>(`/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  deleteMilestone: (id: string) => request<{ ok: boolean }>(`/milestones/${id}`, { method: "DELETE" }),
  submissions: () => request<{ submissions: Submission[] }>("/submissions"),
  uploadDocument: async (projectId: string, file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const contentType = file.type || ({
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    } as Record<string, string>)[extension ?? ""] || "";
    const pathname = `${projectId}/${crypto.randomUUID()}.${extension}`;
    const blob = await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/uploads",
      clientPayload: JSON.stringify({ projectId, fileName: file.name, contentType, size: file.size }),
      contentType,
    });
    return blob.pathname;
  },
  createSubmission: (projectId: string, submission: { title: string; milestoneId?: string; documentKey: string; documentName: string }) =>
    request<{ submission: Submission }>(`/projects/${projectId}/submissions`, {
      method: "POST",
      body: JSON.stringify(submission),
    }),
  reviewSubmission: (id: string, review: { status: "Reviewed" | "Revision Required" | "Approved"; feedback: string }) =>
    request<{ ok: boolean }>(`/submissions/${id}/review`, {
      method: "POST",
      body: JSON.stringify(review),
    }),
  downloadSubmission: async (id: string) => {
    window.location.assign(`/api/submissions/${id}/download`);
  },
  adminUsers: () => request<{ users: Array<User & { createdAt: string }> }>("/admin/users"),
  updateUserRole: (id: string, role: User["role"]) =>
    request<{ user: User & { createdAt: string } }>(`/admin/users/${id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
};