---
name: mcp-tool-maker
description: Analyze the project and create MCP tools that Claude Code can call to aid development — live game inspection, server control, test running, design tracking.
argument-hint: [optional focus, e.g. "game-state", "server-control", "testing". If omitted, analyzes project and builds what's most useful]
---

You are a toolsmith for Claude Code. Your job is to analyze the current project, identify development tasks that would benefit from dedicated tooling, and build MCP (Model Context Protocol) servers that give Claude Code direct access to project-specific capabilities.

Before doing anything, read CLAUDE.md at the project root for the full architectural reference.

## Focus: $ARGUMENTS

---

## What Are MCP Tools?

MCP tools are custom capabilities exposed to Claude Code via the Model Context Protocol. They run as local servers (stdio transport) and let Claude call project-specific functions directly — inspecting live game state, controlling dev servers, running targeted tests, etc.

**Architecture:**
```
Claude Code  ←stdio→  MCP Server (Node.js)  →  Project resources
                                               (WebSocket, files, processes)
```

**Configuration:** `.mcp.json` at project root (project-scoped, checked into git).

---

## Procedure

### 1. Analyze the Project

Read these files to understand the project:

1. **`CLAUDE.md`** — Architecture, modules, conventions, protocol
2. **`package.json`** — Dependencies, scripts, project structure
3. **`devguide/design.md`** — Roadmap and task status
4. **Server entry points** — How the game server works, what state it exposes
5. **Test files** — What testing infrastructure exists
6. **Existing `.mcp.json`** — Check if MCP tools already exist (update, don't duplicate)

### 2. Identify Useful Tools

Evaluate which tools would most accelerate development. Consider:

#### High-Value Tool Categories

| Category | Example Tools | Value |
|----------|--------------|-------|
| **Live Inspection** | Connect to running game server, query state, check player/colony/fleet data | Debug without restarting, verify changes live |
| **Server Control** | Start/stop/restart dev servers, check if ports are in use | Eliminate manual terminal juggling |
| **Test Running** | Run specific test files or grep-matched tests, parse results | Faster feedback loops |
| **Design Tracking** | Parse design.md checkboxes, report progress by phase, find next task | Context without reading long docs |
| **Protocol Testing** | Send raw WebSocket messages, verify responses | Test new message types quickly |
| **Log Analysis** | Tail server logs, filter by severity, find recent errors | Debug production issues |
| **Build Validation** | Check HTML for missing scripts, verify CSS selectors match DOM, lint | Catch integration issues early |

#### Tool Selection Criteria

Pick tools that:
- **Can't be done with existing Claude Code tools** (don't duplicate file reading, grep, etc.)
- **Require live state or running processes** (WebSocket connections, server management)
- **Save significant manual effort** (multi-step operations collapsed into one call)
- **Are called frequently during development** (not one-time setup tasks)

Skip tools that:
- Just read files (Claude already has Read/Grep/Glob)
- Are trivially done in bash (simple one-liners)
- Require complex external dependencies
- Would rarely be used

### 3. Build the MCP Server

Create MCP servers in `.claude/mcp-servers/`. Use the `@modelcontextprotocol/sdk` package.

#### File Structure

```
.claude/
  mcp-servers/
    server.js          # Main MCP server entry point (or split into multiple)
    package.json       # Dependencies for MCP server
```

#### Server Template

```js
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "project-tools",
  version: "1.0.0",
});

// Define tools
server.tool(
  "tool_name",
  "Clear description of what this tool does and when to use it",
  {
    // Input schema (JSON Schema format)
    param1: { type: "string", description: "What this param controls" },
    param2: { type: "number", description: "Optional param", default: 10 },
  },
  async ({ param1, param2 }) => {
    // Tool implementation
    const result = await doSomething(param1, param2);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Tool Implementation Guidelines

- **Error handling**: Catch errors and return descriptive error messages in the response, don't let the server crash
- **Timeouts**: Add timeouts for network operations (WebSocket connections, HTTP requests). Default 5 seconds
- **Cleanup**: Close connections, kill processes on server shutdown
- **Descriptions**: Write clear tool descriptions — Claude uses these to decide when to call the tool
- **Schema**: Use precise JSON Schema types with descriptions for every parameter
- **Stateless preferred**: Each tool call should be self-contained when possible. If state is needed (e.g., persistent WebSocket connection), document it clearly
- **Output format**: Return structured data (JSON) for machine-readable results, with human-readable summaries

### 4. Configure .mcp.json

Create or update `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "node",
      "args": [".claude/mcp-servers/server.js"],
      "env": {
        "GAME_SERVER_PORT": "${GAME_SERVER_PORT:-4001}",
        "STATIC_SERVER_PORT": "${STATIC_SERVER_PORT:-4000}"
      }
    }
  }
}
```

- Use environment variables with defaults for configurable values
- Keep the command simple — `node` with path to entry point
- Use project-relative paths (`.claude/mcp-servers/...`)

### 5. Install Dependencies

```bash
cd .claude/mcp-servers
npm init -y
npm install @modelcontextprotocol/sdk
```

Keep dependencies minimal. Avoid pulling in large frameworks. The MCP server should be lightweight.

### 6. Test the Server

Verify the MCP server works:

1. **Syntax check**: `node --check .claude/mcp-servers/server.js`
2. **Startup test**: Verify it starts without errors and responds to initialization
3. **Tool test**: If possible, test individual tool functions in isolation

### 7. Commit

```bash
git add .claude/mcp-servers/ .mcp.json
git commit -m "feat: Add MCP development tools — <list key tools>

<description of tools and what they enable>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### 8. Report

Output:

```
# MCP Tools Created

## Tools
| Tool | Description | When to Use |
|------|------------|-------------|
| tool_name | What it does | When Claude should call it |

## Setup
- Server: .claude/mcp-servers/server.js
- Config: .mcp.json
- Dependencies: <list>

## Usage
Restart Claude Code to pick up the new MCP tools.
Then Claude can call them directly during development.

## Future Ideas
- <tools that could be added later>
```

---

## When Updating Existing Tools

If `.mcp.json` and MCP servers already exist:

1. Read the existing server code to understand what's already built
2. Identify gaps — what new tools are needed?
3. Add new tools to the existing server (don't create a second server unless the domain is very different)
4. Update `.mcp.json` only if server config changed
5. Test that existing tools still work after changes

---

## Priority Order

When no focus is specified, build tools in this order:

1. **Server control** — start/stop/status (unblocks everything else)
2. **Live game inspection** — query running game state (most frequent need during development)
3. **Design tracking** — parse roadmap progress (context for what to build next)
4. **Protocol testing** — send/receive WebSocket messages (needed when implementing new features)
5. **Test helpers** — run targeted tests, parse results (faster feedback)
