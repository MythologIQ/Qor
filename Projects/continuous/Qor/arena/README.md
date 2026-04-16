# HexaWars Arena

Autonomous build arena for the HexaWars turn-based hex-grid strategy game.

## Architecture

Full design documented in: [docs/plans/2026-04-16-hexawars-arena-autonomous-build.md](../docs/plans/2026-04-16-hexawars-arena-autonomous-build.md)

## Development

```bash
bun install
bun test
bun run dev
```

## Stack

- **Runtime:** Bun
- **Language:** TypeScript (strict mode, ESNext)
- **HTTP:** Hono v4
- **Coordinate system:** Cube hex (q, r, s with q+r+s=0)