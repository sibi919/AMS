export type Role = "student" | "staff" | "admin";
export const roleLabels: Record<Role, string> = {
  student: "Student",
  staff: "Staff / Teacher",
  admin: "Admin",
};
export interface Profile {
  id: string;
  role: Role;
  account_code: string;
  full_name: string;
  phone: string;
  address: string;
  avatar_path: string | null;
  course_label: string;
  assigned_staff_id: string | null;
  can_create_students: boolean;
  active: boolean;
  created_at: string;
}
export function canCreateAccounts(profile: Profile) {
  return (
    profile.active &&
    (profile.role === "admin" ||
      (profile.role === "staff" && profile.can_create_students))
  );
}
