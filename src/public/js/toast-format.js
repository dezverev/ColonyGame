/**
 * Toast notification formatting — maps server gameEvent messages to display text.
 * Shared between browser (app.js) and Node.js (tests).
 */
(function () {
  const TOAST_TYPE_MAP = {
    constructionComplete: 'positive',
    colonyFounded: 'positive',
    colonyShipFailed: 'crisis',
    popMilestone: 'positive',
    researchComplete: 'positive',
    districtEnabled: 'positive',
    queueEmpty: 'warning',
    housingFull: 'warning',
    foodDeficit: 'crisis',
    districtDisabled: 'crisis',
    surveyComplete: 'positive',
    anomalyDiscovered: 'positive',
    colonyTraitEarned: 'positive',
    crisisStarted: 'crisis',
    crisisResolved: 'warning',
    edictActivated: 'positive',
    edictExpired: 'warning',
    scarcityWarning: 'warning',
    scarcityStarted: 'crisis',
    scarcityEnded: 'positive',
  };

  function formatGameEvent(msg) {
    const d = msg;
    switch (msg.eventType) {
      case 'constructionComplete':
        if (d.districtType === 'colonyShip') return 'Colony Ship built at ' + (d.colonyName || 'colony') + ' — ready to launch!';
        if (d.districtType === 'scienceShip') return 'Science Ship built at ' + (d.colonyName || 'colony') + ' — ready to explore!';
        return 'Construction complete: ' + (d.districtType || 'district') + ' on ' + (d.colonyName || 'colony');
      case 'colonyFounded':
        if (d.colonyId) return 'Colony founded in ' + (d.systemName || 'system') + '!';
        return (d.playerName || 'A player') + ' founded a colony in ' + (d.systemName || 'system') + '!';
      case 'colonyShipFailed':
        return 'Colony ship failed at ' + (d.systemName || 'system') + ': ' + (d.reason || 'unknown');
      case 'popMilestone':
        return 'Population milestone: ' + (d.pops || '?') + ' pops on ' + (d.colonyName || 'colony');
      case 'researchComplete':
        return 'Research complete: ' + (d.techName || d.techId || 'technology');
      case 'districtEnabled':
        return 'District re-enabled: ' + (d.districtType || 'district') + ' on ' + (d.colonyName || 'colony');
      case 'queueEmpty':
        return 'Build queue empty on ' + (d.colonyName || 'colony');
      case 'housingFull':
        return 'Housing full on ' + (d.colonyName || 'colony') + ' — build more Housing!';
      case 'foodDeficit':
        return 'Food deficit on ' + (d.colonyName || 'colony') + ' — pops are starving!';
      case 'districtDisabled':
        return 'Energy deficit: ' + (d.districtType || 'district') + ' disabled on ' + (d.colonyName || 'colony');
      case 'surveyComplete':
        return 'Survey complete: ' + (d.systemName || 'system') + (d.discoveries && d.discoveries.length > 0 ? ' — ' + d.discoveries.length + ' anomal' + (d.discoveries.length === 1 ? 'y' : 'ies') + ' found!' : '');
      case 'anomalyDiscovered':
        return 'Anomaly: ' + (d.anomalyLabel || 'Unknown') + ' discovered at ' + (d.systemName || 'system') + '!';
      case 'colonyTraitEarned':
        return (d.colonyName || 'Colony') + ' earned trait: ' + (d.traitName || 'Unknown') + '!';
      case 'crisisStarted':
        return 'CRISIS: ' + (d.crisisLabel || 'Unknown') + ' on ' + (d.colonyName || 'colony') + '!';
      case 'crisisResolved':
        return (d.colonyName || 'Colony') + ': ' + (d.outcome || 'Crisis resolved');
      case 'edictActivated':
        return 'Edict activated: ' + (d.edictName || d.edictType) + (d.instant ? ' — resources granted!' : '');
      case 'edictExpired':
        return 'Edict expired: ' + (d.edictName || d.edictType);
      case 'scarcityWarning': {
        const rName = (d.resource || 'resource').charAt(0).toUpperCase() + (d.resource || 'resource').slice(1);
        return 'WARNING: ' + rName + ' scarcity approaching — production will drop 30%!';
      }
      case 'scarcityStarted': {
        const rName = (d.resource || 'resource').charAt(0).toUpperCase() + (d.resource || 'resource').slice(1);
        return 'SCARCITY: ' + rName + ' production reduced 30% galaxy-wide!';
      }
      case 'scarcityEnded': {
        const rName = (d.resource || 'resource').charAt(0).toUpperCase() + (d.resource || 'resource').slice(1);
        return rName + ' scarcity has ended — production restored.';
      }
      default:
        return null;
    }
  }

  // Browser export
  if (typeof window !== 'undefined') {
    window.ToastFormat = { formatGameEvent, TOAST_TYPE_MAP };
  }

  // Node.js export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatGameEvent, TOAST_TYPE_MAP };
  }
})();
