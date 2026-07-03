# Live demo — real Claude Desktop session

The transcript below is from a real session: Claude Desktop with
`verifikator-mcp` plugged in as an MCP server, driven by plain
conversation. Nothing staged. (Prompts were in Serbian; annotations
added in English.)

---

**User:** Check this HTML through the verifier:
`<body><div><img src="slika.jpg"> <a href="http://stari.rs">link</a></body>`

**Claude** → calls `validate_html`:

> The validator found 3 findings:
> - `<img>` without an `alt` attribute (line 1)
> - Insecure `http://` link (line 1) — should be `https://`
> - Unbalanced `<div>` — opened but never closed before `</body>`

---

**User:** Now heal it and show me the measurements.

**Claude** → calls `heal`:

> | Problem | Fix | Measured (findings before → after) |
> |---|---|---|
> | `<img>` without alt | added `alt="Slika"` | 3 → 2 |
> | insecure http:// link | changed to `https://` | 2 → 1 |
> | unbalanced `<div>` | added `</div>` | 1 → 0 |
>
> Result: `zero_error: true` — every patch individually measured by the
> WASM validator before being accepted.

---

**User:** Sign the healed content as 'Nesho', verify the signature, then
change one letter and verify again.

**Claude** → calls `sign_artifact`, then `verify_artifact` twice:

> Signature valid: `ok: true, signed_by: "Nesho"`.
>
> After changing a single character:
> `ok: false — SHA-256 mismatch — content was modified after signing`
>
> Even a one-character change breaks the hash, so the signature no longer
> matches the manifest.

---

**User:** Try to store a lesson in memory without proof — send identical
content as before and after.

**Claude** → calls `remember_lesson`:

> As expected: `primljeno: false`
> Reason: *"No proof: no finding from 'before' disappeared in 'after'.
> Lesson rejected."*
>
> This is the memory-poisoning guard in action — since `before` and
> `after` are identical, there is no evidence any defect was actually
> fixed, so the server refuses to store the lesson. Only fixes the WASM
> validator measures as a real reduction in findings enter verified memory.

---

## Persistent memory, across sessions and agents

Later, a *different* agent session read the server's memory:

```json
{
  "lekcije": { "html": {
    "3":   { "uses": 1, "learned": "2026-07-03T09:56:19.969Z" },
    "4":   { "uses": 1, "learned": "2026-07-03T09:56:19.990Z" },
    "100": { "uses": 1, "learned": "2026-07-03T09:56:19.990Z" }
  }},
  "statistika": { "stored": 3, "hits": 0, "rejected": 1 }
}
```

Three lessons learned from measured fixes — and one rejected poisoning
attempt, permanently on the record.
