# 🛡️ verifikator-mcp

**A deterministic verification gate for AI agent harnesses.**
Agents generate the Verifier proves. An MCP server with zero dependencies
(Node 18+), validation running in a real WebAssembly module hand-written in Zig,
cryptographic artifact provenance, and poison-resistant memory.

## Why

Agent frameworks learn skills from their own "successful" trajectories and
execute tools around the clock with no hard verification anywhere in the
loop. But *successful* was never proven. A lucky trajectory becomes a
permanent skill. A poisoned one does too.

This server adds the missing layer, built on three rules:

1. **Nothing is accepted without measurement.**
2. **Nothing is remembered without proof.**
3. **Everything ships with a signature.**

## Install

No build step, no dependencies. Clone (or download) and plug into any MCP
client Claude Desktop, OpenClaw, or anything speaking the Model Context
Protocol:

```json
{
  "mcpServers": {
    "verifikator": {
      "command": "node",
      "args": ["/path/to/verifikator-mcp/server.js"]
    }
  }
}
```

## Tools (8)

| Tool | What it does |
|---|---|
| `validate_html` | HTML through a real Zig/WASM validator: unbalanced tags, `<img>` without `alt`, `http://` links, `<script>` (JSON-LD allowed), empty `href`, unclosed comments with line numbers |
| `validate_smd` | SuperMD/Ziggy rules for the Zine static site generator |
| `heal` | Self-healing loop: proposes minimal patches, **measures each one** through WASM (defect count before/after), applies only patches that provably reduce defects |
| `sign_artifact` | SHA-256 + ECDSA P-256 provenance; the key pair is generated locally in `~/.verifikator-mcp` and never leaves your machine |
| `verify_artifact` | Detects any modification after signing — including a forged manifest (signature check against the embedded public key) |
| `remember_lesson` | **Memory with proof**: submit content before/after a fix; the server re-validates both itself and stores only defect classes that demonstrably disappeared. No proof rejected. A guard against memory poisoning |
| `recall_lessons` | Inspect verified memory: lessons, usage counts, stats (stored / hits / rejected) |
| `audit_url` | Agent-readiness score (0–100) for any website: content without JS, JSON-LD, llms.txt, robots.txt AI-bot blocks, machine-readable contact |

## Example agent flow

1. Agent generates HTML → `validate_html` → 3 findings with line numbers
2. `heal` → three measured patches (`3 → 2 → 1 → 0`) → `zero_error: true`
   (verified fixes are stored as lessons automatically)
3. `sign_artifact` → manifest travels with the file
4. Tomorrow, a different agent: `verify_artifact` before use → knows the file
   is untouched; `heal` on similar defects reports `iz_memorije: true` —
   fixed from verified memory, re-verified on application

## Live demo (real session transcript)

See [`examples/demo-session.md`](examples/demo-session.md) — a real Claude
session using this server, including the moment the server **rejects an
agent's attempt to store an unproven lesson**:

> `primljeno: false — "No proof: no finding from 'before' disappeared in
> 'after'. Lesson rejected."`

## The WASM validator

`validator.wasm` (~4 KB) is compiled from [`validator.zig`](validator.zig) 
freestanding wasm32, no allocator, no standard library. Verify it yourself:

```
pip install ziglang
python -m ziglang build-exe validator.zig -target wasm32-freestanding -O ReleaseSmall -fno-entry -rdynamic
```

## Works great with: dualpath-lrm

[dualpath-lrm](https://github.com/Nesoxy1/dualpath-lrm?tab=readme-ov-file) gives agents diff-only context: a hashed
baseline (`.lrm/state.json`) plus unified diffs instead of re-reading a whole
project. That baseline is exactly the kind of artifact this server protects —
sign it after `lrm_scan` (`sign_artifact`), verify it before applying any
package (`verify_artifact`). A tampered baseline is rejected before the agent
applies diffs against a state it never saw. No code changes on either side the agent is the glue.

## Honest scope

- Validators currently cover **two content types** (HTML, SuperMD). The
  architecture accepts new `validate_*` tools without protocol changes —
  JSON, YAML and shell validators are the roadmap.
- `heal` strategies are deterministic; the critic's approval is a WASM
  measurement, not an LLM opinion.
- `audit_url` is a simplified server-side check, not a full site audit.
- No formal benchmark suite yet — so no performance claims until there is one.

## License

MIT © 2026 Nebojša Milićević

*Stochastic generators need deterministic judges. That's the whole thesis.*
