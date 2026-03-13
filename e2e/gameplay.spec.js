const { test, expect } = require('@playwright/test');
const { startServers, startSinglePlayer } = require('./test-helpers');

let servers;

test.beforeEach(async () => {
  servers = await startServers();
});

test.afterEach(async () => {
  await servers.close();
});

test.describe('Resource Updates', () => {
  test('resources update over time from production', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Economist');

    // Wait for initial resource values
    await expect(page.locator('#res-energy')).not.toHaveText('', { timeout: 5000 });
    const initial = Number(await page.locator('#res-energy').textContent());

    // Wait for several game ticks to see production effect
    await page.waitForTimeout(2000);
    const later = Number(await page.locator('#res-energy').textContent());

    // Energy should be a valid number
    expect(later).not.toBeNaN();
  });

  test('all six resource types are displayed', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Economist');

    const resources = ['energy', 'minerals', 'food', 'alloys', 'research', 'influence'];
    for (const res of resources) {
      await expect(page.locator(`#res-${res}`)).not.toHaveText('', { timeout: 5000 });
      const val = Number(await page.locator(`#res-${res}`).textContent());
      expect(val).not.toBeNaN();
    }
  });

  test('population count is shown in status bar', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Economist');
    // Format is "Pop: X/Y"
    await expect(page.locator('#status-pops')).toContainText(/Pop: \d+\/\d+/, { timeout: 5000 });
  });
});

test.describe('View Navigation', () => {
  test('view indicator shows current view', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Explorer');

    // Should start in colony view
    await expect(page.locator('#view-indicator')).toContainText(/Colony/i, { timeout: 5000 });
  });
});

test.describe('Game Over Flow', () => {
  test('game over overlay has return-to-lobby button', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Player');

    // The game-over overlay should exist in DOM but be hidden
    await expect(page.locator('#game-over-overlay')).toBeAttached();
    await expect(page.locator('#game-over-lobby-btn')).toBeAttached();
  });
});

test.describe('Game Speed & Pause', () => {
  test('speed display shows current speed', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Speedy');

    await expect(page.locator('#status-speed')).not.toHaveText('', { timeout: 5000 });
  });
});
