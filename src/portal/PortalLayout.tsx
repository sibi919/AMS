import { Link, NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  Users,
  BookOpen,
  UserRound,
  ArrowUpRight,
} from "lucide-react";
import { useAuth } from "../auth/context";
import { roleLabels } from "../auth/types";
export function PortalLayout() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const root = `/portal/${profile.role}`;
  return (
    <div className="portal-shell">
      <a className="skip-link" href="#portal-main">
        Skip to content
      </a>
      <aside className="portal-sidebar">
        <Link to="/" className="portal-brand">
          <span className="brand-mark"><img src="/brand/joab-ja-mark.png" alt="" /></span> JOAB Academy
        </Link>
        <div className="portal-sidebar-label">
          {roleLabels[profile.role]} portal
        </div>
        <nav aria-label="Portal navigation">
          <span className="portal-sidebar-label">Academy</span>
          <NavLink to={root} end>
            <LayoutDashboard size={18} />
            Overview
          </NavLink>
          <NavLink to={`${root}/academy`}>
            <BookOpen size={18} />
            Academy
          </NavLink>
          <NavLink to={`${root}/profile`}>
            <UserRound size={18} />
            My profile
          </NavLink>
          {profile.role !== "student" && (
            <NavLink to={`${root}/accounts`}>
              <Users size={18} />
              Accounts
            </NavLink>
          )}
          <Link to={`${root}/academy?tab=doubts`}>Private chat</Link>
          <Link to={`${root}/academy?tab=updates`}>Notifications</Link>
          {profile.role === 'admin' && <Link to={`${root}/academy?tab=reports`}>Reports &amp; audit</Link>}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/">
            Academy website <ArrowUpRight size={16} />
          </Link>
          <button onClick={() => void signOut()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <div className="portal-body">
        <header className="portal-topbar">
          <span>ACADEMY PORTAL</span>
          <span>
            {profile.full_name} <b>{profile.account_code}</b>
          </span>
        </header>
        <main id="portal-main" className="portal-content">
          <Outlet />
        </main>
        <footer className="portal-footer">
          JOAB Academy · Learn with purpose.
        </footer>
      </div>
    </div>
  );
}
