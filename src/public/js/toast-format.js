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
    raiderSpawned: 'warning',
    raiderDefeated: 'positive',
    colonyRaided: 'crisis',
    shipLostMaintenance: 'crisis',
    maintenanceAttrition: 'crisis',
    colonyOccupied: 'crisis',
    colonyLiberated: 'positive',
    warDeclared: 'crisis',
    allianceFormed: 'positive',
    friendlyProposed: 'info',
    doctrineChosen: 'positive',
    doctrineAutoAssigned: 'info',
    endgameCrisisWarning: 'warning',
    endgameCrisis: 'crisis',
    precursorCombat: 'crisis',
    precursorDestroyed: 'positive',
    precursorOccupied: 'crisis',
    scoutMilestone: 'positive',
  };

  function formatGameEvent(msg) {
    const d = msg;
    switch (msg.eventType) {
      case 'constructionComplete':
        if (d.districtType === 'colonyShip') return 'Colony Ship built at ' + (d.colonyName || 'colony') + ' — ready to launch!';
        if (d.districtType === 'scienceShip') return 'Science Ship built at ' + (d.colonyName || 'colony') + ' — ready to explore!';
        if (d.districtType === 'corvette-interceptor') return 'Interceptor built at ' + (d.colonyName || 'colony') + ' — fast strike corvette ready!';
        if (d.districtType === 'corvette-gunboat') return 'Gunboat built at ' + (d.colonyName || 'colony') + ' — heavy corvette ready!';
        if (d.districtType === 'corvette-sentinel') return 'Sentinel built at ' + (d.colonyName || 'colony') + ' — sustain corvette ready!';
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
      case 'raiderSpawned':
        return 'ALERT: Raider fleet detected on the galactic rim — heading for your colonies!';
      case 'raiderDefeated':
        return 'Defense platform destroyed raider at ' + (d.colonyName || 'colony') + '! +5 VP';
      case 'colonyRaided':
        return 'RAIDED: ' + (d.colonyName || 'Colony') + ' was raided! ' + (d.districtsDisabled || 0) + ' districts disabled.';
      case 'shipLostMaintenance':
        return 'Corvette lost — cannot afford fleet maintenance!';
      case 'maintenanceAttrition':
        return 'Fleet attrition: ' + (d.shipsLost || 0) + ' corvette' + ((d.shipsLost || 0) > 1 ? 's' : '') + ' scrapped — resources too low!';
      case 'colonyOccupied':
        return 'OCCUPIED: ' + (d.colonyName || 'Colony') + ' has been occupied by ' + (d.occupantName || 'enemy') + '! -5 VP';
      case 'colonyLiberated':
        return (d.colonyName || 'Colony') + ' has been liberated!';
      case 'warDeclared':
        return 'WAR DECLARED: ' + (d.aggressorName || 'Unknown') + ' declares war on ' + (d.targetName || 'Unknown') + '!';
      case 'allianceFormed':
        return 'ALLIANCE FORMED: ' + (d.player1Name || 'Unknown') + ' and ' + (d.player2Name || 'Unknown') + ' are now allies!';
      case 'friendlyProposed':
        return (d.fromName || 'Unknown') + ' proposes an alliance with you!';
      case 'doctrineChosen':
        return (d.playerName || 'A player') + ' chose the ' + (d.name || 'Unknown') + ' doctrine';
      case 'doctrineAutoAssigned':
        return 'Auto-assigned ' + (d.name || 'Unknown') + ' doctrine (selection timer expired)';
      case 'endgameCrisisWarning':
        return 'WARNING: Endgame crisis approaching — brace for impact!';
      case 'endgameCrisis':
        if (d.crisisType === 'galacticStorm') return 'GALACTIC STORM: All production reduced 25% for the remainder of the match!';
        if (d.crisisType === 'precursorAwakening') return 'PRECURSOR AWAKENING: An ancient warship has emerged — destroy it for +15 VP!';
        return 'ENDGAME CRISIS: ' + (d.label || 'Unknown') + ' — ' + (d.description || '');
      case 'precursorCombat':
        return 'COMBAT: Precursor fleet engaged at ' + (d.systemName || 'system') + '! ' + (d.playerShips || 0) + ' corvettes fighting...';
      case 'precursorDestroyed':
        return 'PRECURSOR DESTROYED: ' + (d.destroyerName || 'Unknown') + ' destroyed the precursor fleet! +' + (d.vpReward || 15) + ' VP';
      case 'precursorOccupied':
        return 'PRECURSOR OCCUPATION: ' + (d.colonyName || 'Colony') + ' occupied by precursor fleet! -5 VP for ' + (d.ownerName || 'owner');
      case 'scoutMilestone':
        return (d.playerName || 'A player') + ': First to survey ' + (d.threshold || '?') + ' systems! +' + (d.vp || '?') + ' VP';
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
