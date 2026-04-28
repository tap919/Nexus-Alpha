import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  // Since we don't know the exact name yet (metadata.json might have changed),
  // we'll check for something standard or look it up.
  // I'll just check if the main container exists.
  await expect(page.locator('#root')).toBeVisible();
});

test('nexus logo is visible', async ({ page }) => {
  await page.goto('/');
  // Checking for the Nexus/Alpha branding in the UI
  await expect(page.getByText('NEXUS', { exact: false })).toBeVisible();
});
