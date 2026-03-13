const { test, expect } = require('@playwright/test');
const { startServers, enterLobby, createRoom, startSinglePlayer } = require('./test-helpers');

let servers;

test.beforeEach(async () => {
  servers = await startServers();
});

test.afterEach(async () => {
  await servers.close();
});

test.describe('Single Player Game', () => {
  test('single player button launches game via practice room', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Solo');
    // If we got here, game screen is active (startSinglePlayer asserts it)
    await expect(page.locator('#game-screen')).toHaveClass(/active/);
  });

  test('game screen shows resource bar with values', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Solo');

    // Wait for first gameState to populate resource display
    await expect(page.locator('#res-energy')).not.toHaveText('', { timeout: 5000 });
    await expect(page.locator('#res-minerals')).not.toHaveText('', { timeout: 5000 });

    // Starting resources should be reasonable numbers (not 0 or NaN)
    const energy = await page.locator('#res-energy').textContent();
    expect(Number(energy)).toBeGreaterThan(0);
  });

  test('game screen shows status bar with month and VP', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Solo');

    // Month should appear
    await expect(page.locator('#status-month')).not.toHaveText('', { timeout: 5000 });
  });

  test('colony panel shows colony info', async ({ page }) => {
    await startSinglePlayer(page, servers, 'Solo');

    // Colony panel should eventually have content (colony name, pops, etc.)
    await expect(page.locator('#colony-panel')).not.toBeEmpty({ timeout: 5000 });
  });
});

test.describe('Multiplayer Game Launch', () => {
  test('two players ready up and host launches game', async ({ page, browser }) => {
    // Alice creates room
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'MP Game');

    // Bob joins
    const page2 = await browser.newPage();
    await enterLobby(page2, servers, 'Bob');
    await page2.locator('#room-list').getByText('MP Game').click();
    await expect(page2.locator('#room-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Both ready up
    await page.click('#ready-btn');
    await page2.click('#ready-btn');

    // Wait for launch button to appear (all ready + enough players)
    await expect(page.locator('#launch-btn')).not.toHaveClass(/hidden/, { timeout: 5000 });

    // Host (Alice) launches
    await page.click('#launch-btn');

    // Both should transition to game screen
    await expect(page.locator('#game-screen')).toHaveClass(/active/, { timeout: 10000 });
    await expect(page2.locator('#game-screen')).toHaveClass(/active/, { timeout: 10000 });

    // Both should see resources
    await expect(page.locator('#res-energy')).not.toHaveText('', { timeout: 5000 });
    await expect(page2.locator('#res-energy')).not.toHaveText('', { timeout: 5000 });

    await page2.close();
  });
});
