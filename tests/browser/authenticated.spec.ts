import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({page}) => {
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({contentType:"text/css",body:""}));
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
});
// Contract fixtures exercise browser behavior, not a live Supabase integration.
for (const role of ["student", "staff", "admin"]) {
  test(`${role}: sign-in, role boundary, profile and account foundation`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const userId = "10000000-0000-0000-0000-000000000001";
    const profile = {
      id: userId,
      role,
      full_name: "Test Learner",
      account_code: `${role.toUpperCase()}001`,
      phone: "",
      address: "",
      avatar_path: null,
      course_label: "",
      assigned_staff_id: null,
      can_create_students: role === "staff",
      active: true,
      created_at: "2026-09-16T00:00:00Z",
    };
    const user = {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "learner@example.com",
      app_metadata: { provider: "email" },
      user_metadata: {},
      created_at: "2026-09-16T00:00:00Z",
    };
    const token = [
      Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({
          sub: userId,
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString("base64url"),
      "test-signature",
    ].join(".");
    let profilePatch: Record<string, unknown> | null = null;
    let accountRequest: Record<string, unknown> | null = null;
    await page.route("https://portal-test.supabase.co/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, json: body });
      if (url.pathname === "/rest/v1/rpc/academy_directory") return json([profile]);
      if (url.pathname === "/rest/v1/rpc/attendance_summary") return json([{percentage:0,credited:0,required:120,eligibility:"not_eligible"}]);
      if (url.pathname === "/rest/v1/rpc/attendance_evidence") return json([]);
      if (url.pathname === "/auth/v1/token")
        return json({
          access_token: token,
          refresh_token: "test-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user,
        });
      if (url.pathname === "/auth/v1/logout")
        return route.fulfill({ status: 204 });
      if (url.pathname === "/auth/v1/user") return json(user);
      if (url.pathname === "/rest/v1/profiles") {
        if (request.method() === "PATCH") {
          profilePatch = request.postDataJSON();
          Object.assign(profile, profilePatch);
          return json({ id: userId });
        }
        return json(url.searchParams.has("id") ? profile : [profile]);
      }
      if (url.pathname === "/rest/v1/class_sessions") return json([{id:"session-1",batch_id:"batch-1",title:"Practice session",published:true,archived:false}]);
      if (url.pathname === "/rest/v1/courses") return json([{id:"course-1",title:"Test course",active:true}]);
      if (url.pathname === "/rest/v1/batches")
        return json([
          {
            id: "batch-1",
            title: "Test batch",
            course_id: "course-1",
            staff_id: null,
            active: true,
          },
        ]);
      if (role === "student" && url.pathname === "/rest/v1/lessons")
        return json([
          {
            id: "lesson-1",
            class_session_id: "session-1",
            batch_id: "batch-1",
            title: "Practice video",
            youtube_id: "abcdefghijk",
            duration_seconds: 120,
            published: true,
          },
        ]);
      if (role === "student" && url.pathname === "/rest/v1/enrollments")
        return json([
          { id: "enrollment-1", batch_id: "batch-1", student_id: userId },
        ]);
      if (url.pathname.startsWith("/rest/v1/") && request.method() === "GET")
        return json([]);
      if (url.pathname === "/functions/v1/create-account") {
        accountRequest = request.postDataJSON();
        return json({ message: "Account created." }, 201);
      }
      return json({ message: "Unexpected test endpoint" }, 500);
    });
    await page.goto("/login");
    await page.getByRole("button", { name: "Admin", exact: true }).click(); // Choosing Admin grants no privileges.
    await page.getByLabel("Email address").fill("learner@example.com");
    await page
      .getByLabel("Password", { exact: true })
      .fill("Test-login-password");
    await page.getByRole("button", { name: "Sign in as Admin" }).click();
    await expect(page).toHaveURL(new RegExp(`/portal/${role}$`));
    await expect(
      page.getByRole("heading", { name: "Welcome, Test." }),
    ).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toHaveCount(7);
    expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${role}-dashboard.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Academy", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Academy", exact: true }),
    ).toBeVisible();
    if (role === "student") {
      await page.getByRole("button", {name:"Play Practice video",exact:true}).click();
      await expect(
        page.getByTitle("Practice video YouTube player"),
      ).toBeVisible();
    }
    await page.getByRole("tab", { name: "Live classes" }).click();
    await expect(page.getByText("No live classes scheduled.")).toBeVisible();
    await page.getByRole("tab", { name: "Questions" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const name of ["Timetable", "Attendance", "Assignments & notes", "Updates", ...(role === "student" ? [] : ["Courses & batches", "Reports"])]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    if (role !== "admin") {
      await page.goto("/portal/admin");
      await expect(page).toHaveURL(new RegExp(`/portal/${role}$`));
    }
    await page.getByRole("link", { name: "My profile", exact: true }).click();
    await page.getByLabel("Full name", { exact: true }).fill("Updated Learner");
    await page.getByLabel("Address", { exact: true }).fill("Test address");
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Profile saved.");
    expect(Object.keys(profilePatch ?? {}).sort()).toEqual([
      "address",
      "avatar_path",
      "full_name",
      "phone",
    ]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (role !== "student") {
      await page.getByRole("link", { name: "Accounts", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Create account", exact: true }),
      ).toBeEnabled();
      await page.getByLabel("Full name", { exact: true }).fill("New Student");
      await page.getByLabel("Account ID", { exact: true }).fill("STU002");
      await page.getByLabel("Email", { exact: true }).fill("new@example.com");
      await page.getByLabel("Initial password").fill("Initial-password-123");
      await page.getByLabel("Enroll in batch").selectOption('batch-1');
      if (role === "staff")
        await expect(
          page.getByLabel("Role", { exact: true }).locator("option"),
        ).toHaveCount(1);
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Account created." }),
      ).toBeVisible({ timeout: 10000 });
      expect(accountRequest).toMatchObject({
        role: "student",
        accountCode: "STU002",
      });
      await expect(page.getByLabel("Initial password")).toHaveValue("");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${role}-accounts.png`),
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  });
}
