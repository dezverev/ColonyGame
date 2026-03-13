/**
 * E2E test helpers — start/stop both servers per test, provide page utilities.
 */
const { startServer } = require('../server/server');
const { startStaticServer } = require('../src/dev-client-server');

/**
 * Start both game and static servers on ephemeral ports.
 * Returns { gamePort, clientPort, gameUrl, close() }
 */
async function startServers() {
  const [game, client] = await Promise.all([
    startServer({ port: 0, log: false }),
    startStaticServer({ port: 0, silent: true }),
  ]);
  return {
    gamePort: game.port,
    clientPort: client.port,
    gameUrl: `http://localhost:${client.port}?gamePort=${game.port}`,
    async close() {
      await Promise.all([game.close(), client.close()]);
    },
  };
}

/**
 * Navigate to the game and enter a player name, landing on the lobby screen.
 */
async function enterLobby(page, servers, name = 'TestPlayer') {
  await page.goto(servers.gameUrl);
  await page.waitForSelector('#name-screen.active', { timeout: 5000 });
  await page.fill('#name-input', name);
  await page.click('#name-submit');
  await page.waitForSelector('#lobby-screen.active', { timeout: 5000 });
}

/**
 * From the lobby, create a room and wait for room screen.
 */
async function createRoom(page, roomName = 'Test Room') {
  await page.click('#create-room-btn');
  // Dialog uses hidden class removal, not active class
  await page.waitForSelector('#create-room-dialog:not(.hidden)', { timeout: 3000 });
  await page.fill('#room-name-input', roomName);
  await page.click('#room-create-confirm');
  await page.waitForSelector('#room-screen.active', { timeout: 5000 });
}

/**
 * Start a single-player game from the lobby. Handles the practice-mode room flow.
 * Returns once the game screen is active.
 */
async function startSinglePlayer(page, servers, name = 'Solo') {
  await enterLobby(page, servers, name);
  await page.click('#single-player-btn');
  // Single player creates a practice room → room screen with launch button visible
  await page.waitForSelector('#room-screen.active', { timeout: 5000 });
  await page.click('#launch-btn');
  await page.waitForSelector('#game-screen.active', { timeout: 10000 });
}

module.exports = { startServers, enterLobby, createRoom, startSinglePlayer };
