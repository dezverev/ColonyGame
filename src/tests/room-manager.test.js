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
});
