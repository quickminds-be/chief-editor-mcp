#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_URL = process.env.CHIEF_EDITOR_URL ?? 'https://api.reviewsandnotes.com'
const API_KEY = process.env.CHIEF_EDITOR_API_KEY ?? ''

const server = new McpServer({
  name: 'chief-editor',
  version: '1.0.0',
  description:
    'AI slop detector — analyses text for AI-generated writing patterns and returns three scored dimensions (sloppiness, originality, hype) with per-pattern annotations.',
})

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (API_KEY) h['x-api-key'] = API_KEY
  return h
}

server.tool(
  'analyze_text',
  `Analyse text for AI-generated writing patterns ("slop").

Returns three scored dimensions (0–1):
- **sloppiness**: structural LLM tells, filler phrases, robotic pacing, punctuation overuse → clean / sloppy / ai_slop
- **originality**: cliché density relative to word count → original / bland / generic
- **hype**: superlative/intensifier density → grounded / salesy / overblown

Plus per-pattern flags with positions, matched text, rule IDs, and reasons.

Pricing: $0.02 (≤100 words), $0.04 (101–500), $0.08 (501–2000). Requires an API key or x402 payment.`,
  { text: z.string().max(10000).describe('Plain text to analyse. Max 2 000 words / 10 000 characters.') },
  async ({ text }) => {
    const res = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ text }),
    })

    if (!res.ok) {
      const body = await res.text()
      const hint = res.status === 402 ? ' Set CHIEF_EDITOR_API_KEY env var or provide x402 payment.' : ''
      return { content: [{ type: 'text', text: `Error ${res.status}: ${body}${hint}` }], isError: true }
    }

    const result = await res.json()
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'get_price',
  `Get the cost to analyse a text before paying. Returns the pricing tier, word count, and exact cost in USDC. Free — no payment required.`,
  {
    text: z
      .string()
      .max(10000)
      .optional()
      .describe('Text to price (word count computed server-side). Provide text or wordCount.'),
    wordCount: z
      .number()
      .int()
      .min(0)
      .max(2000)
      .optional()
      .describe('Word count to price directly. Provide text or wordCount.'),
  },
  async ({ text, wordCount }) => {
    const body = text ? { text } : { wordCount }
    const res = await fetch(`${API_URL}/price`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return { content: [{ type: 'text', text: `Error ${res.status}: ${errBody}` }], isError: true }
    }

    const result = await res.json()
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'send_feedback',
  `Submit feedback, bug reports, or feature requests for the Chief Editor API. Free — no payment or authentication required. Use this to report issues, suggest improvements, or share your experience.`,
  {
    feedback: z.string().max(2000).describe('Your feedback, bug report, or feature request (max 2000 chars).'),
    agent: z.string().optional().describe('Your agent or client identifier (optional).'),
  },
  async ({ feedback, agent }) => {
    const res = await fetch(`${API_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback, agent }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return { content: [{ type: 'text', text: `Error ${res.status}: ${errBody}` }], isError: true }
    }

    return { content: [{ type: 'text', text: 'Feedback submitted — thank you!' }] }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
