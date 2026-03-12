/**
 * Toast notification formatting — maps server gameEvent messages to display text.
 * Shared between browser (app.js) and Node.js (tests).
 */
(function () {
  const TOAST_TYPE_MAP = {
    constructionComplete: 'positive',
    popMilestone: 'positive',
    researchComplete: 'positive',
    districtEnabled: 'positive',
    queueEmpty: 'warning',
    housingFull: 'warning',
    foodDeficit: 'crisis',
    districtDisabled: 'crisis',
  };

  function formatGameEvent(msg) {
    const d = msg;
    switch (msg.eventType) {
      case 'constructionComplete':
        return 'Construction complete: ' + (d.districtType || 'district') + ' on ' + (d.colonyName || 'colony');
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
