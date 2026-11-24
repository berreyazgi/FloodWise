import { expect, test } from "@playwright/test";

test("mobile navigation opens the menu and reaches the map", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Demo / Ön Fizibilite").locator("visible=true").first()).toBeVisible();
  await page.getByTestId("mobile-menu").click();
  await page.getByRole("link", { name: "Taşkın Haritası" }).last().click();
  await expect(page).toHaveURL(/\/map/);
  await expect(page.locator("main").getByTestId("flood-map")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
