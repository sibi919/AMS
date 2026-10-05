import { Routes, Route, Link } from "react-router-dom";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { PortalLayout } from "../portal/PortalLayout";
import { Dashboard } from "../portal/Dashboard";
import { ProfilePage } from "../portal/ProfilePage";
import { AccountsPage } from "../portal/AccountsPage";
import { AcademyPage } from "../portal/AcademyPage";
import type { Role } from "../auth/types";
export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {(["student", "staff", "admin"] as Role[]).map((role) => (
        <Route key={role} element={<ProtectedRoute role={role} />}>
          <Route path={`/portal/${role}`} element={<PortalLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="academy" element={<AcademyPage />} />
            {role !== "student" && (
              <Route path="accounts" element={<AccountsPage />} />
            )}
          </Route>
        </Route>
      ))}
      <Route
        path="*"
        element={
          <main className="portal-loading">
            <h1>Page not found</h1>
            <Link to="/">Return to JOAB Academy</Link>
          </main>
        }
      />
    </Routes>
  );
}
