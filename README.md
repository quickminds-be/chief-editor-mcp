# chief-editor-mcp

MCP server for the [Chief Editor](https://api.reviewsandnotes.com) AI slop detector. Analyses text for AI-generated writing patterns and returns three scored dimensions — sloppiness, originality, and hype — with per-pattern annotations.

## Tools

### `analyze_text`

Analyse text for AI-generated writing patterns. Returns:

- **sloppiness** (0–1): structural LLM tells, filler phrases, robotic pacing, punctuation overuse → `clean` / `sloppy` / `ai_slop`
- **originality** (0–1): cliché density relative to word count → `original` / `bland` / `generic`
- **hype** (0–1): superlative/intensifier density → `grounded` / `salesy` / `overblown`
- **flags**: per-pattern detections with positions, matched text, rule IDs, and reasons
- **meta**: pacing, em-dash density, semicolon density, superlative density, cliché density labels

### `get_price`

Get the cost to analyse a text before paying. Free, no authentication required.

| Tier   | Words    | Price  |
|--------|----------|--------|
| small  | 0–100    | $0.02  |
| medium | 101–500  | $0.04  |
| large  | 501–2000 | $0.08  |

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chief-editor": {
      "command": "npx",
      "args": ["-y", "chief-editor-mcp"],
      "env": {
        "CHIEF_EDITOR_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add chief-editor -- npx -y chief-editor-mcp
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHIEF_EDITOR_API_KEY` | — | API key (bypasses x402 payment) |
| `CHIEF_EDITOR_URL` | `https://api.reviewsandnotes.com` | API base URL |

## API

Full OpenAPI spec: https://api.reviewsandnotes.com/openapi.yaml

Machine-readable description: https://api.reviewsandnotes.com/.well-known/llms.txt

## License

MIT
