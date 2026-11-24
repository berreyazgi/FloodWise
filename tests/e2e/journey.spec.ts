import { expect, test } from "@playwright/test";

test("main journey: home → map → study location → risk → planning → simulation → report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Sel Riskini Verilerle Anlayın/ })).toBeVisible();
  await page.getByTestId("cta-map").click();
  await expect(page).toHaveURL(/\/map/);
  await expect(page.locator("main").getByTestId("flood-map")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });

  // demo role switch (not authentication)
  await page.getByTestId("role-switch").selectOption("operator");

  // study location: pick the 2009 corridor study area and run the analysis
  await page.locator("#topbar-location").selectOption("loc-ayamama");
  await page.getByRole("link", { name: "Risk Analizi" }).first().click();
  await expect(page.getByTestId("analysis")).toBeVisible();
  await expect(page.getByText(/makine öğrenmesi modeli eğitilmedi/i)).toBeVisible();
  await page.getByTestId("run-analysis").click();
  await expect(page.getByTestId("candidate").first()).toBeVisible();

  await page.getByRole("link", { name: /Müdahale planlamasına geç/ }).click();
  await expect(page).toHaveURL(/\/pump-planning/);
  await expect(page.getByText("Kesin pompa seçimi için ilave hidrolik ve saha verileri gereklidir.").first()).toBeVisible();
  await expect(page.getByTestId("pump-candidate").first()).toBeVisible();
  await expect(page.getByTestId("tdh")).toContainText("m");

  await page.getByRole("link", { name: /Bu varsayımla simüle et/ }).click();
  await expect(page).toHaveURL(/\/simulation/);
  await expect(page.getByTestId("sim-results")).toBeVisible();
  await expect(page.getByText(/eğitim ve ön fizibilite amaçlıdır/)).toBeVisible();
  await page.getByTestId("save-scenarios").click();
  await expect(page.getByText(/Kaydedildi/)).toBeVisible();

  await page.getByRole("link", { name: "Raporlar" }).first().click();
  await page.getByTestId("generate-report").click();
  await expect(page).toHaveURL(/\/reports\/RPT-|\/reports\/[\w-]+/);
  await expect(page.getByTestId("report-article")).toContainText("Kaynakça");
  await expect(page.getByTestId("print-pdf")).toBeVisible();
});

test("citizen report form validates required fields and submits", async ({ page }) => {
  await page.goto("/citizen-report");
  await page.getByTestId("submit-report").click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(await page.getByRole("alert").count()).toBeGreaterThanOrEqual(3);

  await page.getByLabel("İlçe *").selectOption("Başakşehir");
  await page.getByLabel("Olay türü *").selectOption("street");
  await page.getByLabel("Gözlem tarihi ve saati *").fill("2026-10-12T21:30");
  await page.getByLabel("Açıklama *").fill("E2E testi: cadde üzerinde yaklaşık 15 cm su birikti.");
  await page.getByLabel(/işlenmesini kabul ediyorum/).check();
  await page.getByTestId("submit-report").click();
  await expect(page.getByText("Bildiriminiz alındı")).toBeVisible();
});
