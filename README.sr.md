# 🛡️ verifikator-mcp

**Deterministička kapija za AI agent harnesse.** Agenti generišu — Verifikator
dokazuje. MCP server bez ijedne zavisnosti (Node 18+), validacija u pravom
Zig/WASM modulu, kriptografsko poreklo artefakata i memorija otporna na trovanje.

## Zašto

Harnessi poput Hermes Agenta uče veštine iz "uspešnih" putanja, a gateway-i
poput OpenClaw-a izvršavaju alate — bez tvrde provere. Verifikator dodaje
sloj koji nedostaje: ništa se ne prihvata bez merenja, ništa se ne pamti
bez dokaza, i svaki artefakt nosi potpis.

## Priključivanje

Claude Desktop (`Settings → Developer → Edit config`) ili bilo koji MCP klijent:

```json
{ "mcpServers": { "verifikator": { "command": "node", "args": ["PUTANJA/do/verifikator-mcp/server.js"] } } }
```

## Alati (8)

| Alat | Šta radi |
|---|---|
| `validate_html` | HTML kroz pravi WASM validator: neupareni tagovi, img bez alt, http://, `<script>` (JSON-LD dozvoljen)… sa linijama |
| `validate_smd` | SuperMD/Ziggy pravila za Zine SSG |
| `heal` | Self-healing MAS prsten: svaki patch se MERI kroz WASM (nalaza pre/posle) i primenjuje samo ako dokazano smanjuje kvar |
| `sign_artifact` | SHA-256 + ECDSA P-256 poreklo; ključ nastaje u `~/.verifikator-mcp` i ne napušta mašinu |
| `verify_artifact` | Detektuje svaku izmenu posle potpisa i falsifikovan manifest |
| `remember_lesson` | **Memorija sa dokazom**: šalješ before/after, server sam validira oba i pamti isključivo kodove koji su dokazano nestali. Bez dokaza — odbijeno (brana protiv memory poisoning-a) |
| `recall_lessons` | Pregled lekcija i statistike (uskladišteno / pogodaka / odbijeno) |
| `audit_url` | Agent-readiness ocena sajta 0–100 (pojednostavljene provere; puni audit radi Agent Audit alat) |

## Primer toka za agenta

1. Agent generiše HTML → `validate_html` → 3 nalaza
2. `heal` → 3 merene popravke → `zero_error: true` (verifikovane lekcije se same pamte)
3. `sign_artifact` → manifest uz fajl
4. Sutra drugi agent: `verify_artifact` pre upotrebe → zna da li je fajl netaknut

## Pošteno o dometu

Validatori danas pokrivaju HTML i SuperMD — kapija je onoliko široka koliko
su joj validatori. Arhitektura prima nove `validate_*` alate (JSON, YAML,
shell…) bez menjanja protokola. `audit_url` je serverska, pojednostavljena
verzija punog audita. Sve provere su determinističke i ponovljive.

## Test

Sve testirano kroz pravi JSON-RPC tok: validacija (3 nalaza), heal (3
merene popravke → 0), potpis + detekcija izmene + detekcija falsifikovanog
manifesta, lekcija sa dokazom primljena / bez dokaza odbijena.
