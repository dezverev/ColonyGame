# toast-format.js

> Game event to toast notification formatting.

**File:** `src/public/js/toast-format.js`
**Last verified:** 2026-03-12

## Overview

Toast notification formatting module. Maps server `gameEvent` messages to human-readable display strings and toast severity types. Shared between browser and Node.js via dual IIFE + `module.exports` export.

## Public API

Exposed on `window.ToastFormat` and `module.exports`:

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `formatGameEvent` | `(msg)` | `string \| null` | Converts game event to display string. `null` for unrecognized types. |

| Constant | Type | Purpose |
|----------|------|---------|
| `TOAST_TYPE_MAP` | object | Maps `eventType` to severity: `'positive'`, `'warning'`, or `'crisis'` |

## Toast Type Mapping

| Event Type | Severity |
|------------|----------|
| `constructionComplete` | positive |
| `colonyFounded` | positive |
| `colonyShipFailed` | crisis |
| `popMilestone` | positive |
| `researchComplete` | positive |
| `districtEnabled` | positive |
| `queueEmpty` | warning |
| `housingFull` | warning |
| `foodDeficit` | crisis |
| `districtDisabled` | crisis |
| `surveyComplete` | positive |
| `anomalyDiscovered` | positive |

## Dependencies

- **Requires:** None (pure formatting)
- **Used by:** `app.js`

## Internal Notes

- `constructionComplete` has special-case handling for `'colonyShip'` and `'scienceShip'` district types.
- `colonyFounded` distinguishes own colonies (has `colonyId`) from others (uses `playerName`).
- `surveyComplete` pluralizes "anomaly/anomalies" based on discovery count.
