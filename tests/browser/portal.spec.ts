import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({page}) => {
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({contentType:"text/css",body:""}));
  await page.route("https://fonts.gstatic.com/**", route => route.abort());
});
test("portfolio, login and protected route responsive smoke", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("undefined");
  await page.screenshot({path:testInfo.outputPath("portfolio-viewport.png")});
  await page.screenshot({
    path: testInfo.outputPath("portfolio.png"),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const img of await page.locator('img[src*="brochure"]').all()) { await img.scrollIntoViewIfNeeded(); await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true); }
  const headerLogo = page.locator("header img").first();
  await expect.poll(() => headerLogo.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  await page.locator("#placement").scrollIntoViewIfNeeded();
  const partnerLogos = page.locator("#placement .placement-partner-card img");
  await expect(partnerLogos).toHaveCount(5);
  for(const logo of await partnerLogos.all()) await expect.poll(()=>logo.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  await page.locator("#placement").screenshot({path:testInfo.outputPath("placement.png")});
  await page.locator("#about").scrollIntoViewIfNeeded();
  const ceoPhoto=page.getByRole("img",{name:"Ashwini Vetrivel, CEO of JOAB Academy"});
  await expect(ceoPhoto).toBeVisible();
  await expect.poll(()=>ceoPhoto.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in as Student" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Staff / Teacher", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sign in as Staff / Teacher" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Admin", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const route of [
    "/portal/student",
    "/portal/staff/accounts",
    "/portal/admin",
    "/portal/admin/accounts",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Welcome back." }),
    ).toBeVisible();
  }
  await page.goto("/does-not-exist");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
