import { expect, test, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Administratör/ }).click();
  await page.getByRole('button', { name: /Registrera nytt Admin-konto/ }).click();
  const username = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.getByLabel('Användarnamn').fill(username);
  await page.getByLabel('Lösenord').fill('E2E-Password-2026');
  await page.getByRole('button', { name: 'Registrera', exact: true }).click();
  await expect(page.getByText('Kontot skapades. Logga in för att fortsätta.')).toBeVisible();
  await page.getByLabel('Lösenord').fill('E2E-Password-2026');
  await page.getByRole('button', { name: 'Logga in', exact: true }).click();
}

test('@smoke admin starts and shows investigation picker', async ({ page }) => {
  await loginAsAdmin(page);
  await expect(page.getByRole('heading', { name: 'Välj sökinsats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skapa sökinsats' })).toBeVisible();
});

test('@critical user can create and open an investigation', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByPlaceholder('Namn på ny sökinsats').fill(`E2E ${Date.now()}`);
  await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sektorer', exact: true })).toBeVisible();
  const userUrl = page.url().replace('/admin/', '/user/');
  await page.goto(userUrl);
  await expect(page).toHaveURL(/\/user\/investigations\//);
  await page.getByLabel('Anropsnamn').fill('E2E Alfa');
  await page.getByRole('button', { name: 'Anslut' }).click();
  await expect(page.getByText('Användarläge', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toHaveCount(0);
});

test('@smoke user role does not offer investigation creation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Användare/ }).click();
  await expect(page).toHaveURL(/\/user$/);
  await expect(page.getByRole('button', { name: 'Skapa sökinsats' })).toHaveCount(0);
});

test('@smoke mobile start page hides the administrator choice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Administratör/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Användare/ })).toBeVisible();
});

test('@critical investigation picker has a scrollable page', async ({ page }) => {
  await loginAsAdmin(page);
  const selectionScreen = page.locator('.selection-screen');
  await expect(selectionScreen).toHaveCSS('overflow-y', 'auto');
  expect(await selectionScreen.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
});

test('@critical user investigation view has a scrollable page', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByPlaceholder('Namn på ny sökinsats').fill(`Scroll E2E ${Date.now()}`);
  await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  await page.goto(page.url().replace('/admin/', '/user/'));
  await page.getByLabel('Anropsnamn').fill('E2E Alfa');
  await page.getByRole('button', { name: 'Anslut' }).click();
  const userShell = page.locator('.user-shell');
  await expect(userShell).toHaveCSS('overflow-y', 'auto');
  expect(await userShell.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
});

test('@full sector panel can be collapsed and searched', async ({ page }) => {
  await loginAsAdmin(page);
  let investigation = page.locator('.investigation-list button').first();
  if (await page.locator('.investigation-list button').count() === 0) {
    await page.getByPlaceholder('Namn på ny sökinsats').fill(`E2E ${Date.now()}`);
    await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
    await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  } else {
    await expect(investigation).toBeVisible();
    await investigation.click();
  }
  await page.getByRole('button', { name: /Sektorer/ }).click();
  await expect(page.getByPlaceholder('Sök sektor-namn')).toBeHidden();
  await page.getByRole('button', { name: /Sektorer/ }).click();
  await expect(page.getByPlaceholder('Sök sektor-namn')).toBeVisible();
});

test('@critical admin sector list has its own scroll area', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByPlaceholder('Namn på ny sökinsats').fill(`Sector scroll E2E ${Date.now()}`);
  await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  const sectorList = page.locator('.sector-list');
  await expect(sectorList).toHaveCSS('overflow-y', 'auto');
  await expect(sectorList).toHaveCSS('max-height', '288px');
});
