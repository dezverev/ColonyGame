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
});
