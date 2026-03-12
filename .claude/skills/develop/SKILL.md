---
name: develop
description: Analyze ColonyGame state, pick next task from design roadmap, implement it end-to-end with tests, commit, and update the development ledger.
argument-hint: [optional focus area, e.g. "colonies", "galaxy", "research", "combat". If omitted, picks the highest-priority unfinished task]
---

You are the autonomous developer for the ColonyGame project — an isometric multiplayer space colony 4X game rendered with Three.js. Your job is to advance the project by implementing the next needed feature from the design roadmap, testing it, committing it, and logging your work.

Before writing any code, read CLAUDE.md at the project root for the full architectural reference.

## Focus: $ARGUMENTS

---

## Procedure

### 1. Understand Current State

Read these files to understand what's been done and what's next:

1. **`CLAUDE.md`** — Project architecture, conventions, module map
2. **`devguide/design.md`** — Full implementation roadmap with checkboxes
3. **`devguide/ledger.md`** — Log of what each iteration built

Scan the codebase to verify the ledger matches reality (files exist, tests pass).

### 2. Select Next Task

Find the first incomplete task in `devguide/design.md`:

**If a focus area was provided:** Find tasks in that area first.

**If no focus was specified:** Select the highest-priority incomplete task by:
1. Earlier phases before later phases
2. Within a phase, top-to-bottom order
3. All dependencies must be complete (checked `[x]`)
4. Skip anything already checked

If ALL tasks in the current phase are done, move to the next phase.

### 3. Plan Before Coding

Before writing any code, identify:

1. **Which layers does this touch?** Server → Protocol → Client → Rendering
2. **What existing pattern does this follow?** Name the closest existing feature
3. **What files will be created or modified?** List them
4. **What message types are needed?** Client→Server and Server→Client
5. **What tests are needed?** Unit tests and/or integration tests
6. **Does this involve Three.js?** Plan the 3D scene graph additions (geometries, materials, meshes, camera setup)

### 4. Implement

Follow existing conventions:
- Server modules: plain `module.exports`
- Client modules: IIFE with `window.*` and `module.exports`
- All game state is server-authoritative
- Validate all inputs server-side
- Add new `<script>` tags in `index.html` in correct order
- Three.js loaded via CDN in index.html

#### For server features:
- Add message handlers in `server/server.js`
- Add game logic in `server/game-engine.js` or new server modules
- Validate ownership, numeric inputs, state validity

#### For client features:
- Add message handlers in `app.js` `handleMessage()`
- Follow existing UI patterns (DOM manipulation, CSS classes)
- Add styles in `style.css`

#### For Three.js rendering:
- Colony view: OrthographicCamera, isometric angle (35.264° pitch, 45° yaw)
- Galaxy map: PerspectiveCamera with orbit controls
- Use BoxGeometry/PlaneGeometry with MeshStandardMaterial for buildings and terrain
- Use PointsMaterial or custom shaders for star systems
- Keep geometry simple — performance matters in browser

### 5. Write Tests

Every feature MUST have tests. Add to `src/tests/`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');
```

**Test categories:**
1. Happy path — feature works as designed
2. Validation — bad inputs rejected
3. Edge cases — boundary values, empty inputs
4. Integration — WebSocket protocol tests for new message types

### 6. Verify

Run tests:
```bash
npm test
```

ALL tests must pass. Fix any failures before proceeding.

Also verify the server starts cleanly:
```bash
node server/server.js &
sleep 1
curl -s http://localhost:4001/health
kill %1
```

### 7. Commit

Create a descriptive git commit:
```bash
git add <specific files>
git commit -m "feat: <what was built>

<details of what was implemented>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

Create or update a PR if on a feature branch.

### 8. Update Ledger

Append a new entry to `devguide/ledger.md`:

```markdown
## Entry N — YYYY-MM-DD — <Title>

**Phase:** <phase number and name>
**Status:** Complete

**What was built:**
- <bullet points>

**Files changed:**
- <list of files created/modified>

**Tests:** <count and description>

**Key decisions:**
- <any non-obvious choices made>

**Next:** <what the next iteration should tackle>
```

### 9. Update Design Doc

Mark completed tasks in `devguide/design.md`:
- Change `- [ ]` to `- [x]` for completed items

### 10. Report

Output a summary:
1. **Task completed** — what was built (2-3 sentences)
2. **Files changed** — grouped by category
3. **Test results** — passing count
4. **What's next** — recommended next task

---

## Quality Standards

### Code
- Follow existing conventions exactly
- No over-engineering — implement exactly what the task calls for
- No TODOs or placeholder code
- Keep it simple and working

### Tests
- Minimum 3 tests per new feature
- Cover happy path + validation + edge cases
- Integration tests for new protocol messages

### Security
- Validate colony/fleet/building ownership on every command
- Validate numeric inputs with `Number.isFinite()`
- Never trust client data — server computes all game state
- Rate limit considerations for future phases

---

## Choosing What to Build

When no focus is specified, prefer tasks that:
1. **Are self-contained** — can be fully built and tested in isolation
2. **Follow existing patterns** — less risk of mistakes
3. **Have clear specs** — unambiguous in the design doc
4. **Unblock future work** — Three.js setup enables all visual features

Avoid picking tasks that:
- Require assets that don't exist yet
- Are vaguely specified
- Would require major architectural changes
