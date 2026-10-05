export function validateAccountInput(value: unknown, actorRole: string) {
  if (!value || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  if (
    typeof b.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) ||
    b.email.length > 254
  )
    return null;
  if (
    typeof b.password !== "string" ||
    b.password.length < 12 ||
    b.password.length > 128
  )
    return null;
  if (
    typeof b.accountCode !== "string" ||
    !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(b.accountCode)
  )
    return null;
  if (
    typeof b.fullName !== "string" ||
    !b.fullName.trim() ||
    b.fullName.length > 120
  )
    return null;
  if (
    !["student", "staff", "admin"].includes(String(b.role)) ||
    !["admin", "staff"].includes(actorRole)
  )
    return null;
  if (actorRole === "staff" && b.role !== "student") return null;
  if (typeof b.courseLabel !== "string" || b.courseLabel.length > 160)
    return null;
  if (
    b.assignedStaffId != null &&
    (typeof b.assignedStaffId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        b.assignedStaffId,
      ))
  )
    return null;
  if (b.role !== "student" && b.assignedStaffId) return null;
  if (b.batchId != null && (typeof b.batchId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.batchId))) return null;
  if (b.role !== "student" && b.batchId) return null;
  return {
    email: b.email.trim(),
    password: b.password,
    role: b.role as "student" | "staff" | "admin",
    accountCode: b.accountCode,
    fullName: b.fullName.trim(),
    courseLabel: b.courseLabel.trim(),
    assignedStaffId: b.assignedStaffId as string | null,
    batchId: b.batchId as string | null,
  };
}
