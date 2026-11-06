import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { api } from "./api/client";
import ResearchWorkspace from "./components/ResearchWorkspace";
import { useDialogAccessibility } from "./components/useDialogAccessibility";
import type { Adviser, Dashboard, Project, User } from "./types";

type IconName =
  | "grid"
  | "book"
  | "calendar"
  | "message"
  | "settings"
  | "search"
  | "bell"
  | "plus"
  | "arrow"
  | "clock"
  | "more"
  | "chevron"
  | "logout"
  | "close"
  | "check"
  | "spark";

type AuthMode = "login" | "register" | "forgot" | "reset";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z" /><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" /><path d="m19 14 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const demoProjects: Project[] = [
  { id: "demo-1", title: "Digital Learning Tools and Student Engagement", course: "BS Information Technology", adviser: "Dr. Angela Reyes", progress: 68, status: "In progress", dueDate: "2026-11-18" },
  { id: "demo-2", title: "Community-Based Waste Management System", course: "BS Information Technology", adviser: "Prof. Miguel Santos", progress: 42, status: "Needs attention", dueDate: "2026-11-12" },
  { id: "demo-3", title: "Mobile App for Local Business Discovery", course: "BS Computer Science", adviser: "Dr. Angela Reyes", progress: 85, status: "In progress", dueDate: "2026-12-02" },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDue(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function dateKey(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function daysUntil(date: string) {
  const today = new Date(`${dateKey()}T00:00:00`);
  const dueDate = new Date(`${date}T00:00:00`);
  return Math.max(0, Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000));
}

function App() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [projects, setProjects] = useState(demoProjects);
  const [user, setUser] = useState<User | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [advisers, setAdvisers] = useState<Adviser[]>([]);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset") ?? "");
  const [modal, setModal] = useState<"project" | "auth" | null>(() =>
    new URLSearchParams(window.location.search).has("reset") ? "auth" : null);
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    new URLSearchParams(window.location.search).has("reset") ? "reset" : "login");
  const [authNotice, setAuthNotice] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [backendError, setBackendError] = useState("");

  function clearResetLink() {
    setResetToken("");
    const url = new URL(window.location.href);
    url.searchParams.delete("reset");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function closeAuth() {
    setModal(null);
    setBackendError("");
    setAuthNotice("");
    if (authMode === "reset") {
      clearResetLink();
      setAuthMode("login");
    }
  }

  useDialogAccessibility(Boolean(modal), () => {
    setModal(null);
    setEditingProject(null);
    closeAuth();
  });

  const navItems: { label: string; icon: IconName }[] = user?.role === "adviser"
    ? [
      { label: "Overview", icon: "grid" },
      { label: "Assigned projects", icon: "book" },
      { label: "Milestones", icon: "calendar" },
      { label: "Review queue", icon: "message" },
      { label: "Feedback", icon: "message" },
    ]
    : user?.role === "admin"
      ? [
        { label: "Overview", icon: "grid" },
        { label: "All projects", icon: "book" },
        { label: "Milestones", icon: "calendar" },
        { label: "Review queue", icon: "message" },
        { label: "Users", icon: "settings" },
      ]
      : [
        { label: "Overview", icon: "grid" },
        { label: "My research", icon: "book" },
        { label: "Milestones", icon: "calendar" },
        { label: "Submissions", icon: "arrow" },
        { label: "Feedback", icon: "message" },
      ];

  async function refreshDashboard() {
    if (!user) return;
    try {
      const data = await api.dashboard();
      setDashboard(data);
      setProjects(data.projects);
    } catch (error) {
      setToast(error instanceof Error ? `Couldn't refresh your dashboard: ${error.message}` : "Couldn't refresh your dashboard.");
    }
  }

  useEffect(() => {
    api.me().then(({ user: currentUser }) => {
      if (!currentUser) return;
      setUser(currentUser);
      return api.dashboard().then((data) => {
        setDashboard(data);
        setProjects(data.projects);
        setBackendError("");
      });
    }).catch((error: unknown) => {
      setUser(null);
      setDashboard(null);
      setProjects(demoProjects);
      if (error instanceof Error && !error.message.includes("401")) {
        setToast(`Couldn't load your account: ${error.message}`);
      }
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!user || modal !== "project") return;
    api.advisers().then(({ advisers: currentAdvisers }) => setAdvisers(currentAdvisers)).catch((error: unknown) => {
      setToast(error instanceof Error ? `Couldn't load adviser accounts: ${error.message}` : "Couldn't load adviser accounts.");
    });
  }, [modal, user]);

  const filteredProjects = useMemo(
    () => projects.filter((project) => `${project.title} ${project.course} ${project.adviser}`.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );
  const averageProgress = projects.length
    ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length)
    : 0;
  const activeProjectCount = projects.filter((project) => project.status !== "Completed").length;
  const upcomingMilestones = (dashboard?.milestones ?? []).filter((milestone) => milestone.dueDate >= dateKey());
  const upcomingProjectDeadlines = projects.filter((project) => project.dueDate >= dateKey());
  const upcomingDeadlineCount = user
    ? (dashboard?.milestoneStats.upcoming ?? 0) + upcomingProjectDeadlines.length
    : upcomingProjectDeadlines.length;
  const upcomingProjects = useMemo(
    () => user
      ? [
        ...upcomingMilestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        dueDate: milestone.dueDate,
        projectTitle: milestone.projectTitle,
        })),
        ...upcomingProjectDeadlines.map((project) => ({
          id: project.id,
          title: "Research target date",
          dueDate: project.dueDate,
          projectTitle: project.title,
        })),
      ].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3)
      : upcomingProjectDeadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3).map((project) => ({
        id: project.id,
        title: "Research target date",
        dueDate: project.dueDate,
        projectTitle: project.title,
      })),
    [dashboard, projects, user],
  );
  const nextDeadlineDays = upcomingProjects.length ? daysUntil(upcomingProjects[0].dueDate) : null;
  const todayLabel = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();
  const milestoneTotal = dashboard?.milestoneStats.total ?? (user ? 0 : 5);
  const milestoneComplete = dashboard?.milestoneStats.complete ?? (user ? 0 : 3);
  const milestoneProgress = milestoneTotal ? Math.round((milestoneComplete / milestoneTotal) * 100) : 0;

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setBackendError("");
    setAuthNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (authMode === "forgot") {
        const { message } = await api.requestPasswordReset(email);
        setAuthNotice(message);
        return;
      }
      if (authMode === "reset") {
        const confirmation = String(form.get("confirmPassword") ?? "");
        if (password !== confirmation) {
          setBackendError("The passwords don't match.");
          return;
        }
        const { message } = await api.resetPassword(resetToken, password);
        clearResetLink();
        setAuthMode("login");
        setAuthNotice(message);
        return;
      }

      const name = String(form.get("name") ?? "").trim();
      const result = authMode === "register"
        ? await api.register(name, email, password)
        : await api.login(email, password);
      setUser(result.user);
      setActiveNav("Overview");
      const data = await api.dashboard();
      setDashboard(data);
      setProjects(data.projects);
      setModal(null);
      setToast(`Welcome${authMode === "register" ? " to ThesisTrack" : " back"}, ${result.user.name.split(" ")[0]}!`);
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      setModal("auth");
      setBackendError("Sign in to save your research project.");
      return;
    }
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const details = {
        title: String(form.get("title")).trim(),
        course: String(form.get("course")).trim(),
        adviser: String(form.get("adviser")).trim(),
        adviserEmail: String(form.get("adviserEmail")).trim(),
        dueDate: String(form.get("dueDate")),
      };
      const { project } = editingProject
        ? await api.updateProject(editingProject.id, details)
        : await api.createProject(details);
      setProjects((current) => editingProject
        ? current.map((item) => item.id === project.id ? project : item)
        : [project, ...current]);
      setModal(null);
      setToast(editingProject ? "Your research project has been updated." : "Your research project has been created.");
      setEditingProject(null);
      void refreshDashboard();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Couldn't save the project.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject() {
    if (!editingProject || !window.confirm(`Delete "${editingProject.title}" and all its milestones and submissions?`)) return;
    setLoading(true);
    try {
      await api.deleteProject(editingProject.id);
      setProjects((current) => current.filter((project) => project.id !== editingProject.id));
      setModal(null);
      setEditingProject(null);
      setToast("Research project deleted.");
      void refreshDashboard();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Couldn't delete the project.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await api.logout();
      setUser(null);
      setDashboard(null);
      setProjects(demoProjects);
      setActiveNav("Overview");
      setToast("You've been signed out.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Couldn't sign out.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => setActiveNav("Overview")} aria-label="ThesisTrack home">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span>thesis<span className="brand-light">track</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon }) => (
            <button key={label} className={`nav-item ${activeNav === label ? "active" : ""}`} aria-label={label} aria-current={activeNav === label ? "page" : undefined} onClick={() => setActiveNav(label)}>
              <Icon name={icon} size={19} /><span>{label}</span>
              {label === "Feedback" && !user && <span className="nav-count">2</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-spark"><Icon name="spark" size={17} /></div>
          <strong>A little progress<br />goes a long way.</strong>
          <p>Keep showing up. Your research is getting there.</p>
          <div className="help-decoration"><span /><span /><span /><span /><span /></div>
        </div>
        <button className="nav-item settings-link" onClick={() => setToast("Settings are coming soon.")}><Icon name="settings" size={19} /><span>Settings</span></button>
        <div className="profile">
          <div className="avatar avatar-user">{user ? initials(user.name) : "G"}</div>
          <div className="profile-copy"><strong>{user?.name ?? "Guest"}</strong><span>{user?.role ?? "Student researcher"}</span></div>
          <button className="icon-button profile-menu" aria-label={user ? "Sign out" : "Sign in"} onClick={() => user ? void signOut() : setModal("auth")}>
            <Icon name={user ? "logout" : "chevron"} size={17} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." aria-label="Search projects" /></label>
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast("You're all caught up!")}>
              <Icon name="bell" size={19} /><span className="notification-dot" />
            </button>
            {user
              ? <button className="sign-in-button" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out..." : "Log out"}</button>
              : <button className="sign-in-button" onClick={() => { setBackendError(""); setModal("auth"); }}>Sign in</button>}
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="date-line"><span className="date-dot" /> {todayLabel}</div>
              <h1>Good morning<span className="wave">✳</span></h1>
              <p className="welcome-subtitle">A little progress today makes a big difference tomorrow.</p>
            </div>
            {(user?.role === "student" || user?.role === "admin" || !user) && <button className="primary-button" onClick={() => { setEditingProject(null); setBackendError(""); setModal("project"); }}><Icon name="plus" size={18} /> New research</button>}
          </section>

          {!user && <div className="demo-banner"><span><Icon name="spark" size={16} /> You’re viewing a demo workspace.</span><button onClick={() => { setBackendError(""); setModal("auth"); }}>Create an account to save your work <Icon name="arrow" size={15} /></button></div>}

          {activeNav !== "Overview" && ["My research", "Assigned projects", "All projects"].includes(activeNav) && <div className="section-notice"><span className="section-icon"><Icon name={navItems.find((item) => item.label === activeNav)?.icon ?? "grid"} /></span><div><strong>{activeNav}</strong><p>{user?.role === "adviser" ? "Research projects assigned to your adviser account." : user?.role === "admin" ? "Projects across the ThesisTrack workspace." : "All your research projects, in one place."}</p></div></div>}

          {["Overview", "My research", "Assigned projects", "All projects"].includes(activeNav) ? <>
          <section className="stats-grid" aria-label="Research overview">
            <article className="stat-card stat-progress">
              <div className="stat-top"><span className="stat-label">OVERALL PROGRESS</span><span className="stat-icon mint"><Icon name="arrow" size={17} /></span></div>
              <div className="stat-value">{averageProgress}<span className="stat-unit">%</span></div>
              <div className="stat-foot"><div className="mini-track"><span style={{ width: `${averageProgress}%` }} /></div><span>Across all projects</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">ACTIVE PROJECTS</span><span className="stat-icon lilac"><Icon name="book" size={17} /></span></div>
              <div className="stat-value">{activeProjectCount.toString().padStart(2, "0")}</div>
              <div className="stat-foot"><span className="small-indicator green-indicator" /> All moving forward</div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">UPCOMING DEADLINES</span><span className="stat-icon peach"><Icon name="clock" size={17} /></span></div>
              <div className="stat-value">{upcomingDeadlineCount.toString().padStart(2, "0")}</div>
              <div className="stat-foot"><span className="small-indicator peach-indicator" />{nextDeadlineDays === null ? "No upcoming deadlines" : nextDeadlineDays === 0 ? "Deadline is today" : `Next one in ${nextDeadlineDays} day${nextDeadlineDays === 1 ? "" : "s"}`}</div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-label">ADVISER FEEDBACK</span><span className="stat-icon blue"><Icon name="message" size={17} /></span></div>
              <div className="stat-value">{user ? (dashboard?.feedbackCount ?? 0).toString().padStart(2, "0") : "02"}</div>
              <div className="stat-foot"><span className="small-indicator blue-indicator" />{user ? (user.role === "student" ? `${dashboard?.pendingReviews ?? 0} needs your attention` : `${dashboard?.pendingReviews ?? 0} awaiting review`) : "1 needs your attention"}</div>
            </article>
          </section>

          <section className="content-grid">
            <div className="projects-panel panel">
              <div className="panel-heading">
                <div><div className="panel-kicker">{user?.role === "adviser" ? "ADVISER WORKSPACE" : user?.role === "admin" ? "COORDINATOR WORKSPACE" : "YOUR WORKSPACE"}</div><h2>{user?.role === "adviser" ? "Assigned research projects" : user?.role === "admin" ? "Research projects" : "Your research projects"} <span className="heading-count">{projects.length}</span></h2></div>
                <button className="text-button" onClick={() => setActiveNav(user?.role === "adviser" ? "Assigned projects" : user?.role === "admin" ? "All projects" : "My research")}>View all <Icon name="arrow" size={15} /></button>
              </div>
              <div className="project-list">
                {filteredProjects.length ? filteredProjects.map((project, index) => (
                  <article className="project-card" key={project.id}>
                    <div className={`project-emblem emblem-${index % 3}`}><span>{["01", "02", "03"][index % 3]}</span><div className="emblem-orbit" /></div>
                    <div className="project-main">
                      <div className="project-title-line"><h3>{project.title}</h3>                      {(user?.role === "student" || user?.role === "admin" || !user) && <button className="icon-button more-button" aria-label={`Edit ${project.title}`} onClick={() => { if (!user) { setModal("auth"); return; } setEditingProject(project); setModal("project"); }}><Icon name="more" size={18} /></button>}</div>
                      <div className="project-course">{project.course}</div>
                      <div className="project-progress-row"><div className="project-progress-track"><span className={`bar-${index % 3}`} style={{ width: `${project.progress}%` }} /></div><span className="progress-number">{project.progress}%</span></div>
                      <div className="project-meta"><span className="adviser-avatar">{initials(user?.role === "adviser" || user?.role === "admin" ? project.ownerName ?? project.adviser : project.adviser)}</span><span>{user?.role === "adviser" || user?.role === "admin" ? project.ownerName ?? project.adviser : project.adviser}</span><span className="meta-divider" /><span className="due-meta"><Icon name="calendar" size={14} /> Due {formatDue(project.dueDate)}</span></div>
                    </div>
                    <span className={`status-pill ${project.status === "Needs attention" ? "status-warning" : project.status === "Completed" ? "status-done" : "status-progress"}`}><span />{project.status}</span>
                  </article>
                )) : <div className="empty-state"><div className="empty-icon"><Icon name="book" size={23} /></div><strong>{query ? "No projects found" : "Your next big idea starts here."}</strong><p>{query ? "Try searching for a different title or adviser." : "Create a research project to keep your progress organized."}</p>                {!query && <button className="text-button" onClick={() => { setEditingProject(null); setModal("project"); }}>Add your first project <Icon name="arrow" size={15} /></button>}</div>}
              </div>
              {(user?.role === "student" || user?.role === "admin" || !user) && <button className="add-project-row" onClick={() => { setEditingProject(null); setModal("project"); }}><span className="add-circle"><Icon name="plus" size={16} /></span> Add a research project</button>}
            </div>

            <aside className="right-column">
              <section className="focus-card">
                <div className="focus-glow" />
                <div className="focus-top"><span>YOUR WEEKLY FOCUS</span><span className="focus-spark"><Icon name="spark" size={15} /></span></div>
                <h2>One chapter<br />at a time.</h2>
                <p>Small, steady steps add up. You’ve got this.</p>
                <div className="focus-progress"><div><span>Milestones approved</span><strong>{milestoneComplete} of {milestoneTotal}</strong></div><div className="focus-track"><span style={{ width: `${milestoneProgress}%` }} /></div></div>
                <div className="focus-illustration"><div className="illustration-sheet"><i /><i /><i /><b><Icon name="check" size={11} /></b></div><div className="illustration-pencil" /></div>
              </section>
              <section className="deadlines-panel panel">
                <div className="panel-heading deadline-heading"><div><div className="panel-kicker">DON’T MISS A THING</div><h2>Coming up</h2></div><button className="icon-button calendar-small" aria-label="Open calendar" onClick={() => setActiveNav("Milestones")}><Icon name="calendar" size={17} /></button></div>
                <div className="deadline-list">
                  {upcomingProjects.length ? upcomingProjects.map((project, index) => {
                    const deadline = new Date(`${project.dueDate}T00:00:00`);
                    return <div className="deadline-item" key={project.id}>
                      <div className="deadline-date"><strong>{deadline.toLocaleDateString("en-PH", { day: "2-digit" })}</strong><span>{deadline.toLocaleDateString("en-PH", { month: "short" }).toUpperCase()}</span></div>
                      <div className="deadline-copy"><strong>{project.title}</strong><span>{project.projectTitle}</span></div>
                      <span className={`deadline-dot dot-${["orange", "lilac", "mint"][index]}`} />
                    </div>;
                  }) : <div className="deadline-empty">{user ? "Your upcoming project deadlines will appear here." : "No upcoming deadlines."}</div>}
                </div>
                <button className="deadline-link" onClick={() => setActiveNav("Milestones")}>See all milestones <Icon name="arrow" size={15} /></button>
              </section>
            </aside>
          </section>
          </> : user ? <ResearchWorkspace section={activeNav} user={user} projects={projects} dashboard={dashboard} onRefresh={refreshDashboard} onToast={setToast} /> : <section className="workflow-panel panel guest-workflow"><div className="empty-icon"><Icon name="spark" size={23} /></div><h2>Sign in to manage your research</h2><p>Create an account to track milestones, submit drafts, and receive adviser feedback.</p><button className="primary-button" onClick={() => setModal("auth")}>Sign in or create an account</button></section>}
          <footer className="page-footer"><span>Made for the work in progress <span className="footer-heart">♥</span></span><span>ThesisTrack <span className="footer-divider">·</span> Cainta, Rizal</span></footer>
        </div>
      </main>

      {modal === "project" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setModal(null); setEditingProject(null); } }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
        <button className="modal-close icon-button" onClick={() => { setModal(null); setEditingProject(null); }} aria-label="Close"><Icon name="close" /></button>
        <div className="modal-icon"><Icon name="book" size={21} /></div><div className="modal-eyebrow">{editingProject ? "KEEP IT UP TO DATE" : "MAKE IT OFFICIAL"}</div><h2 id="project-modal-title">{editingProject ? "Edit research project" : "Start a new project"}</h2><p className="modal-description">{editingProject ? "Update your project details and adviser assignment." : "Give your research a home. You can fill in the details as you go."}</p>
        <form onSubmit={submitProject} className="form-stack">
          <label>Research title<input name="title" placeholder="e.g. Community garden monitoring system" defaultValue={editingProject?.title} required maxLength={180} /></label>
          <label>Program / course<input name="course" placeholder="e.g. BS Information Technology" defaultValue={editingProject?.course} required maxLength={120} /></label>
          <label>Research adviser<input name="adviser" placeholder="Adviser name" defaultValue={editingProject?.adviser} required maxLength={120} /></label>
          <label>Adviser account email <span className="field-hint">Optional — assigns this project to an existing adviser account.</span><input name="adviserEmail" type="email" list="adviser-options" placeholder="adviser@school.edu.ph" defaultValue={editingProject?.adviserEmail ?? ""} maxLength={254} /><datalist id="adviser-options">{advisers.map((adviser) => <option key={adviser.id} value={adviser.email}>{adviser.name}</option>)}</datalist></label>
          <label>Target date<input name="dueDate" type="date" required min={dateKey()} defaultValue={editingProject?.dueDate} /></label>
          <button className="primary-button modal-submit" type="submit" disabled={loading}>{loading ? "Saving..." : !user ? "Continue to sign in" : editingProject ? "Save changes" : "Create project"} <Icon name="arrow" size={16} /></button>
          {editingProject && <button className="delete-project-button" type="button" disabled={loading} onClick={() => void deleteProject()}>Delete this project</button>}
        </form>
      </section></div>}

      {modal === "auth" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuth(); }}><section className="modal-card auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <button className="modal-close icon-button" onClick={closeAuth} aria-label="Close"><Icon name="close" /></button>
      <div className="modal-icon"><Icon name="spark" size={21} /></div><div className="modal-eyebrow">YOUR RESEARCH, IN ONE PLACE</div>
      <h2 id="auth-modal-title">{authMode === "login" ? "Welcome back" : authMode === "register" ? "Create your account" : authMode === "forgot" ? "Forgot your password?" : "Choose a new password"}</h2>
      <p className="modal-description">{authMode === "login" ? "Sign in to pick up where you left off." : authMode === "register" ? "Let's make progress feel a little more manageable." : authMode === "forgot" ? "Enter your school email and we'll send a reset link if an account matches." : "Your new password must be at least 8 characters."}</p>
      {backendError && <div className="form-error" role="alert">{backendError}</div>}
      {authNotice && <div className="form-success" role="status">{authNotice}</div>}
      <form onSubmit={submitAuth} className="form-stack">
        {authMode === "register" && <label>Your name<input name="name" autoComplete="name" placeholder="e.g. Juan Dela Cruz" required minLength={2} maxLength={100} /></label>}
        {(authMode === "login" || authMode === "register" || authMode === "forgot") && <label>School email<input name="email" type="email" autoComplete="email" placeholder="you@school.edu.ph" required maxLength={254} /></label>}
        {(authMode === "login" || authMode === "register" || authMode === "reset") && <label>{authMode === "reset" ? "New password" : "Password"}<input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" required minLength={8} maxLength={72} /></label>}
        {authMode === "reset" && <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter your new password" required minLength={8} maxLength={72} /></label>}
        {authMode === "login" && <button className="auth-link" type="button" onClick={() => { setAuthMode("forgot"); setBackendError(""); setAuthNotice(""); }}>Forgot password?</button>}
        <button className="primary-button modal-submit" type="submit" disabled={loading}>{loading ? "Please wait..." : authMode === "login" ? "Sign in" : authMode === "register" ? "Create account" : authMode === "forgot" ? "Send reset link" : "Reset password"} <Icon name="arrow" size={16} /></button>
      </form>
      {authMode === "login" || authMode === "register"
        ? <div className="auth-switch">{authMode === "login" ? "New to ThesisTrack?" : "Already have an account?"}<button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setBackendError(""); setAuthNotice(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></div>
        : <div className="auth-switch"><button onClick={() => { if (authMode === "reset") clearResetLink(); setAuthMode("login"); setBackendError(""); setAuthNotice(""); }}>Back to sign in</button></div>}
      </section></div>}
      {toast && <div className="toast-message" role="status"><span className="toast-check"><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  );
}

export default App;