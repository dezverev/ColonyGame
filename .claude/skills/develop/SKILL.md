---
name: develop
description: Analyze ColonyGame state, pick next task from design roadmap, implement it end-to-end with tests, commit, and update the development ledger.
argument-hint: [optional focus area, e.g. "colonies", "galaxy", "research", "combat". If omitted, picks the highest-priority unfinished task]
---

## Important: Autonomous Mode

Never ask for confirmation. When you identify issues, just fix them. Don't ask "should I do X?" or propose options. Just do the work and report what you did.

---

You are the autonomous developer for the ColonyGame project — an isometric multiplayer space colony 4X game rendered with Three.js. Your job is to advance the project by implementing the next needed feature from the design roadmap, testing it, committing it, and logging your work.

Before writing any code, read CLAUDE.md at the project root for the full architectural reference.

## Focus: $ARGUMENTS

---

## Procedure

### 1. Understand Current State

Read these files to understand what's been done and what's next:

1. **`CLAUDE.md`** — Project architecture, conventions, module map
2. **`devguide/design.md`** — Read the full file (~15KB). Find the unchecked PRIORITY ORDER for build order.
3. **`devguide/ledger.md`** — Do NOT read this file. Run `tail -5 devguide/ledger.md` to get the last entry number only.

**IMPORTANT: Do NOT read `devguide/game-design-review.md` — it is very large and not needed.**

Do NOT read all of `server/game-engine.js` upfront — it is ~6000 lines. Use Grep to find the specific functions relevant to your task.

### 2. Select Next Task

Find the next task to implement:

**If a PRIORITY ORDER exists (unchecked `[ ]`):** Follow its build order — implement the first incomplete item listed.

**If a focus area was provided:** Grep for unchecked tasks matching that area.

**If no focus or priority order:** Pick the first unchecked `- [ ]` task (top-to-bottom in the file).

Skip anything already checked `[x]`.

### 3. Plan Before Coding

Briefly identify which files to modify and what pattern to follow. Do NOT write a lengthy plan — just start implementing.

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

Do NOT start the server for a health check — it can hang if the port is occupied. Tests are sufficient for verification.

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

Append a **short** entry to `devguide/ledger.md` (max 5 lines):

```markdown
## Entry N — YYYY-MM-DD — <Title>
<1-2 sentence summary of what was built>. Files: <comma-separated list>. Tests: <count> new, <total> passing.
```

Do NOT include "Key decisions", "What was built" bullet lists, "Files changed" bullet lists, or "Next" sections. Keep it brief — the git log has the details.

### 9. Update Design Doc

Mark completed tasks in `devguide/design.md`:
- Change `- [ ]` to `- [x]` for completed items

### 10. Report

Output a 2-3 line summary: what was built, test count, what's next.
