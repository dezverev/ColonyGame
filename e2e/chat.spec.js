const { test, expect } = require('@playwright/test');
const { startServers, enterLobby, createRoom, startSinglePlayer } = require('./test-helpers');

let servers;

test.beforeEach(async () => {
  servers = await startServers();
});

test.afterEach(async () => {
  await servers.close();
});

test.describe('Room Chat', () => {
  test('chat message appears for both players', async ({ page, browser }) => {
    // Alice creates room
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'Chat Room');

    // Bob joins
    const page2 = await browser.newPage();
    await enterLobby(page2, servers, 'Bob');
    await page2.locator('#room-list').getByText('Chat Room').click();
    await expect(page2.locator('#room-screen')).toHaveClass(/active/, { timeout: 5000 });

    // Alice sends a chat message
    await page.fill('#chat-input', 'Hello Bob!');
    await page.press('#chat-input', 'Enter');

    // Both should see the message
    await expect(page.locator('#chat-messages')).toContainText('Hello Bob!', { timeout: 5000 });
    await expect(page2.locator('#chat-messages')).toContainText('Hello Bob!', { timeout: 5000 });

    // Bob replies
    await page2.fill('#chat-input', 'Hi Alice!');
    await page2.press('#chat-input', 'Enter');

    await expect(page.locator('#chat-messages')).toContainText('Hi Alice!', { timeout: 5000 });
    await expect(page2.locator('#chat-messages')).toContainText('Hi Alice!', { timeout: 5000 });

    await page2.close();
  });
});

test.describe('In-Game Chat', () => {
  test('game chat messages are exchanged between players', async ({ page, browser }) => {
    // Setup: two players in a game
    await enterLobby(page, servers, 'Alice');
    await createRoom(page, 'Game Chat');

    const page2 = await browser.newPage();
    await enterLobby(page2, servers, 'Bob');
    await page2.locator('#room-list').getByText('Game Chat').click();
    await expect(page2.locator('#room-screen')).toHaveClass(/active/, { timeout: 5000 });

    await page.click('#ready-btn');
    await page2.click('#ready-btn');
    await expect(page.locator('#launch-btn')).not.toHaveClass(/hidden/, { timeout: 5000 });
    await page.click('#launch-btn');

    await expect(page.locator('#game-screen')).toHaveClass(/active/, { timeout: 10000 });
    await expect(page2.locator('#game-screen')).toHaveClass(/active/, { timeout: 10000 });

    // Send in-game chat
    await page.fill('#game-chat-input', 'glhf');
    await page.press('#game-chat-input', 'Enter');

    await expect(page.locator('#game-chat-messages')).toContainText('glhf', { timeout: 5000 });
    await expect(page2.locator('#game-chat-messages')).toContainText('glhf', { timeout: 5000 });

    await page2.close();
  });
});
