const { describe, it } = require('node:test');
const assert = require('node:assert');
const { formatGameEvent: _formatGameEvent, TOAST_TYPE_MAP } = require('../public/js/toast-format');
const { GameEngine, MONTH_TICKS, BROADCAST_EVERY } = require('../../server/game-engine');

function makeRoom(playerCount = 2) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(i, { id: i, name: `Player${i}`, ready: true, isHost: i === 1 });
  }
  return { id: 'test', name: 'Test', hostId: 1, maxPlayers: 4, status: 'playing', players };
}

describe('Toast — _formatGameEvent', () => {
  it('formats constructionComplete with district type and colony name', () => {
    const text = _formatGameEvent({
      eventType: 'constructionComplete',
      districtType: 'mining',
      colonyName: 'New Earth',
    });
    assert.strictEqual(text, 'Construction complete: mining on New Earth');
  });

  it('formats popMilestone with pop count', () => {
    const text = _formatGameEvent({
      eventType: 'popMilestone',
      pops: 15,
      colonyName: 'Nova Prime',
    });
    assert.strictEqual(text, 'Population milestone: 15 pops on Nova Prime');
  });

  it('formats researchComplete with tech name', () => {
    const text = _formatGameEvent({
      eventType: 'researchComplete',
      techId: 'improved_mining',
      techName: 'Improved Mining',
    });
    assert.strictEqual(text, 'Research complete: Improved Mining');
  });

  it('formats districtEnabled', () => {
    const text = _formatGameEvent({
      eventType: 'districtEnabled',
      districtType: 'industrial',
      colonyName: 'Iron Haven',
    });
    assert.strictEqual(text, 'District re-enabled: industrial on Iron Haven');
  });

  it('formats queueEmpty', () => {
    const text = _formatGameEvent({
      eventType: 'queueEmpty',
      colonyName: 'Frontier',
    });
    assert.strictEqual(text, 'Build queue empty on Frontier');
  });

  it('formats housingFull', () => {
    const text = _formatGameEvent({
      eventType: 'housingFull',
      colonyName: 'Crowded City',
      pops: 20,
      housing: 20,
    });
    assert.strictEqual(text, 'Housing full on Crowded City — build more Housing!');
  });

  it('formats foodDeficit', () => {
    const text = _formatGameEvent({
      eventType: 'foodDeficit',
      food: -5,
    });
    assert.strictEqual(text, 'Food deficit on colony — pops are starving!');
  });

  it('formats districtDisabled', () => {
    const text = _formatGameEvent({
      eventType: 'districtDisabled',
      districtType: 'research',
      colonyName: 'Low Power',
    });
    assert.strictEqual(text, 'Energy deficit: research disabled on Low Power');
  });

  it('returns null for unknown event types', () => {
    const text = _formatGameEvent({ eventType: 'matchWarning' });
    assert.strictEqual(text, null);
  });

  it('uses fallback when colonyName is missing', () => {
    const text = _formatGameEvent({ eventType: 'constructionComplete', districtType: 'mining' });
    assert.strictEqual(text, 'Construction complete: mining on colony');
  });
});

describe('Toast — TOAST_TYPE_MAP', () => {
  it('maps positive events correctly', () => {
    assert.strictEqual(TOAST_TYPE_MAP.constructionComplete, 'positive');
    assert.strictEqual(TOAST_TYPE_MAP.popMilestone, 'positive');
    assert.strictEqual(TOAST_TYPE_MAP.researchComplete, 'positive');
    assert.strictEqual(TOAST_TYPE_MAP.districtEnabled, 'positive');
  });

  it('maps warning events correctly', () => {
    assert.strictEqual(TOAST_TYPE_MAP.queueEmpty, 'warning');
    assert.strictEqual(TOAST_TYPE_MAP.housingFull, 'warning');
  });

  it('maps crisis events correctly', () => {
    assert.strictEqual(TOAST_TYPE_MAP.foodDeficit, 'crisis');
    assert.strictEqual(TOAST_TYPE_MAP.districtDisabled, 'crisis');
  });
});

describe('Toast — Server events include required fields', () => {
  it('constructionComplete includes colonyName and districtType', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getInitState();
    const colony = state.colonies[0];

    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'mining' });

    let found = null;
    engine.onEvent = (events) => {
      const evt = events.find(e => e.eventType === 'constructionComplete');
      if (evt) found = evt;
    };

    for (let i = 0; i < 500 && !found; i++) {
      engine.tick();
    }

    assert.ok(found, 'constructionComplete event should fire');
    assert.strictEqual(found.districtType, 'mining');
    assert.ok(found.colonyName, 'should include colonyName');
  });

  it('queueEmpty fires after last construction completes', () => {
    const engine = new GameEngine(makeRoom(1), { tickRate: 10 });
    const state = engine.getInitState();
    const colony = state.colonies[0];

    engine.handleCommand(1, { type: 'buildDistrict', colonyId: colony.id, districtType: 'generator' });

    let found = null;
    engine.onEvent = (events) => {
      const evt = events.find(e => e.eventType === 'queueEmpty');
      if (evt) found = evt;
    };

    for (let i = 0; i < 500 && !found; i++) {
      engine.tick();
    }

    assert.ok(found, 'queueEmpty event should fire');
    assert.ok(found.colonyName, 'should include colonyName');
  });
});
