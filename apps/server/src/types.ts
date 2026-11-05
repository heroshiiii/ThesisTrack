import type { Request } from "express";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "student" | "adviser" | "admin";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type ProjectRecord = {
  id: string;
  title: string;
  course: string;
  adviser: string;
  adviserId?: string | null;
  adviserEmail?: string | null;
  ownerName?: string;
  progress: number;
  status: "In progress" | "Needs attention" | "Completed";
  dueDate: string;
  updatedAt: string;
};

export type MilestoneRecord = {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  dueDate: string;
  status: "Pending" | "In progress" | "Submitted" | "Approved";
};

export type AuthenticatedRequest = Request & { user: AuthUser };