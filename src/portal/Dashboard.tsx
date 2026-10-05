import { Link } from "react-router-dom";
import { DashboardData } from './DashboardData';
import {
  BookOpen,
  CalendarDays,
  MessageCircle,
  NotebookPen,
  Bell,
  BarChart3,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../auth/context";
import { canCreateAccounts, roleLabels } from "../auth/types";
const studentModules = [
  {
    title: "Recorded classes",
    text: "Watch lessons assigned to your batch.",
    icon: BookOpen,
    tab: "classes",
  },
  {
    title: "Attendance",
    text: "Track completed class sessions and eligibility.",
    icon: BarChart3,
    tab: "attendance",
  },
  {
    title: "Timetable",
    text: "See upcoming classes.",
    icon: CalendarDays,
    tab: "timetable",
  },
  {
    title: "Doubts & discussions",
    text: "Ask your class or assigned teacher.",
    icon: MessageCircle,
    tab: "doubts",
  },
  {
    title: "Assignments & notes",
    text: "Submit work, read notes, and view marks.",
    icon: NotebookPen,
    tab: "work",
  },
  {
    title: "Live sessions",
    text: "Join published YouTube Live classes.",
    icon: CalendarDays,
    tab: "live",
  },
  {
    title: "Notifications",
    text: "Read your academy updates.",
    icon: Bell,
    tab: "updates",
  },
];
const teacherModules = [
  {
    title: "Courses & batches",
    text: "Manage the course catalogue and assigned batches.",
    icon: BookOpen,
    tab: "manage",
  },
  {
    title: "Timetable",
    text: "Publish class dates and links.",
    icon: CalendarDays,
    tab: "timetable",
  },
  {
    title: "Recorded classes",
    text: "Publish lessons and lead class discussion.",
    icon: BookOpen,
    tab: "classes",
  },
  {
    title: "Assignments & marks",
    text: "Review submissions and grade work.",
    icon: NotebookPen,
    tab: "work",
  },
  {
    title: "Attendance & reports",
    text: "Review completed sessions and eligibility.",
    icon: BarChart3,
    tab: "reports",
  },
  {
    title: "Student doubts",
    text: "Respond to assigned students privately.",
    icon: MessageCircle,
    tab: "doubts",
  },
  {
    title: "Live classes & updates",
    text: "Schedule sessions and notify batches.",
    icon: Bell,
    tab: "live",
  },
];
export function Dashboard() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <>
      <div className="page-heading">
        <span className="portal-eyebrow">
          {roleLabels[profile.role].toUpperCase()} OVERVIEW
        </span>
        <h1>Welcome, {profile.full_name.split(" ")[0]}.</h1>
        <p className="portal-muted">
          A little progress today. A stronger tomorrow.
        </p>
      </div>
      <section className="portal-welcome">
        <div>
          <span className="portal-eyebrow">LET’S GET STARTED</span>
          <h2>Your journey starts with you.</h2>
          <p>Complete your profile so the academy has your current details.</p>
          <Link className="portal-button light" to="profile">
            Complete my profile <ArrowRight size={17} />
          </Link>
        </div>
        <div className="welcome-symbol" aria-hidden="true">
          <BookOpen size={70} strokeWidth={1} />
        </div>
      </section>
      <DashboardData/>
      <div className="portal-summary">
        <div>
          <span>Account ID</span>
          <strong>{profile.account_code}</strong>
        </div>
        <div>
          <span>Course / batch</span>
          <strong>{profile.course_label || "Awaiting assignment"}</strong>
        </div>
        <div>
          <span>Account access</span>
          <strong>
            <ShieldCheck size={16} /> {roleLabels[profile.role]}
          </strong>
        </div>
      </div>
      {canCreateAccounts(profile) && (
        <Link className="account-callout" to="accounts">
          <span>
            <strong>Manage academy access</strong>
            <small>
              {profile.role === "admin"
                ? "Create accounts and manage staff permissions."
                : "Create accounts for your students."}
            </small>
          </span>
          <ArrowRight size={20} />
        </Link>
      )}
      <div className="section-title">
        <h2>Your learning space</h2>
        <span>Open your academy space</span>
      </div>
      <div className="module-grid">
        {(profile.role === "student" ? studentModules : teacherModules).map(
          ({ title, text, icon: Icon, tab }) => (
            <Link className="module-card" key={title} to={`academy?tab=${tab}`}>
              <Icon size={23} />
              <span className="module-status">Available</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Link>
          ),
        )}
      </div>
    </>
  );
}
