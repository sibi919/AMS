import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./context";
import type { Role } from "./types";
export function ProtectedRoute({ role }: { role: Role }) {
  const { profile, loading } = useAuth();
  if (loading)
    return (
      <div className="portal-loading" role="status">
        Loading your portal…
      </div>
    );
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role)
    return <Navigate to={`/portal/${profile.role}`} replace />;
  return <Outlet />;
}
