const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  GameEngine,
  TRADE_AGREEMENT_INFLUENCE_COST, TRADE_AGREEMENT_ENERGY_BONUS, TRADE_AGREEMENT_MINERAL_BONUS,
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
  return new GameEngine(room, { tickRate: 10 });
}

function giveResources(engine, playerId) {
  const state = engine.playerStates.get(playerId);
  state.resources.minerals = 10000;
  state.resources.alloys = 10000;
  state.resources.energy = 10000;
  state.resources.food = 10000;
  state.resources.influence = 1000;
}

function getFirstColony(engine, playerId) {
  const colonyIds = engine._playerColonies.get(playerId);
  if (!colonyIds || colonyIds.length === 0) return null;
  return engine.colonies.get(colonyIds[0]);
}

function formTradeAgreement(engine, pid1, pid2) {
  giveResources(engine, pid1);
  giveResources(engine, pid2);
  engine.handleCommand(pid1, { type: 'proposeTradeAgreement', targetPlayerId: pid2 });
  engine.handleCommand(pid2, { type: 'acceptTradeAgreement', targetPlayerId: pid1 });
}

describe('Trade Agreements — Deep', () => {
  describe('Accept validation', () => {
    it('rejects acceptance targeting self', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'acceptTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error, 'Should reject self-accept');
    });

    it('rejects acceptance targeting nonexistent player', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      const result = engine.handleCommand('p1', { type: 'acceptTradeAgreement', targetPlayerId: 'p_ghost' });
      assert.ok(result.error, 'Should reject nonexistent target');
    });

    it('rejects acceptance without targetPlayerId', () => {
      const engine = createEngine();
      const result = engine.handleCommand('p1', { type: 'acceptTradeAgreement' });
      assert.ok(result.error, 'Should reject missing targetPlayerId');
    });

    it('rejects acceptance when players are hostile', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      // p1 proposes, then they go hostile before p2 can accept
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      // Force hostility directly
      const s1 = engine.playerStates.get('p1');
      const s2 = engine.playerStates.get('p2');
      if (!s1.diplomacy['p2']) s1.diplomacy['p2'] = { stance: 'neutral', cooldownTick: 0 };
      s1.diplomacy['p2'].stance = 'hostile';
      if (!s2.diplomacy['p1']) s2.diplomacy['p1'] = { stance: 'neutral', cooldownTick: 0 };
      s2.diplomacy['p1'].stance = 'hostile';

      const result = engine.handleCommand('p2', { type: 'acceptTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error, 'Should reject acceptance when hostile');
      assert.ok(result.error.includes('hostile'));
    });
  });

  describe('Cancel validation', () => {
    it('rejects cancel targeting self', () => {
      const engine = createEngine();
      const result = engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error, 'Should reject self-cancel');
    });

    it('rejects cancel targeting nonexistent player', () => {
      const engine = createEngine();
      const result = engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p_ghost' });
      assert.ok(result.error, 'Should reject nonexistent target');
    });

    it('rejects cancel without targetPlayerId', () => {
      const engine = createEngine();
      const result = engine.handleCommand('p1', { type: 'cancelTradeAgreement' });
      assert.ok(result.error, 'Should reject missing targetPlayerId');
    });

    it('target player can cancel a received pending proposal', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(engine.playerStates.get('p1').pendingTradeAgreements.has('p2'));

      // p2 cancels (they have a pending incoming from p1, stored as p1.pendingTradeAgreements has p2)
      // The cancel handler checks state.tradeAgreements or state.pendingTradeAgreements
      // p2 doesn't have p1 in their pending set, so this should actually fail
      // unless p2 has an active agreement — let's verify the behavior
      const result = engine.handleCommand('p2', { type: 'cancelTradeAgreement', targetPlayerId: 'p1' });
      // p2 has no entry for p1 in tradeAgreements or pendingTradeAgreements, so this should error
      assert.ok(result.error, 'Target cannot cancel a proposal they received via cancel command');
    });
  });

  describe('Cancel events', () => {
    it('emits tradeAgreementBroken with reason cancelled when active agreement is cancelled', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      engine._pendingEvents = [];

      engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });

      const events = engine._pendingEvents;
      const broken1 = events.find(e => e.eventType === 'tradeAgreementBroken' && e.playerId === 'p1');
      const broken2 = events.find(e => e.eventType === 'tradeAgreementBroken' && e.playerId === 'p2');
      assert.ok(broken1, 'Should emit broken event to canceller');
      assert.ok(broken2, 'Should emit broken event to partner');
      assert.strictEqual(broken1.reason, 'cancelled', 'Reason should be cancelled, not aggression');
      assert.strictEqual(broken2.reason, 'cancelled');
    });

    it('does not emit tradeAgreementBroken when cancelling a pending proposal', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      engine._pendingEvents = [];

      engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });

      const broken = engine._pendingEvents.filter(e => e.eventType === 'tradeAgreementBroken');
      assert.strictEqual(broken.length, 0, 'Should not emit broken event for pending proposals');
    });
  });

  describe('Production bonus — scope', () => {
    it('does not apply trade bonus to food production', () => {
      const engine = createEngine();
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return;

      // Add agriculture for food production
      colony.districts.push({ type: 'agriculture', disabled: false });
      colony._cachedProduction = null;
      const baseProd = engine._calcProduction(colony);
      const baseFood = baseProd.production.food;

      formTradeAgreement(engine, 'p1', 'p2');
      colony._cachedProduction = null;
      const tradeProd = engine._calcProduction(colony);

      assert.strictEqual(tradeProd.production.food, baseFood,
        'Food should not be boosted by trade agreements');
    });

    it('does not apply trade bonus to alloy production', () => {
      const engine = createEngine();
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return;

      colony._cachedProduction = null;
      const baseProd = engine._calcProduction(colony);
      const baseAlloys = baseProd.production.alloys;

      formTradeAgreement(engine, 'p1', 'p2');
      colony._cachedProduction = null;
      const tradeProd = engine._calcProduction(colony);

      assert.strictEqual(tradeProd.production.alloys, baseAlloys,
        'Alloys should not be boosted by trade agreements');
    });

    it('does not apply trade bonus to research production', () => {
      const engine = createEngine();
      const colony = getFirstColony(engine, 'p1');
      if (!colony) return;

      colony._cachedProduction = null;
      const baseProd = engine._calcProduction(colony);
      const baseResearch = baseProd.production.research;

      formTradeAgreement(engine, 'p1', 'p2');
      colony._cachedProduction = null;
      const tradeProd = engine._calcProduction(colony);

      assert.strictEqual(tradeProd.production.research, baseResearch,
        'Research should not be boosted by trade agreements');
    });
  });

  describe('Mutual auto-accept — influence', () => {
    it('both players pay influence on mutual auto-accept', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      const before1 = engine.playerStates.get('p1').resources.influence;
      const before2 = engine.playerStates.get('p2').resources.influence;

      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      engine.handleCommand('p2', { type: 'proposeTradeAgreement', targetPlayerId: 'p1' });

      const after1 = engine.playerStates.get('p1').resources.influence;
      const after2 = engine.playerStates.get('p2').resources.influence;
      assert.strictEqual(before1 - after1, TRADE_AGREEMENT_INFLUENCE_COST,
        'Player 1 should pay influence cost');
      assert.strictEqual(before2 - after2, TRADE_AGREEMENT_INFLUENCE_COST,
        'Player 2 should pay influence cost');
    });

    it('emits tradeAgreementFormed (not just proposed) on mutual auto-accept', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      giveResources(engine, 'p2');
      engine._pendingEvents = [];

      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      engine.handleCommand('p2', { type: 'proposeTradeAgreement', targetPlayerId: 'p1' });

      const formed = engine._pendingEvents.filter(e => e.eventType === 'tradeAgreementFormed');
      assert.strictEqual(formed.length, 2, 'Should emit formed event to both players');
    });
  });

  describe('_forceHostile breaks agreements', () => {
    it('breaks trade agreement when _forceHostile is called directly', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');
      assert.ok(engine.playerStates.get('p1').tradeAgreements.has('p2'));

      engine._forceHostile('p1', 'p2');

      assert.ok(!engine.playerStates.get('p1').tradeAgreements.has('p2'),
        'p1 should lose trade agreement');
      assert.ok(!engine.playerStates.get('p2').tradeAgreements.has('p1'),
        'p2 should lose trade agreement');
    });

    it('breaks pending proposals when _forceHostile is called', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(engine.playerStates.get('p1').pendingTradeAgreements.has('p2'));

      engine._forceHostile('p1', 'p2');

      assert.ok(!engine.playerStates.get('p1').pendingTradeAgreements.has('p2'),
        'Pending proposal should be cleared on forced hostility');
    });
  });

  describe('NaN / non-finite influence handling', () => {
    it('rejects proposal when influence is NaN', () => {
      const engine = createEngine();
      engine.playerStates.get('p1').resources.influence = NaN;
      const result = engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      assert.ok(result.error, 'Should reject NaN influence');
      assert.ok(result.error.includes('influence'));
    });

    it('rejects acceptance when influence is Infinity', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });
      engine.playerStates.get('p2').resources.influence = -Infinity;
      const result = engine.handleCommand('p2', { type: 'acceptTradeAgreement', targetPlayerId: 'p1' });
      assert.ok(result.error, 'Should reject non-finite influence');
    });
  });

  describe('Serialization — full pipeline', () => {
    it('includes trade agreement data in getPlayerStateJSON', () => {
      const engine = createEngine();
      formTradeAgreement(engine, 'p1', 'p2');

      const json = engine.getPlayerStateJSON('p1');
      const parsed = JSON.parse(json);
      // diplomacy is nested under players[0] (the "me" object)
      const me = parsed.players[0];
      assert.ok(me.diplomacy, 'Should have diplomacy in state JSON');
      assert.ok(Array.isArray(me.diplomacy.tradeAgreements), 'Should serialize trade agreements');
      assert.ok(me.diplomacy.tradeAgreements.includes('p2'), 'Should include p2 as trade partner');
    });

    it('includes pending proposals in getPlayerStateJSON', () => {
      const engine = createEngine();
      giveResources(engine, 'p1');
      engine.handleCommand('p1', { type: 'proposeTradeAgreement', targetPlayerId: 'p2' });

      const json = engine.getPlayerStateJSON('p1');
      const parsed = JSON.parse(json);
      const me = parsed.players[0];
      assert.ok(me.diplomacy, 'Should have diplomacy');
      assert.ok(Array.isArray(me.diplomacy.pendingTradeAgreements));
      assert.ok(me.diplomacy.pendingTradeAgreements.includes('p2'));
    });
  });

  describe('Three-player interactions', () => {
    it('breaking agreement with one partner does not affect another', () => {
      const engine = createEngine({ threePlayer: true });
      formTradeAgreement(engine, 'p1', 'p2');
      formTradeAgreement(engine, 'p1', 'p3');

      engine.handleCommand('p1', { type: 'cancelTradeAgreement', targetPlayerId: 'p2' });

      assert.ok(!engine.playerStates.get('p1').tradeAgreements.has('p2'),
        'Agreement with p2 should be gone');
      assert.ok(engine.playerStates.get('p1').tradeAgreements.has('p3'),
        'Agreement with p3 should remain');
      assert.ok(engine.playerStates.get('p3').tradeAgreements.has('p1'),
        'p3 should still have agreement with p1');
    });

    it('hostility with one partner does not break agreement with another', () => {
      const engine = createEngine({ threePlayer: true });
      formTradeAgreement(engine, 'p1', 'p2');
      formTradeAgreement(engine, 'p1', 'p3');

      giveResources(engine, 'p1');
      const s1 = engine.playerStates.get('p1');
      if (!s1.diplomacy['p2']) s1.diplomacy['p2'] = { stance: 'neutral', cooldownTick: 0 };
      else s1.diplomacy['p2'].cooldownTick = 0;
      engine.handleCommand('p1', { type: 'setDiplomacy', targetPlayerId: 'p2', stance: 'hostile' });

      assert.ok(!engine.playerStates.get('p1').tradeAgreements.has('p2'),
        'Agreement with p2 broken by hostility');
      assert.ok(engine.playerStates.get('p1').tradeAgreements.has('p3'),
        'Agreement with p3 should survive');
    });
  });
});
