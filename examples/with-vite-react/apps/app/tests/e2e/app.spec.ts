import { expect, test } from '@playwright/test';

test('the button counts clicks', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button');
  await expect(button).toHaveText('Clicked 0 times');
  await button.click();
  await expect(button).toHaveText('Clicked 1 times');
});
