export type ProjectStatus = "In progress" | "Needs attention" | "Completed";

export type Project = {
  id: string;
  title: string;
  course: string;
  adviser: string;
  adviserId?: string | null;
  adviserEmail?: string | null;
  ownerName?: string;
  progress: number;
  status: ProjectStatus;
  dueDate: string;
  updatedAt?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: "student" | "adviser" | "admin";
};

export type MilestoneStatus = "Pending" | "In progress" | "Submitted" | "Approved";
export type Milestone = {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  dueDate: string;
  status: MilestoneStatus;
};

export type Submission = {
  id: string;
  projectId: string;
  milestoneId: string | null;
  projectTitle: string;
  title: string;
  documentName: string | null;
  status: "Pending" | "Reviewed" | "Revision Required" | "Approved";
  submittedAt: string;
  studentName: string;
  feedback: string | null;
};

export type Adviser = Pick<User, "id" | "name" | "email">;
export type Dashboard = {
  projects: Project[];
  milestones: Milestone[];
  submissions: Submission[];
  milestoneStats: { total: number; complete: number; upcoming: number };
  feedbackCount: number;
  pendingReviews: number;
};