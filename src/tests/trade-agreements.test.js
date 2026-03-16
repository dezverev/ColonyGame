const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  TRADE_AGREEMENT_INFLUENCE_COST, TRADE_AGREEMENT_ENERGY_BONUS, TRADE_AGREEMENT_MINERAL_BONUS,
  DIPLOMACY_STANCES, DIPLOMACY_INFLUENCE_COST,
} = require('../../server/game-engine');

// Helper: create a 2-player game engine
function createEngine(opts = {}) {
  const players = new Map();
  players.set('p1', { name: 'Player 1' });
  players.set('p2', { name: 'Player 2' });
  if (opts.threePlayer) {
    players.set('p3', { name: 'Player 3' });
  }
  const room = { players, galaxySize: 'small', matchTimer: 0 };
  const engine = new GameEngine(room, { tickRate: 10 });
  return engine;
}

// Helper: give player enough resources
function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
  state.resources.influence = 1000;
}

// Helper: get first colony for a player
function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId);
  if (!colonyIds || colonyIds.length === 0) return null;
  return engine.colonies.get(colonyIds[0]);
}

// Helper: form a trade agreement between two players
function formTradeAgreement(engine, pid1, pid2) {
  giveResources(engine, pid1);
  giveResources(engine, pid2);
  engine.handleCommand(pid1, { type: 'proposeTradeAgreement', targetPlayerId: pid2 });
  engine.handleCommand(pid2, { type: 'acceptTradeAgreement', targetPlayerId: pid1 });
}

describe('Trade Agreements', () => {
  describe('Constants', () => {
    it('should have correct constant values', () => {
      assert.strictEqual(TRADE_AGREEMENT_INFLUENCE_COST, 25);
      assert.strictEqual(TRADE_AGREEMENT_ENERGY_BONUS, 0.15);
      assert.strictEqual(TRADE_AGREEMENT_MINERAL_BONUS, 0.15);
    });
  });

  describe('Proposal', () => {
    it('should allow proposing a trade agreement', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.deepStrictEqual(result, { ok: true });
      const state = engine.playerStates.get('p1');
      assert.ok(state.pendingTradeAgreements.has('p2'));
    });

    it('should deduct influence from proposer', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const before = engine.playerStates.get('p1').resources.influence;
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      const after = engine.playerStates.get('p1').resources.influence;
      assert.strictEqual(before - after, TRADE_AGREEMENT_INFLUENCE_COST);
    });

    it('should reject proposal to self', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error);
    });

    it('should reject proposal without enough influence', () => {
      const engine = createEngine();
      const state = engine.playerStates.get('p1');
      state.resources.influence = 0;
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(result.error);
      assert.ok(result.error.includes('influence'));
    });

    it('should reject duplicate proposal', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(result.error);
      assert.ok(result.error.includes('already proposed'));
    });

    it('should reject proposal to hostile player', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(result.error);
      assert.ok(result.error.includes('hostile'));
    });

    it('should reject proposal to nonexistent player', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p_nonexistent' });
      assert.ok(result.error);
    });

    it('should reject proposal without targetPlayerId', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement' });
      assert.ok(result.error);
    });
  });

  describe('Acceptance', () => {
    it('should form agreement when accepted', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      const state1 = engine.playerStates.get('p1');
      const state2 = engine.playerStates.get('p2');
      assert.ok(state1.tradeAgreements.has('p2'));
      assert.ok(state2.tradeAgreements.has('p1'));
    });

    it('should deduct influence from acceptor', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      const before = engine.playerStates.get('p2').resources.influence;
      engine.handleCommand('p2', { type: 'acceptTradeAgreement', targetPlayerId: 'p1' });
      const after = engine.playerStates.get('p2').resources.influence;
      assert.strictEqual(before - after, TRADE_AGREEMENT_INFLUENCE_COST);
    });

    it('should reject acceptance without pending proposal', () => {
      const engine = createEngine();
      giveResources(engine, 'p2');
      const result = engine.handleCommand('p2', { type: 'acceptTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error);
      assert.ok(result.error.includes('No pending'));
    });

    it('should reject acceptance without enough influence', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      const state2 = engine.playerStates.get('p2');
      state2.resources.influence = 0;
      const result = engine.handleCommand('p2', { type: 'acceptTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error);
      assert.ok(result.error.includes('influence'));
    });

    it('should clear pending proposals after acceptance', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      const state1 = engine.playerStates.get('p1');
      const state2 = engine.playerStates.get('p2');
      assert.strictEqual(state1.pendingTradeAgreements.size, 0);
      assert.strictEqual(state2.pendingTradeAgreements.size, 0);
    });
  });

  describe('Mutual proposal auto-accept', () => {
    it('should auto-form agreement when both players propose', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      engine.handleCommand('p2', { type: 'proposeTradeAgreement', targetPlayerId: 'p1' });
      const state1 = engine.playerStates.get('p1');
      const state2 = engine.playerStates.get('p2');
      assert.ok(state1.tradeAgreements.has('p2'));
      assert.ok(state2.tradeAgreements.has('p1'));
      assert.strictEqual(state1.pendingTradeAgreements.size, 0);
      assert.strictEqual(state2.pendingTradeAgreements.size, 0);
    });
  });

  describe('Cancellation', () => {
    it('should cancel an active trade agreement', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      const result = engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });
      assert.deepStrictEqual(result, { ok: true });
      const state1 = engine.playerStates.get('p1');
      const state2 = engine.playerStates.get('p2');
      assert.ok(!state1.tradeAgreements.has('p2'));
      assert.ok(!state2.tradeAgreements.has('p1'));
    });

    it('should cancel a pending proposal', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      const result = engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });
      assert.deepStrictEqual(result, { ok: true });
      assert.ok(!engine.playerStates.get('p1').pendingTradeAgreements.has('p2'));
    });

    it('should reject cancel when no agreement or proposal exists', () => {
      const engine = createEngine();
      const result = engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(result.error);
    });

    it('should reject proposal if agreement already active', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(result.error);
      assert.ok(result.error.includes('already active'));
    });
  });

  describe('Production bonus', () => {
    it('should apply +15% energy bonus with active trade agreement', () => {
      const engine = createEngine();
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return; // skip if no colony

      // Get baseline production
      const baseProd = engine._calcProduction(colony);
      const baseEnergy = baseProd.production.energy;

      // Form trade agreement
      formTradeAgreement(engine, 'p1', 'p2');
      colony._cachedProduction = null; // invalidate cache

      const tradeProd = engine._calcProduction(colony);
      if (baseEnergy > 0) {
        const expected = Math.round(baseEnergy * (1 + TRADE_AGREEMENT_ENERGY_BONUS) * 100) / 100;
        assert.strictEqual(tradeProd.production.energy, expected);
      }
    });

    it('should apply +15% mineral bonus with active trade agreement', () => {
      const engine = createEngine();
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return;

      // Add a mining district for mineral production
      colony.districts.push({ type: 'mining', disabled: false });
      colony._cachedProduction = null;
      const baseProd = engine._calcProduction(colony);
      const baseMinerals = baseProd.production.minerals;

      formTradeAgreement(engine, 'p1', 'p2');
      colony._cachedProduction = null;

      const tradeProd = engine._calcProduction(colony);
      if (baseMinerals > 0) {
        const expected = Math.round(baseMinerals * (1 + TRADE_AGREEMENT_MINERAL_BONUS) * 100) / 100;
        assert.strictEqual(tradeProd.production.minerals, expected);
      }
    });

    it('should stack bonus with multiple trade partners', () => {
      const engine = createEngine({ threePlayer: true });
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return;

      colony._cachedProduction = null;
      const baseProd = engine._calcProduction(colony);
      const baseEnergy = baseProd.production.energy;

      formTradeAgreement(engine, 'p1', 'p2');
      formTradeAgreement(engine, 'p1', 'p3');
      colony._cachedProduction = null;

      const tradeProd = engine._calcProduction(colony);
      if (baseEnergy > 0) {
        // 2 partners = +30%
        const expected = Math.round(baseEnergy * (1 + TRADE_AGREEMENT_ENERGY_BONUS * 2) * 100) / 100;
        assert.strictEqual(tradeProd.production.energy, expected);
      }
    });

    it('should remove bonus when agreement is cancelled', () => {
      const engine = createEngine();
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return;

      colony._cachedProduction = null;
      const baseProd = engine._calcProduction(colony);
      const baseEnergy = baseProd.production.energy;

      formTradeAgreement(engine, 'p1', 'p2');
      engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });
      colony._cachedProduction = null;

      const afterProd = engine._calcProduction(colony);
      assert.strictEqual(afterProd.production.energy, baseEnergy);
    });
  });

  describe('Breaks on aggression', () => {
    it('should break trade agreement when player goes hostile', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      assert.ok(engine.playerStates.get('p1').tradeAgreements.has('p2'));

      giveResources(engine, 'p1');
      // Ensure diplomacy entry exists and clear cooldown
      const state1 = engine.playerStates.get('p1');
      if (!state1.diplomacy['p2']) state1.diplomacy['p2'] = { stance: 'neutral', cooldownTick: 0 };
      else state1.diplomacy['p2'].cooldownTick = 0;
      engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });

      assert.ok(!engine.playerStates.get('p1').tradeAgreements.has('p2'));
      assert.ok(!engine.playerStates.get('p2').tradeAgreements.has('p1'));
    });

    it('should break trade agreement when target goes hostile', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');

      giveResources(engine, 'p2');
      engine.playerStates.get('p2').diplomacy['p1'] = { stance: 'neutral', cooldownTick: 0 };
      engine.handleCommand('p2', { type: 'setDiplomacy', targetPlayerId: 'p1', stance: 'hostile' });

      assert.ok(!engine.playerStates.get('p1').tradeAgreements.has('p2'));
      assert.ok(!engine.playerStates.get('p2').tradeAgreements.has('p1'));
    });

    it('should clear pending proposals on hostility', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(engine.playerStates.get('p1').pendingTradeAgreements.has('p2'));

      // Clear diplomacy cooldown
      const state1 = engine.playerStates.get('p1');
      if (state1.diplomacy['p2']) state1.diplomacy['p2'].cooldownTick = 0;
      engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });

      assert.ok(!engine.playerStates.get('p1').pendingTradeAgreements.has('p2'));
    });
  });

  describe('Serialization', () => {
    it('should include trade agreements in diplomacy serialization', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');

      const diplomacy = engine._serializeDiplomacy('p1');
      assert.ok(Array.isArray(diplomacy.tradeAgreements));
      assert.ok(diplomacy.tradeAgreements.includes('p2'));
    });

    it('should include pending trade agreements in diplomacy serialization', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });

      const diplomacy = engine._serializeDiplomacy('p1');
      assert.ok(Array.isArray(diplomacy.pendingTradeAgreements));
      assert.ok(diplomacy.pendingTradeAgreements.includes('p2'));
    });
  });

  describe('Events', () => {
    it('should emit tradeAgreementProposed event to target', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });

      const events = engine._pendingEvents;
      const proposed = events.find(e => e.eventType === 'tradeAgreementProposed' && e.playerId === 'p2');
      assert.ok(proposed, 'Should emit tradeAgreementProposed event');
      assert.strictEqual(proposed.fromId, 'p1');
    });

    it('should emit tradeAgreementFormed event to both players', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');

      const events = engine._pendingEvents;
      const formed1 = events.find(e => e.eventType === 'tradeAgreementFormed' && e.playerId === 'p1');
      const formed2 = events.find(e => e.eventType === 'tradeAgreementFormed' && e.playerId === 'p2');
      assert.ok(formed1, 'Should emit tradeAgreementFormed to proposer');
      assert.ok(formed2, 'Should emit tradeAgreementFormed to acceptor');
    });

    it('should emit tradeAgreementBroken event on hostility', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      // Clear events
      engine._pendingEvents = [];

      giveResources(engine, 'p1');
      const state1 = engine.playerStates.get('p1');
      if (!state1.diplomacy['p2']) state1.diplomacy['p2'] = { stance: 'neutral', cooldownTick: 0 };
      else state1.diplomacy['p2'].cooldownTick = 0;
      engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });

      const events = engine._pendingEvents;
      const broken1 = events.find(e => e.eventType === 'tradeAgreementBroken' && e.playerId === 'p1');
      const broken2 = events.find(e => e.eventType === 'tradeAgreementBroken' && e.playerId === 'p2');
      assert.ok(broken1, 'Should emit tradeAgreementBroken to aggressor');
      assert.ok(broken2, 'Should emit tradeAgreementBroken to target');
      assert.strictEqual(broken1.reason, 'aggression');
    });
  });
});
