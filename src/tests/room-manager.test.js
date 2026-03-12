const { describe, it } = require('node:test');
const assert = require('node:assert');
const { RoomManager } = require('../../server/room-manager');

describe('RoomManager', () => {
  it('creates a room with host', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Test', 1, 'Alice');
    assert.strictEqual(room.name, 'Test');
    assert.strictEqual(room.hostId, 1);
    assert.strictEqual(room.players.size, 1);
    assert.strictEqual(room.status, 'waiting');
  });

  it('joins a room', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    const result = rm.joinRoom(roomId, 2, 'Bob');
    assert.ok(!result.error);
    assert.strictEqual(result.room.players.size, 2);
  });

  it('rejects join when full', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice', { maxPlayers: 2 });
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    const result = rm.joinRoom(roomId, 3, 'Charlie');
    assert.strictEqual(result.error, 'Room is full');
  });

  it('rejects double join', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    const result = rm.joinRoom(roomId, 2, 'Bob');
    assert.strictEqual(result.error, 'Already in a room');
  });

  it('removes empty room on last leave', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    const result = rm.leaveRoom(1);
    assert.ok(result.removed);
    assert.strictEqual(rm.listRooms().length, 0);
  });

  it('transfers host on host leave', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    rm.leaveRoom(1);
    const room = rm.getRoom(roomId);
    assert.strictEqual(room.hostId, 2);
  });

  it('toggles ready', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    const result = rm.toggleReady(2);
    assert.strictEqual(result.ready, true);
    const result2 = rm.toggleReady(2);
    assert.strictEqual(result2.ready, false);
  });

  it('can launch when all non-host are ready and >= 2 players', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    assert.ok(!rm.canLaunch(roomId));
    rm.toggleReady(2);
    assert.ok(rm.canLaunch(roomId));
  });

  it('rejects launch from non-host', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    rm.toggleReady(2);
    const result = rm.launchGame(roomId, 2);
    assert.strictEqual(result.error, 'Only host can launch');
  });

  it('launch sets status to playing', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    rm.toggleReady(2);
    const result = rm.launchGame(roomId, 1);
    assert.ok(!result.error);
    assert.strictEqual(result.room.status, 'playing');
  });

  it('rejects join to playing room', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice');
    const roomId = rm.listRooms()[0].id;
    rm.joinRoom(roomId, 2, 'Bob');
    rm.toggleReady(2);
    rm.launchGame(roomId, 1);
    const result = rm.joinRoom(roomId, 3, 'Charlie');
    assert.strictEqual(result.error, 'Game already started');
  });

  it('lists rooms', () => {
    const rm = new RoomManager();
    rm.createRoom('A', 1, 'Alice');
    rm.createRoom('B', 2, 'Bob');
    const list = rm.listRooms();
    assert.strictEqual(list.length, 2);
    assert.ok(list.some(r => r.name === 'A'));
    assert.ok(list.some(r => r.name === 'B'));
  });

  it('practice mode creates room with maxPlayers 1', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Practice', 1, 'Alice', { practiceMode: true });
    assert.strictEqual(room.practiceMode, true);
    assert.strictEqual(room.maxPlayers, 1);
  });

  it('practice mode canLaunch with solo host', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Practice', 1, 'Alice', { practiceMode: true });
    assert.ok(rm.canLaunch(room.id));
  });

  it('practice mode launches with solo host', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Practice', 1, 'Alice', { practiceMode: true });
    const result = rm.launchGame(room.id, 1);
    assert.ok(!result.error);
    assert.strictEqual(result.room.status, 'playing');
  });

  it('practice mode rejects second player joining', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Practice', 1, 'Alice', { practiceMode: true });
    const result = rm.joinRoom(room.id, 2, 'Bob');
    assert.strictEqual(result.error, 'Room is full');
  });

  it('practice mode appears in room list with practiceMode flag', () => {
    const rm = new RoomManager();
    rm.createRoom('Practice', 1, 'Alice', { practiceMode: true });
    const list = rm.listRooms();
    assert.strictEqual(list[0].practiceMode, true);
  });

  it('non-practice room still requires 2 players', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Normal', 1, 'Alice');
    assert.strictEqual(room.practiceMode, false);
    assert.ok(!rm.canLaunch(room.id));
  });
});

describe('RoomManager — Match Timer', () => {
  it('defaults to 10 minutes for practice mode', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Practice', 1, 'Alice', { practiceMode: true });
    assert.strictEqual(room.matchTimer, 10);
  });

  it('defaults to 20 minutes for multiplayer', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Multi', 1, 'Alice');
    assert.strictEqual(room.matchTimer, 20);
  });

  it('accepts valid matchTimer values (0, 10, 20, 30)', () => {
    const rm = new RoomManager();
    for (const val of [0, 10, 20, 30]) {
      const room = rm.createRoom(`Room${val}`, 1, 'Alice', { matchTimer: val });
      assert.strictEqual(room.matchTimer, val);
      rm.leaveRoom(1);
    }
  });

  it('rejects invalid matchTimer and uses default', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Bad', 1, 'Alice', { matchTimer: 99 });
    assert.strictEqual(room.matchTimer, 20); // default for multiplayer
  });

  it('matchTimer appears in room list', () => {
    const rm = new RoomManager();
    rm.createRoom('Test', 1, 'Alice', { matchTimer: 30 });
    const list = rm.listRooms();
    assert.strictEqual(list[0].matchTimer, 30);
  });

  it('matchTimer appears in serialized room', () => {
    const rm = new RoomManager();
    const room = rm.createRoom('Test', 1, 'Alice', { matchTimer: 10 });
    const data = rm.serializeRoom(room);
    assert.strictEqual(data.matchTimer, 10);
  });
});
