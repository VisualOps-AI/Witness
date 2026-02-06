# Witness Protocol - Build Plan

## Product Definition

**Witness**: An MCP-compatible proxy that intercepts agent tool calls, executes them in isolated shadow timelines (sandboxes), and generates cryptographically-signed delegation receipts.

**Tagline**: "Agency without accountability is liability."

---

## Core Mission

Make agent actions trustworthy enough to delegate. Not by restricting what agents can do, but by making everything they do **provable**, **reversible**, and **inspectable**.

---

## Architectural Principles

| Principle | Implementation |
|-----------|----------------|
| **MCP-native** | Proxy layer to Anthropic's standards, extend where needed |
| **Local-first** | SQLite for receipts, filesystem for shadow workspaces, no cloud |
| **Time travel metaphor** | Shadow = "parallel timeline", Receipt = "historical record", Undo = "temporal restoration" |
| **Beautiful receipts** | The receipt IS the product. Gorgeous, shareable, human-readable |
| **One binary, one config** | `witness` command + `witness.yaml` config. Nothing else. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGENT (Claude Code, etc.)               │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 │ MCP JSON-RPC (tools/call)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WITNESS PROXY                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Intercept  │→ │    Policy    │→ │   Shadow Timeline    │  │
│  │   Layer      │  │    Engine    │  │   (Sandbox)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         │                                       │               │
│         │              ┌────────────────────────┘               │
│         ▼              ▼                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Verifier   │← │    Diff      │  │   Receipt Engine     │  │
│  │              │  │    Engine    │  │   (Ed25519 + Merkle) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 │ Allowed calls only
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REAL TOOL SERVERS                            │
│              (filesystem, terminal, http, git)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Receipt Schema (v0.1.0)

```json
{
  "witness_version": "0.1.0",
  "receipt_id": "recv_2vP7xK9m...",
  "timestamp": "2026-02-03T14:32:01Z",
  "timeline": {
    "id": "tl_shadow_abc123",
    "parent": "tl_main",
    "branch_point": "2026-02-03T14:31:58Z"
  },
  "agent": {
    "name": "claude-code",
    "session_id": "sess_abc123",
    "intent": "fix typescript errors in src/utils.ts"
  },
  "execution": {
    "tool": "filesystem.write",
    "args": { "path": "src/utils.ts", "content": "..." },
    "shadow_duration_ms": 340,
    "sandbox_type": "shadow_workspace",
    "diff": {
      "files_touched": ["src/utils.ts"],
      "insertions": 12,
      "deletions": 3
    }
  },
  "verification": {
    "policy_version": "strict@sha256:a1b2c3...",
    "decision": "auto_approved",
    "risk_score": 0.12,
    "checks_passed": ["no_secrets_leaked", "no_destructive_ops", "scope_match"]
  },
  "proof": {
    "prev_receipt_hash": "sha256:...",
    "events_hash": "sha256:...",
    "this_hash": "sha256:...",
    "signature": "ed25519:...",
    "public_key_id": "witness_local_001"
  }
}
```

---

## Policy Schema (witness.yaml)

```yaml
witness_version: "0.1.0"
policy_name: "strict"

defaults:
  decision: deny
  sandbox: shadow_workspace

agents:
  - id: "*"
    allowed_tools:
      - filesystem.read
      - filesystem.write
      - terminal.exec
      - http.request

tools:
  terminal.exec:
    default: require_approval
    rules:
      - match: "^git (status|diff|log|add|commit|push)"
        decision: allow_shadow
      - match: "^npm (test|run build|install)$"
        decision: allow_shadow
      - match: "^python -m pytest"
        decision: allow_shadow
      - match: "rm -rf"
        decision: deny
        reason: "destructive_delete"
      - match: "sudo"
        decision: deny
        reason: "privilege_escalation"

  filesystem.write:
    default: allow_shadow
    allowed_paths:
      - "./src/**"
      - "./tests/**"
      - "./package.json"
      - "./README.md"
    denied_paths:
      - "**/.env*"
      - "**/secrets/**"
      - "**/*_rsa*"

  http.request:
    default: require_approval
    allowed_domains:
      - "api.github.com"
      - "registry.npmjs.org"
    redact_headers:
      - "Authorization"
      - "Cookie"
      - "X-API-Key"

risk_thresholds:
  auto_approve_max: 0.3
  require_approval_min: 0.7
```

---

## Project Structure

```
witness-protocol/
├── README.md
├── package.json
├── witness.yaml.example
├── src/
│   ├── index.ts              # CLI entry point
│   ├── proxy/
│   │   ├── server.ts         # MCP server (receives from agent)
│   │   ├── client.ts         # MCP client (forwards to tools)
│   │   └── router.ts         # Tool call routing
│   ├── policy/
│   │   ├── engine.ts         # Policy evaluation
│   │   ├── parser.ts         # YAML config parser
│   │   └── risk.ts           # Risk scoring
│   ├── sandbox/
│   │   ├── manager.ts        # Shadow timeline orchestration
│   │   ├── workspace.ts      # Filesystem shadow (copy-on-write)
│   │   ├── docker.ts         # Docker sandbox (v0+)
│   │   └── diff.ts           # Change detection
│   ├── receipts/
│   │   ├── generator.ts      # Receipt creation
│   │   ├── signer.ts         # Ed25519 signing
│   │   ├── store.ts          # SQLite persistence
│   │   └── renderer.ts       # HTML receipt generator
│   ├── timeline/
│   │   ├── branch.ts         # Timeline branching
│   │   ├── replay.ts         # Time travel replay
│   │   └── restore.ts        # Temporal restoration
│   └── ui/
│       ├── explorer.ts       # Local web UI server
│       └── templates/        # Receipt HTML templates
├── tests/
└── docs/
    └── PROTOCOL.md           # Witness Receipt Specification
```

---

## Build Roadmap (6 Weeks)

### Week 1: The Intercept
**Goal**: MCP proxy that logs every tool call

- [ ] Initialize TypeScript project with Bun
- [ ] Implement MCP server (stdio transport)
- [ ] Implement MCP client (upstream connection)
- [ ] Create tool call router
- [ ] SQLite schema for event log
- [ ] Basic CLI: `witness run -- <command>`

**Victory Condition**: `witness run -- npm install` logs all tool calls to SQLite

---

### Week 2: The Shadow Timeline
**Goal**: Execute tool calls in isolated workspace

- [ ] Shadow workspace manager (temp directory clone)
- [ ] Copy-on-write filesystem overlay
- [ ] Diff engine (before/after comparison)
- [ ] Merge policy (allowed paths only)
- [ ] Timeline branching model

**Victory Condition**: Tool calls execute in shadow, diff shown before commit

---

### Week 3: The Gate
**Goal**: Policy engine with risk scoring

- [ ] YAML policy parser
- [ ] Rule matching engine (glob + regex)
- [ ] Risk scoring algorithm
- [ ] Decision engine (allow/deny/approve)
- [ ] Approval prompt system

**Victory Condition**: Dangerous command blocked, safe command auto-approved

---

### Week 4: The Receipt
**Goal**: Cryptographic proof generation

- [ ] Ed25519 key generation and storage
- [ ] Receipt JSON canonicalization (RFC 8785)
- [ ] Hash-chain implementation
- [ ] Receipt signing
- [ ] HTML receipt renderer (beautiful!)
- [ ] `witness verify <receipt>` command

**Victory Condition**: Generate shareable receipt, verify its authenticity

---

### Week 5: Time Travel
**Goal**: Replay and restore capabilities

- [ ] `witness replay <receipt-id>` - reconstruct shadow state
- [ ] `witness branch <receipt-id>` - fork from any point
- [ ] `witness restore <receipt-id>` - undo to previous state
- [ ] Timeline visualization in UI
- [ ] "What if" simulation mode

**Victory Condition**: Undo an agent's changes from 3 days ago

---

### Week 6: The Protocol
**Goal**: Ship v0.1.0

- [ ] Proof Explorer web UI (localhost)
- [ ] Documentation (README, PROTOCOL.md)
- [ ] Example policies (strict, permissive, enterprise)
- [ ] Installation script (one-liner)
- [ ] GitHub release
- [ ] Demo video

**Victory Condition**: External user installs and runs Witness successfully

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun (fast, single binary potential) |
| Language | TypeScript |
| MCP | @anthropic/mcp-sdk |
| Database | SQLite (better-sqlite3) |
| Crypto | @noble/ed25519 |
| CLI | Commander.js |
| UI | Vanilla HTML + minimal CSS (no framework) |
| Sandbox v0 | Shadow workspace (filesystem clone) |
| Sandbox v1 | Docker (optional upgrade) |

---

## CLI Commands

```bash
# Core
witness run -- <command>           # Run agent with Witness protection
witness init                       # Create witness.yaml in current dir

# Receipts
witness receipts list              # Show all receipts
witness receipts show <id>         # Display receipt details
witness receipts verify <file>     # Verify receipt signature
witness receipts export <id>       # Export as shareable HTML

# Time Travel
witness timeline                   # Show timeline tree
witness replay <receipt-id>        # Reconstruct shadow state
witness branch <receipt-id>        # Fork new timeline from point
witness restore <receipt-id>       # Restore to previous state

# Server
witness serve                      # Start Proof Explorer UI
witness proxy                      # Run as standalone MCP proxy
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first receipt | < 5 minutes from install |
| Receipt generation latency | < 100ms |
| Shadow execution overhead | < 20% vs direct |
| Receipt file size | < 10KB (JSON) |
| GitHub stars (Week 1) | 100+ |
| GitHub stars (Month 1) | 1,000+ |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| MCP spec changes | Pin to stable version, abstract transport layer |
| Windows sandbox complexity | Start with shadow workspace, Docker optional |
| Performance overhead | Lazy diffing, efficient hashing |
| Adoption friction | One-liner install, zero config defaults |

---

## Phase 2 (Post-v0.1.0)

- Docker sandbox mode
- A2A protocol support (agent-to-agent receipts)
- Team features (shared policies, receipt aggregation)
- VS Code extension
- Enterprise compliance exports
- "Certified Witness-Compatible" badge for agent frameworks

---

## Credits

This plan synthesizes insights from:
- **Kimi 2.5** - 6-week roadmap, receipt design, "agency without accountability" framing
- **Gemini** - Shadow-fork execution, policy-as-code, gVisor/MicroVM concepts
- **GPT 5.1** - MCP proxy architecture, hash-chain receipts, RFC 8785 canonicalization
- **Claude Code** - Protocol-native approach, A2A integration, semantic telemetry

---

## Next Session

Start fresh with: "Build Witness Week 1 - The Intercept"

Reference this file: `C:\Users\Alee\witness-protocol\ROADMAP.md`
