module.exports = {
  GAME_PORT: parseInt(process.env.GAME_PORT || '4001', 10),
  CLIENT_PORT: parseInt(process.env.CLIENT_PORT || '4000', 10),
  TICK_RATE: 10, // Hz — game state updates per second
  MAX_ROOMS: 20,
  MAX_PLAYERS_PER_ROOM: 8,
};
