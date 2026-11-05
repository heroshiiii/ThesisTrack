import { useEffect, useState, type FormEvent } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { useDialogAccessibility } from "./useDialogAccessibility";
import type { Dashboard, Milestone, Project, Submission, User } from "../types";

type Props = {
  section: string;
  user: User;
  projects: Project[];
  dashboard: Dashboard | null;
  onRefresh: () => Promise<void>;
  onToast: (message: string) => void;
};

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function dateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="workflow-heading"><div><div className="panel-kicker">{eyebrow}</div><h2>{title}</h2></div>{action}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="workflow-empty">{children}</div>;
}

export default function ResearchWorkspace({ section, user, projects, dashboard, onRefresh, onToast }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [users, setUsers] = useState<Array<User & { createdAt: string }>>([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [submissionProjectId, setSubmissionProjectId] = useState("");
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogOpen = showMilestoneForm || showSubmissionForm || Boolean(editing);
  useDialogAccessibility(dialogOpen, () => {
    setShowMilestoneForm(false);
    setShowSubmissionForm(false);
    setEditing(null);
  });

  async function loadWorkspace() {
    setError("");
    try {
      if (section === "Milestones") {
        const result = await api.milestones();
        setMilestones(result.milestones);
      }
      if (section === "Submissions" && user.role === "student") {
        const result = await api.milestones();
        setMilestones(result.milestones);
      }
      if (section === "Submissions" || section === "Feedback" || section === "Review queue") {
        const result = await api.submissions();
        setSubmissions(result.submissions);
      }
      if (section === "Users") {
        const result = await api.adminUsers();
        setUsers(result.users);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't load this workspace.");
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [section, user.role]);

  async function saveMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api.createMilestone({
        projectId: String(form.get("projectId")),
        title: String(form.get("title")).trim(),
        dueDate: String(form.get("dueDate")),
      });
      setShowMilestoneForm(false);
      await Promise.all([loadWorkspace(), onRefresh()]);
      onToast("Milestone added to your plan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't save the milestone.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api.updateMilestone(editing.id, {
        title: String(form.get("title")).trim(),
        dueDate: String(form.get("dueDate")),
      });
      setEditing(null);
      await Promise.all([loadWorkspace(), onRefresh()]);
      onToast("Milestone updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't update the milestone.");
    } finally {
      setBusy(false);
    }
  }

  async function changeMilestoneStatus(milestone: Milestone, status: Milestone["status"]) {
    setError("");
    try {
      await api.updateMilestone(milestone.id, { status });
      await Promise.all([loadWorkspace(), onRefresh()]);
      onToast("Milestone status updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't update the milestone.");
    }
  }

  async function removeMilestone(milestone: Milestone) {
    if (!window.confirm(`Delete "${milestone.title}"?`)) return;
    setError("");
    try {
      await api.deleteMilestone(milestone.id);
      await Promise.all([loadWorkspace(), onRefresh()]);
      onToast("Milestone deleted.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't delete the milestone.");
    }
  }

  async function saveSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const projectId = String(form.get("projectId"));
    const title = String(form.get("title")).trim();
    const milestoneId = String(form.get("milestoneId") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a PDF, DOC, or DOCX file before submitting.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Files must be 20 MB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const documentKey = await api.uploadDocument(projectId, file);
      await api.createSubmission(projectId, {
        title,
        ...(milestoneId ? { milestoneId } : {}),
        documentKey,
        documentName: file.name,
      });
      setShowSubmissionForm(false);
      await Promise.all([loadWorkspace(), onRefresh()]);
      onToast("Your document has been submitted for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't submit this document.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewSubmission(event: FormEvent<HTMLFormElement>, submission: Submission) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api.reviewSubmission(submission.id, {
        status: String(form.get("status")) as "Reviewed" | "Revision Required" | "Approved",
        feedback: String(form.get("feedback")).trim(),
      });
      await Promise.all([loadWorkspace(), onRefresh()]);
      onToast("Review and feedback sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't save this review.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(id: string, role: User["role"]) {
    setError("");
    try {
      await api.updateUserRole(id, role);
      const result = await api.adminUsers();
      setUsers(result.users);
      onToast("Account role updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't update the account.");
    }
  }

  async function download(submission: Submission) {
    try {
      await api.downloadSubmission(submission.id);
    } catch (reason) {
      onToast(reason instanceof Error ? reason.message : "Couldn't download the document.");
    }
  }

  const canEditMilestones = user.role === "student" || user.role === "admin";
  const sectionTitle: Record<string, string> = {
    Milestones: "Milestones & deadlines",
    Submissions: "Research submissions",
    Feedback: "Adviser feedback",
    "Review queue": "Review queue",
    Users: "People & access",
  };
  const visibleMilestones = section === "Milestones" ? milestones : dashboard?.milestones ?? [];
  const visibleSubmissions = submissions;

  return (
    <section className="workflow-panel panel" aria-labelledby="workflow-title">
      <PanelHeading
        eyebrow={user.role === "adviser" ? "ADVISER WORKSPACE" : user.role === "admin" ? "COORDINATOR WORKSPACE" : "RESEARCH WORKSPACE"}
        title={sectionTitle[section] ?? section}
        action={section === "Milestones" && canEditMilestones
          ? <button className="primary-button compact-button" onClick={() => { setError(""); setShowMilestoneForm(true); }}>Add milestone</button>
          : section === "Submissions" && user.role === "student"
            ? <button className="primary-button compact-button" onClick={() => { setError(""); setSubmissionProjectId(projects[0]?.id ?? ""); setShowSubmissionForm(true); }}>Submit work</button>
            : undefined}
      />
      {error && <div className="workflow-error" role="alert">{error}</div>}

      {section === "Milestones" && (
        <div className="workflow-list">
          {visibleMilestones.map((milestone) => (
            <article className="workflow-row" key={milestone.id}>
              <div className="workflow-date"><strong>{new Date(`${milestone.dueDate}T00:00:00`).toLocaleDateString("en-PH", { day: "2-digit" })}</strong><span>{new Date(`${milestone.dueDate}T00:00:00`).toLocaleDateString("en-PH", { month: "short" }).toUpperCase()}</span></div>
              <div className="workflow-row-main"><strong>{milestone.title}</strong><span>{milestone.projectTitle} · Due {dateLabel(milestone.dueDate)}</span></div>
              <label className="status-control"><span className="sr-only">Status for {milestone.title}</span><select value={milestone.status} onChange={(event) => void changeMilestoneStatus(milestone, event.target.value as Milestone["status"])} aria-label={`Status for ${milestone.title}`}>
                {(user.role === "adviser" ? ["Submitted", "In progress", "Approved"] : ["Pending", "In progress", "Submitted", "Approved"]).map((status) => <option key={status}>{status}</option>)}
              </select></label>
              {canEditMilestones && <div className="workflow-actions"><button className="small-action" onClick={() => setEditing(milestone)}>Edit</button><button className="small-action danger-action" onClick={() => void removeMilestone(milestone)}>Delete</button></div>}
            </article>
          ))}
          {!visibleMilestones.length && <Empty>{projects.length ? "No milestones yet. Add your first deadline to plan the next step." : "Create a research project before adding milestones."}</Empty>}
        </div>
      )}

      {(section === "Submissions" || section === "Feedback" || section === "Review queue") && (
        <div className="submission-list">
          {visibleSubmissions.filter((submission) => {
            if (section === "Review queue") return submission.status === "Pending";
            if (section === "Feedback") return user.role === "student" ? Boolean(submission.feedback) : submission.status !== "Pending";
            return true;
          }).map((submission) => (
            <article className="submission-card" key={submission.id}>
              <div className="submission-card-head">
                <div><span className={`submission-status status-${submission.status.toLowerCase().replace(/ /g, "-")}`}>{submission.status}</span><h3>{submission.title}</h3><p>{submission.projectTitle}{user.role !== "student" ? ` · ${submission.studentName}` : ""} · {dateLabel(submission.submittedAt.slice(0, 10))}</p></div>
                <button className="small-action" onClick={() => void download(submission)} disabled={!submission.documentName}>Download {submission.documentName ? `· ${submission.documentName}` : ""}</button>
              </div>
              {submission.feedback && <div className="feedback-note"><strong>Latest adviser feedback</strong><p>{submission.feedback}</p></div>}
              {(user.role === "adviser" || user.role === "admin") && (
                <form className="review-form" onSubmit={(event) => void reviewSubmission(event, submission)}>
                  <label>Review status<select name="status" defaultValue={submission.status === "Pending" ? "Reviewed" : submission.status}><option>Reviewed</option><option>Revision Required</option><option>Approved</option></select></label>
                  <label>Feedback<textarea name="feedback" required minLength={2} maxLength={5000} placeholder="Share clear, actionable feedback for the student." /></label>
                  <button className="primary-button compact-button" disabled={busy}>Send review</button>
                </form>
              )}
            </article>
          ))}
          {!visibleSubmissions.length && <Empty>{section === "Review queue" ? "No submissions are waiting for review." : section === "Feedback" ? "Adviser feedback will appear here after a submission is reviewed." : "No submissions yet. Upload a research document when you're ready."}</Empty>}
        </div>
      )}

      {section === "Users" && (
        <div className="users-table-wrap">
          <table className="users-table">
            <caption className="sr-only">ThesisTrack accounts and assigned roles</caption>
            <thead><tr><th scope="col">Account</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Joined</th></tr></thead>
            <tbody>{users.map((account) => <tr key={account.id}><td>{account.name}{account.id === user.id ? " (you)" : ""}</td><td>{account.email}</td><td><label><span className="sr-only">Role for {account.name}</span><select aria-label={`Role for ${account.name}`} value={account.role} disabled={account.id === user.id} onChange={(event) => void updateRole(account.id, event.target.value as User["role"])}><option value="student">Student</option><option value="adviser">Adviser</option><option value="admin">Coordinator</option></select></label></td><td>{dateLabel(account.createdAt.slice(0, 10))}</td></tr>)}</tbody>
          </table>
          {!users.length && <Empty>No accounts found.</Empty>}
        </div>
      )}

      {(showMilestoneForm || editing || showSubmissionForm) && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setShowMilestoneForm(false); setShowSubmissionForm(false); setEditing(null); } }}>
          <section className="modal-card workflow-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-modal-title">
            <button className="modal-close icon-button" onClick={() => { setShowMilestoneForm(false); setShowSubmissionForm(false); setEditing(null); }} aria-label="Close dialog">×</button>
            <div className="modal-eyebrow">{showSubmissionForm ? "SHARE YOUR PROGRESS" : "PLAN YOUR NEXT STEP"}</div>
            <h2 id="workflow-modal-title">{showSubmissionForm ? "Submit research work" : editing ? "Edit milestone" : "Add a milestone"}</h2>
            {error && <div className="form-error" role="alert">{error}</div>}
            {showSubmissionForm ? <form className="form-stack" onSubmit={(event) => void saveSubmission(event)}>
              <label>Research project<select name="projectId" required value={submissionProjectId} onChange={(event) => setSubmissionProjectId(event.target.value)}><option value="" disabled>Select a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
              <label>Milestone (optional)<select name="milestoneId" defaultValue=""><option value="">General submission</option>{milestones.filter((milestone) => milestone.projectId === submissionProjectId).map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}</select></label>
              <label>Submission title<input name="title" required minLength={2} maxLength={180} placeholder="e.g. Chapter 2 — Review of Related Literature" /></label>
              <label>Research document<input name="file" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /><span className="field-hint">PDF, DOC, or DOCX · 20 MB maximum</span></label>
              <button className="primary-button modal-submit" disabled={busy || !projects.length}>{busy ? "Uploading and submitting..." : "Submit for review"}</button>
            </form> : <form className="form-stack" onSubmit={editing ? (event) => void updateMilestone(event) : (event) => void saveMilestone(event)}>
              {!editing && <label>Research project<select name="projectId" required defaultValue=""><option value="" disabled>Select a project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>}
              <label>Milestone title<input name="title" required minLength={2} maxLength={180} defaultValue={editing?.title} placeholder="e.g. Submit Chapter 1 draft" /></label>
              <label>Due date<input name="dueDate" type="date" required min={today()} defaultValue={editing?.dueDate} /></label>
              <button className="primary-button modal-submit" disabled={busy || (!editing && !projects.length)}>{busy ? "Saving..." : editing ? "Save milestone" : "Add milestone"}</button>
            </form>}
          </section>
        </div>
      )}
    </section>
  );
}
