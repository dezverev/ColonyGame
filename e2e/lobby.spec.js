const { test, expect } = require('@playwright/test');
const { startServers, enterLobby, createRoom } = require('./test-helpers');

let servers;

test.beforeEach(async () => {
  servers = await startServers();
});

test.afterEach(async () => {
  await servers.close();
});

test.describe('Lobby Flow', () => {
  test('name entry transitions to lobby', async ({ page }) => {
    await page.goto(servers.gameUrl);
    await page.waitForSelector('#name-screen.active');

    // Name screen is visible, lobby is not
    await expect(page.locator('#lobby-screen')).not.toHaveClass(/active/);

    await page.fill('#name-input', 'Alice');
    await page.click('#name-submit');

    // Should transition to lobby
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#player-name-display')).toContainText('Alice');
  });

  test('name entry works with Enter key', async ({ page }) => {
    await page.goto(servers.gameUrl);
    await page.waitForSelector('#name-screen.active');
    await page.fill('#name-input', 'Bob');
    await page.press('#name-input', 'Enter');
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('create room and see room screen', async ({ page }) => {
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'My Room');

    // Should be on room screen with room title
    await expect(page.locator('#room-screen')).toHaveClass(/active/);
    await expect(page.locator('#room-title')).toContainText('My Room');
  });

  test('room appears in lobby room list for another player', async ({ page, browser }) => {
    // Player 1 creates a room
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'Public Room');

    // Player 2 joins lobby and sees the room
    const page2 = await browser.newPage();
    await enterLobby(page2, servers, 'Bob');

    // Room should appear in the room list
    await expect(page2.locator('#room-list')).toContainText('Public Room', { timeout: 5000 });

    await page2.close();
  });

  test('leave room returns to lobby', async ({ page }) => {
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'Temp Room');
    await expect(page.locator('#room-screen')).toHaveClass(/active/);

    await page.click('#leave-room-btn');
    await expect(page.locator('#lobby-screen')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('player can join existing room', async ({ page, browser }) => {
    // Alice creates a room
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'Join Test');

    // Bob joins the room from lobby
    const page2 = await browser.newPage();
    await enterLobby(page2, servers, 'Bob');
    // Click the room entry in the room list
    await page2.locator('#room-list').getByText('Join Test').click();
    await expect(page2.locator('#room-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Both players should see each other in the player list
    await expect(page.locator('#player-list')).toContainText('Bob', { timeout: 5000 });
    await expect(page2.locator('#player-list')).toContainText('Alice', { timeout: 5000 });

    await page2.close();
  });
});
