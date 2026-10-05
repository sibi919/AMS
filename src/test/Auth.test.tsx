import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "../auth/context";
import type { AuthState } from "../auth/context";
import type { Profile } from "../auth/types";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { LoginPage } from "../pages/LoginPage";
import { canCreateAccounts } from "../auth/types";
import { validateAccountInput } from "../../supabase/functions/_shared/account-input";
vi.mock("../auth/client", () => ({ supabase: null, configError: "" }));
const base: Profile = {
  id: "id",
  role: "student",
  full_name: "Student",
  account_code: "STU001",
  phone: "",
  address: "",
  avatar_path: null,
  course_label: "",
  assigned_staff_id: null,
  can_create_students: false,
  active: true,
  created_at: "",
};
const state = (profile: Profile | null, loading = false): AuthState => ({
  profile,
  loading,
  error: "",
  refresh: vi.fn(),
  signOut: vi.fn(),
});
function protectedPage(auth: AuthState) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={["/portal/admin"]}>
        <Routes>
          <Route path="/login" element={<p>Login required</p>} />
          <Route path="/portal/student" element={<p>Student destination</p>} />
          <Route element={<ProtectedRoute role="admin" />}>
            <Route path="/portal/admin" element={<p>Admin private data</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
describe("Access boundaries", () => {
  it("redirects unauthenticated requests", () => {
    protectedPage(state(null));
    expect(screen.getByText("Login required")).toBeInTheDocument();
    expect(screen.queryByText("Admin private data")).not.toBeInTheDocument();
  });
  it("redirects students away from the admin portal", () => {
    protectedPage(state(base));
    expect(screen.getByText("Student destination")).toBeInTheDocument();
  });
  it("allows the matching role", () => {
    protectedPage(state({ ...base, role: "admin" }));
    expect(screen.getByText("Admin private data")).toBeInTheDocument();
  });
  it("never renders private content while loading", () => {
    protectedPage(state({ ...base, role: "admin" }, true));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("Admin private data")).not.toBeInTheDocument();
  });
  it("fails closed without configuration and has exactly three role buttons", async () => {
    render(
      <AuthContext.Provider value={state(null)}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(
      screen.getByRole("button", { name: "Sign in as Student" }),
    ).toBeDisabled();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Admin" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sign in as Admin" }),
      ).toBeDisabled(),
    );
    expect(
      screen.queryByRole("link", { name: /register|sign up/i }),
    ).not.toBeInTheDocument();
  });
  it("requires an explicit active staff permission", () => {
    expect(canCreateAccounts(base)).toBe(false);
    expect(canCreateAccounts({ ...base, role: "staff" })).toBe(false);
    expect(
      canCreateAccounts({ ...base, role: "staff", can_create_students: true }),
    ).toBe(true);
    expect(canCreateAccounts({ ...base, role: "admin", active: false })).toBe(
      false,
    );
  });
});
const account = {
  email: "person@example.com",
  password: "A-long-test-password",
  role: "student",
  accountCode: "STU001",
  fullName: "A Student",
  courseLabel: "",
  assignedStaffId: null,
};
describe("Server account request validation", () => {
  it("accepts a valid staff-created student", () =>
    expect(validateAccountInput(account, "staff")).not.toBeNull());
  it("rejects staff creation of privileged accounts", () => {
    for (const role of ["admin", "staff"])
      expect(validateAccountInput({ ...account, role }, "staff")).toBeNull();
  });
  it("rejects unexpected roles, malformed input, weak passwords and invalid assignments", () => {
    for (const data of [
      null,
      {},
      { ...account, role: "teacher" },
      { ...account, password: "short" },
      { ...account, assignedStaffId: "bad" },
      { ...account, accountCode: "a b" },
      { ...account, email: "invalid" },
    ])
      expect(validateAccountInput(data, "admin")).toBeNull();
  });
  it("denies students even with a well-formed request", () =>
    expect(validateAccountInput(account, "student")).toBeNull());
});
