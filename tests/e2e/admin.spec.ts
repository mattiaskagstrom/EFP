import { expect, test } from '@playwright/test';

test('@smoke admin starts and shows investigation picker', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Administratör/ }).click();
  await expect(page.getByRole('heading', { name: 'Välj sökinsats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skapa sökinsats' })).toBeVisible();
});

test('@critical user can create and open an investigation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Administratör/ }).click();
  await page.getByPlaceholder('Namn på ny sökinsats').fill(`E2E ${Date.now()}`);
  await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sektorer', exact: true })).toBeVisible();
  const userUrl = page.url().replace('/admin/', '/user/');
  await page.goto(userUrl);
  await expect(page).toHaveURL(/\/user\/investigations\//);
  await expect(page.getByText('Användarläge', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toHaveCount(0);
});

test('@smoke user role does not offer investigation creation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Användare/ }).click();
  await expect(page).toHaveURL(/\/user$/);
  await expect(page.getByRole('button', { name: 'Skapa sökinsats' })).toHaveCount(0);
});

test('@full sector panel can be collapsed and searched', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Administratör/ }).click();
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
