import { describe, expect, it } from "vitest";
import { attendancePercent, eligibilityLabel, httpsLink, localDateTime, youtubeId } from "../portal/learning";

describe("learning display and input boundaries", () => {
  it("never rounds an ineligible percentage into an eligible threshold", () => {
    expect(attendancePercent(74.999)).toBe("74.99");
    expect(attendancePercent("84.9999")).toBe("84.99");
    expect(attendancePercent(75)).toBe("75.00");
    expect(attendancePercent(85)).toBe("85.00");
    expect(eligibilityLabel("academy_eligible_exam_not_eligible")).toBe("Academy eligible · Exam not eligible");
  });
  it("round trips an unchanged datetime-local input without timezone drift", () => {
    const local = new Date(2026, 8, 16, 10, 35);
    expect(localDateTime(local.toISOString())).toBe("2026-09-16T10:35");
    expect(new Date(localDateTime(local.toISOString())).getTime()).toBe(local.getTime());
    expect(localDateTime(null)).toBe("");
  });
  it("only opens valid HTTPS class links without embedded credentials", () => {
    expect(httpsLink("javascript:alert(1)")).toBeUndefined();
    expect(httpsLink("data:text/html,hello")).toBeUndefined();
    expect(httpsLink("https://secret:password@example.org")).toBeUndefined();
    expect(httpsLink("https://meet.example.org/class")).toBe("https://meet.example.org/class");
  });
  it("extracts only YouTube IDs from accepted video hosts", () => {
    for (const url of ["abcdefghijk", "https://youtu.be/abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/live/abcdefghijk", "https://m.youtube.com/watch?v=abcdefghijk"]) expect(youtubeId(url)).toBe("abcdefghijk");
    expect(youtubeId("https://youtube.com.example.org/watch?v=abcdefghijk")).toBe("");
    expect(youtubeId("javascript:abcdefghijk")).toBe("");
  });
});
