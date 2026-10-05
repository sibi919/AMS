export function localDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function attendancePercent(value: unknown) {
  const number = Number(value);
  // Do not round a value below an eligibility threshold up to that threshold.
  return Number.isFinite(number) ? (Math.floor(Math.max(0, Math.min(100, number)) * 100) / 100).toFixed(2) : "0.00";
}

export function httpsLink(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function youtubeId(input: string) {
  const value = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(url.hostname)) return "";
    const id = url.hostname.endsWith("youtu.be") ? url.pathname.split("/")[1] : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}

export function eligibilityLabel(value: string) {
  const labels: Record<string, string> = {
    no_sessions: "No required class sessions yet",
    review_required: "Eligibility pending official class-duration review",
    no_lessons: "No published lessons yet",
    academy_not_eligible: "Academy not eligible · Exam not eligible",
    academy_eligible_exam_not_eligible: "Academy eligible · Exam not eligible",
    academy_and_exam_eligible: "Academy eligible · Exam eligible",
  };
  return labels[value] ?? "Attendance unavailable";
}

export function duration(value:number) { const seconds=Math.floor(Number(value)||0); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`; }
