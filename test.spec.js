import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { createServer } from 'node:http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const MOCK_PORT = 9876
const MOCK_URL = `http://localhost:${MOCK_PORT}`

// ─── Mock API server ────────────────────────────────────────────────────────

const MOCK_ANALYZE_RESULT = {
  sloppiness: { score: 0.4, label: 'sloppy' },
  originality: { score: 0.2, label: 'generic' },
  hype: { score: 0.5, label: 'salesy' },
  flags: [
    {
      pos: [0, 0, 0, 27],
      offset: 0,
      length: 27,
      text: "In today's fast-paced world",
      rule: 'in-todays-world',
      reason: 'Generic scene-setting opener with no specificity',
    },
  ],
  meta: {
    pacing: 'too_short',
    superlative_density: 'low',
    emdash_density: 'low',
    semicolon_density: 'low',
    cliche_density: 'moderate',
    avg_sentence_length: 10,
    sentence_count: 1,
    word_count: 5,
  },
  wordCount: 5,
  tier: 'small',
}

const MOCK_PRICE_RESULT = {
  tier: 'small',
  wordCount: 5,
  price: '0.02',
  maxPrice: '0.08',
  currency: 'USDC',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  network: 'eip155:8453',
  scheme: 'upto',
}

let mockServer

function startMockApi() {
  return new Promise((resolve) => {
    mockServer = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json')

        const apiKey = req.headers['x-api-key']

        if (req.url === '/analyze' && req.method === 'POST') {
          if (!apiKey) {
            res.writeHead(402)
            res.end(JSON.stringify({ error: 'Payment required' }))
            return
          }
          const parsed = JSON.parse(body)
          if (!parsed.text) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Missing required field: text' }))
            return
          }
          res.writeHead(200)
          res.end(JSON.stringify(MOCK_ANALYZE_RESULT))
          return
        }

        if (req.url === '/feedback' && req.method === 'POST') {
          const parsed = JSON.parse(body)
          if (!parsed.feedback) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Missing required field: feedback' }))
            return
          }
          res.writeHead(200)
          res.end(JSON.stringify({ ok: true }))
          return
        }

        if (req.url === '/price' && req.method === 'POST') {
          const parsed = JSON.parse(body)
          if (!parsed.text && parsed.wordCount === undefined) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: 'Provide text or wordCount' }))
            return
          }
          res.writeHead(200)
          res.end(JSON.stringify(MOCK_PRICE_RESULT))
          return
        }

        res.writeHead(404)
        res.end(JSON.stringify({ error: 'not found' }))
      })
    })
    mockServer.listen(MOCK_PORT, () => resolve())
  })
}

// ─── MCP client helper ──────────────────────────────────────────────────────

function connectMcpClient(env = {}) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [new URL('./index.js', import.meta.url).pathname],
    env: { ...process.env, CHIEF_EDITOR_URL: MOCK_URL, ...env },
  })
  const client = new Client({ name: 'test', version: '1.0.0' })
  return { client, transport }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('chief-editor-mcp', () => {
  beforeAll(async () => {
    await startMockApi()
  })

  afterAll(async () => {
    await new Promise((r) => mockServer.close(r))
  })

  describe('tool discovery', () => {
    it('lists analyze_text, get_price, and send_feedback tools', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const { tools } = await client.listTools()
      const names = tools.map((t) => t.name)
      expect(names).toContain('analyze_text')
      expect(names).toContain('get_price')
      expect(names).toContain('send_feedback')
      await client.close()
    })

    it('analyze_text tool has text input schema', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const { tools } = await client.listTools()
      const analyze = tools.find((t) => t.name === 'analyze_text')
      expect(analyze.inputSchema.properties.text).toBeTruthy()
      await client.close()
    })

    it('get_price tool has text and wordCount inputs', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const { tools } = await client.listTools()
      const price = tools.find((t) => t.name === 'get_price')
      expect(price.inputSchema.properties.text).toBeTruthy()
      expect(price.inputSchema.properties.wordCount).toBeTruthy()
      await client.close()
    })
  })

  describe('get_price', () => {
    it('returns pricing for text input', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const result = await client.callTool({
        name: 'get_price',
        arguments: { text: 'Hello world' },
      })
      const body = JSON.parse(result.content[0].text)
      expect(body.tier).toBe('small')
      expect(body.price).toBe('0.02')
      expect(body.scheme).toBe('upto')
      expect(body.currency).toBe('USDC')
      expect(result.isError).toBeFalsy()
      await client.close()
    })

    it('returns pricing for wordCount input', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const result = await client.callTool({
        name: 'get_price',
        arguments: { wordCount: 50 },
      })
      const body = JSON.parse(result.content[0].text)
      expect(body.tier).toBe('small')
      expect(result.isError).toBeFalsy()
      await client.close()
    })
  })

  describe('analyze_text', () => {
    it('returns analysis when API key is set', async () => {
      const { client, transport } = connectMcpClient({ CHIEF_EDITOR_API_KEY: 'test-key' })
      await client.connect(transport)
      const result = await client.callTool({
        name: 'analyze_text',
        arguments: { text: "In today's fast-paced world" },
      })
      expect(result.isError).toBeFalsy()
      const body = JSON.parse(result.content[0].text)
      expect(body.sloppiness).toBeTruthy()
      expect(body.sloppiness.score).toBeTypeOf('number')
      expect(body.sloppiness.label).toBeTypeOf('string')
      expect(body.originality).toBeTruthy()
      expect(body.hype).toBeTruthy()
      expect(body.flags).toBeInstanceOf(Array)
      expect(body.flags[0].pos).toBeInstanceOf(Array)
      expect(body.flags[0].rule).toBe('in-todays-world')
      expect(body.meta).toBeTruthy()
      expect(body.wordCount).toBeTypeOf('number')
      expect(body.tier).toBe('small')
      await client.close()
    })

    it('returns 402 error without API key', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const result = await client.callTool({
        name: 'analyze_text',
        arguments: { text: 'Hello world' },
      })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toMatch(/402/)
      expect(result.content[0].text).toMatch(/CHIEF_EDITOR_API_KEY/)
      await client.close()
    })
  })

  describe('send_feedback', () => {
    it('submits feedback successfully', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const result = await client.callTool({
        name: 'send_feedback',
        arguments: { feedback: 'Great tool!', agent: 'test-agent' },
      })
      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toMatch(/thank you/i)
      await client.close()
    })

    it('works without agent identifier', async () => {
      const { client, transport } = connectMcpClient()
      await client.connect(transport)
      const result = await client.callTool({
        name: 'send_feedback',
        arguments: { feedback: 'Needs more rules for academic writing' },
      })
      expect(result.isError).toBeFalsy()
      await client.close()
    })
  })
})
