import { expect, test } from '@playwright/test';

test('@smoke admin starts and shows investigation picker', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Välj sökinsats' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skapa sökinsats' })).toBeVisible();
});

test('@critical user can create and open an investigation', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Namn på ny sökinsats').fill(`E2E ${Date.now()}`);
  await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
  await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Zoner' })).toBeVisible();
});

test('@full zone panel can be collapsed and searched', async ({ page }) => {
  await page.goto('/');
  let investigation = page.locator('.investigation-list button').first();
  if (await page.locator('.investigation-list button').count() === 0) {
    await page.getByPlaceholder('Namn på ny sökinsats').fill(`E2E ${Date.now()}`);
    await page.getByRole('button', { name: 'Skapa sökinsats' }).click();
    await expect(page.getByRole('button', { name: 'Spara ändringar' })).toBeVisible();
  } else {
    await expect(investigation).toBeVisible();
    await investigation.click();
  }
  await page.getByRole('button', { name: /Zoner/ }).click();
  await expect(page.getByPlaceholder('Sök zon-namn')).toBeHidden();
  await page.getByRole('button', { name: /Zoner/ }).click();
  await expect(page.getByPlaceholder('Sök zon-namn')).toBeVisible();
});
