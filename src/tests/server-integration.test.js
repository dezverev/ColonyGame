const { describe, it } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { startServer } = require('../../server/server');

// Buffer messages from connection start to avoid race conditions
function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws._buffer = [];
    ws._waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const idx = ws._waiters.findIndex(w => w.pred(msg));
      if (idx >= 0) {
        const waiter = ws._waiters.splice(idx, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        ws._buffer.push(msg);
      }
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws, predicate, timeout = 5000) {
  // Check buffered messages first
  const idx = ws._buffer.findIndex(predicate);
  if (idx >= 0) return Promise.resolve(ws._buffer.splice(idx, 1)[0]);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws._waiters = ws._waiters.filter(w => w !== waiter);
      reject(new Error('Timeout waiting for message'));
    }, timeout);
    const waiter = { pred: predicate, resolve, timer };
    ws._waiters.push(waiter);
  });
}

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

describe('Server Integration', () => {
  it('starts server and accepts connections', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws = await connectWs(srv.port);
    t.after(() => ws.close());
    const welcome = await waitForMessage(ws, m => m.type === 'welcome');
    assert.ok(welcome.clientId);
  });

  it('full room lifecycle: create, join, ready, launch', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws1 = await connectWs(srv.port);
    const ws2 = await connectWs(srv.port);
    t.after(() => { ws1.close(); ws2.close(); });

    await waitForMessage(ws1, m => m.type === 'welcome');
    await waitForMessage(ws2, m => m.type === 'welcome');

    send(ws1, { type: 'setName', name: 'Alice' });
    send(ws2, { type: 'setName', name: 'Bob' });
    await waitForMessage(ws1, m => m.type === 'nameSet');
    await waitForMessage(ws2, m => m.type === 'nameSet');

    // Create room
    send(ws1, { type: 'createRoom', name: 'Test Room', maxPlayers: 4 });
    const joined1 = await waitForMessage(ws1, m => m.type === 'roomJoined');
    assert.strictEqual(joined1.room.name, 'Test Room');
    const roomId = joined1.room.id;

    // ws2 sees updated room list (skip the initial empty one)
    const list = await waitForMessage(ws2, m => m.type === 'roomList' && m.rooms.length > 0);
    assert.strictEqual(list.rooms[0].name, 'Test Room');

    // Join room
    send(ws2, { type: 'joinRoom', roomId });
    const joined2 = await waitForMessage(ws2, m => m.type === 'roomJoined');
    assert.strictEqual(joined2.room.players.length, 2);

    // Toggle ready
    send(ws2, { type: 'toggleReady' });
    const update = await waitForMessage(ws2, m =>
      m.type === 'roomUpdate' && m.room.players.some(p => p.name === 'Bob' && p.ready));
    const bob = update.room.players.find(p => p.name === 'Bob');
    assert.strictEqual(bob.ready, true);

    // Launch
    send(ws1, { type: 'launchGame' });
    const init1 = await waitForMessage(ws1, m => m.type === 'gameInit');
    const init2 = await waitForMessage(ws2, m => m.type === 'gameInit');
    assert.ok(init1.colonies.length >= 2);
    assert.ok(init2.colonies.length >= 2);
    assert.ok(init1.players.length >= 2);
  });

  it('buildDistrict command works via WebSocket', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws1 = await connectWs(srv.port);
    const ws2 = await connectWs(srv.port);
    t.after(() => { ws1.close(); ws2.close(); });

    await waitForMessage(ws1, m => m.type === 'welcome');
    await waitForMessage(ws2, m => m.type === 'welcome');

    send(ws1, { type: 'setName', name: 'Alice' });
    send(ws2, { type: 'setName', name: 'Bob' });
    await waitForMessage(ws1, m => m.type === 'nameSet');
    await waitForMessage(ws2, m => m.type === 'nameSet');

    send(ws1, { type: 'createRoom', name: 'Build Test', maxPlayers: 2 });
    const joined = await waitForMessage(ws1, m => m.type === 'roomJoined');
    send(ws2, { type: 'joinRoom', roomId: joined.room.id });
    await waitForMessage(ws2, m => m.type === 'roomJoined');
    send(ws2, { type: 'toggleReady' });
    await waitForMessage(ws2, m => m.type === 'roomUpdate');

    send(ws1, { type: 'launchGame' });
    const init = await waitForMessage(ws1, m => m.type === 'gameInit');

    // Find player 1's colony (ws1 is clientId 1)
    const myColony = init.colonies.find(c => c.ownerId === init.yourId);
    assert.ok(myColony, 'Should have a colony');

    // Build a housing district
    send(ws1, { type: 'buildDistrict', colonyId: myColony.id, districtType: 'housing' });

    // Wait for a gameState that shows the build queue
    const stateMsg = await waitForMessage(ws1, m => {
      if (m.type !== 'gameState') return false;
      const colony = m.colonies.find(c => c.id === myColony.id);
      return colony && colony.buildQueue.length > 0;
    });
    const colony = stateMsg.colonies.find(c => c.id === myColony.id);
    assert.strictEqual(colony.buildQueue[0].type, 'housing');
  });

  it('rejects buildDistrict on another players colony', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws1 = await connectWs(srv.port);
    const ws2 = await connectWs(srv.port);
    t.after(() => { ws1.close(); ws2.close(); });

    await waitForMessage(ws1, m => m.type === 'welcome');
    await waitForMessage(ws2, m => m.type === 'welcome');

    send(ws1, { type: 'setName', name: 'Alice' });
    send(ws2, { type: 'setName', name: 'Bob' });
    await waitForMessage(ws1, m => m.type === 'nameSet');
    await waitForMessage(ws2, m => m.type === 'nameSet');

    send(ws1, { type: 'createRoom', name: 'Ownership Test', maxPlayers: 2 });
    const joined = await waitForMessage(ws1, m => m.type === 'roomJoined');
    send(ws2, { type: 'joinRoom', roomId: joined.room.id });
    await waitForMessage(ws2, m => m.type === 'roomJoined');
    send(ws2, { type: 'toggleReady' });
    await waitForMessage(ws2, m => m.type === 'roomUpdate');

    send(ws1, { type: 'launchGame' });
    const init1 = await waitForMessage(ws1, m => m.type === 'gameInit');
    await waitForMessage(ws2, m => m.type === 'gameInit');

    // Player 1's colony
    const p1Colony = init1.colonies.find(c => c.ownerId === init1.yourId);

    // Player 2 tries to build on player 1's colony
    send(ws2, { type: 'buildDistrict', colonyId: p1Colony.id, districtType: 'housing' });

    // Should get an error
    const err = await waitForMessage(ws2, m => m.type === 'error');
    assert.ok(err.message);
  });

  it('cleans up game engine when all players disconnect', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws1 = await connectWs(srv.port);
    const ws2 = await connectWs(srv.port);

    await waitForMessage(ws1, m => m.type === 'welcome');
    await waitForMessage(ws2, m => m.type === 'welcome');

    send(ws1, { type: 'setName', name: 'Alice' });
    send(ws2, { type: 'setName', name: 'Bob' });
    await waitForMessage(ws1, m => m.type === 'nameSet');
    await waitForMessage(ws2, m => m.type === 'nameSet');

    send(ws1, { type: 'createRoom', name: 'Cleanup Test', maxPlayers: 2 });
    const joined = await waitForMessage(ws1, m => m.type === 'roomJoined');
    send(ws2, { type: 'joinRoom', roomId: joined.room.id });
    await waitForMessage(ws2, m => m.type === 'roomJoined');
    send(ws2, { type: 'toggleReady' });
    await waitForMessage(ws2, m => m.type === 'roomUpdate');

    send(ws1, { type: 'launchGame' });
    await waitForMessage(ws1, m => m.type === 'gameInit');
    await waitForMessage(ws2, m => m.type === 'gameInit');

    // Both players disconnect — engine should be stopped and cleaned up
    ws1.close();
    ws2.close();

    // Give server time to process disconnects
    await new Promise(r => setTimeout(r, 100));

    // Server should still be running (no crash from leaked intervals)
    const ws3 = await connectWs(srv.port);
    t.after(() => ws3.close());
    const welcome = await waitForMessage(ws3, m => m.type === 'welcome');
    assert.ok(welcome.clientId, 'Server still accepts connections after game cleanup');
  });

  it('practice mode: solo player can launch game', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws = await connectWs(srv.port);
    t.after(() => ws.close());

    await waitForMessage(ws, m => m.type === 'welcome');
    send(ws, { type: 'setName', name: 'Solo' });
    await waitForMessage(ws, m => m.type === 'nameSet');

    // Create practice room
    send(ws, { type: 'createRoom', name: 'Practice', practiceMode: true });
    const joined = await waitForMessage(ws, m => m.type === 'roomJoined');
    assert.strictEqual(joined.room.practiceMode, true);
    assert.strictEqual(joined.room.maxPlayers, 1);

    // Launch solo — no need for second player or ready check
    send(ws, { type: 'launchGame' });
    const init = await waitForMessage(ws, m => m.type === 'gameInit');
    assert.ok(init.colonies.length >= 1);
    assert.ok(init.yourId);
  });

  it('chat works within a room', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws1 = await connectWs(srv.port);
    const ws2 = await connectWs(srv.port);
    t.after(() => { ws1.close(); ws2.close(); });

    await waitForMessage(ws1, m => m.type === 'welcome');
    await waitForMessage(ws2, m => m.type === 'welcome');

    send(ws1, { type: 'setName', name: 'Alice' });
    await waitForMessage(ws1, m => m.type === 'nameSet');

    send(ws1, { type: 'createRoom', name: 'Chat Test' });
    const joined = await waitForMessage(ws1, m => m.type === 'roomJoined');
    send(ws2, { type: 'joinRoom', roomId: joined.room.id });
    await waitForMessage(ws2, m => m.type === 'roomJoined');

    send(ws1, { type: 'chat', text: 'Hello!' });
    const chatMsg = await waitForMessage(ws2, m => m.type === 'chat');
    assert.strictEqual(chatMsg.text, 'Hello!');
    assert.strictEqual(chatMsg.from, 'Alice');
  });

  it('game speed controls via protocol', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws = await connectWs(srv.port);
    t.after(() => ws.close());
    await waitForMessage(ws, m => m.type === 'welcome');

    // Create practice room (single-player) and launch
    send(ws, { type: 'createRoom', name: 'Speed Test', practiceMode: true });
    await waitForMessage(ws, m => m.type === 'roomJoined');
    send(ws, { type: 'launchGame' });
    const init = await waitForMessage(ws, m => m.type === 'gameInit');
    assert.strictEqual(init.gameSpeed, 2, 'Default speed should be 2');
    assert.strictEqual(init.paused, false);

    // Change speed
    send(ws, { type: 'setGameSpeed', speed: 4 });
    const speedMsg = await waitForMessage(ws, m => m.type === 'speedChanged');
    assert.strictEqual(speedMsg.speed, 4);
    assert.strictEqual(speedMsg.speedLabel, '3x');
    assert.strictEqual(speedMsg.paused, false);

    // Pause
    send(ws, { type: 'togglePause' });
    const pauseMsg = await waitForMessage(ws, m => m.type === 'speedChanged');
    assert.strictEqual(pauseMsg.paused, true);
    assert.strictEqual(pauseMsg.speed, 4);

    // Unpause
    send(ws, { type: 'togglePause' });
    const unpauseMsg = await waitForMessage(ws, m => m.type === 'speedChanged');
    assert.strictEqual(unpauseMsg.paused, false);
  });

  it('non-host cannot change speed in multiplayer', async (t) => {
    const srv = await startServer({ port: 0, log: false });
    t.after(() => srv.close());

    const ws1 = await connectWs(srv.port);
    const ws2 = await connectWs(srv.port);
    t.after(() => { ws1.close(); ws2.close(); });
    await waitForMessage(ws1, m => m.type === 'welcome');
    await waitForMessage(ws2, m => m.type === 'welcome');

    // Host creates room (not practice mode)
    send(ws1, { type: 'createRoom', name: 'MP Speed' });
    const joined = await waitForMessage(ws1, m => m.type === 'roomJoined');
    const roomId = joined.room.id;

    send(ws2, { type: 'joinRoom', roomId });
    await waitForMessage(ws2, m => m.type === 'roomJoined');

    // Both ready and launch
    send(ws2, { type: 'toggleReady' });
    await waitForMessage(ws1, m => m.type === 'roomUpdate');
    send(ws1, { type: 'launchGame' });
    await waitForMessage(ws1, m => m.type === 'gameInit');
    await waitForMessage(ws2, m => m.type === 'gameInit');

    // Non-host tries to change speed — should get error
    send(ws2, { type: 'setGameSpeed', speed: 5 });
    const errMsg = await waitForMessage(ws2, m => m.type === 'error');
    assert.ok(errMsg.message.includes('host'));

    // Non-host tries to pause — should get error
    send(ws2, { type: 'togglePause' });
    const errMsg2 = await waitForMessage(ws2, m => m.type === 'error');
    assert.ok(errMsg2.message.includes('host'));
  });
});
