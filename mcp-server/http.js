import process from 'node:process'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'

import { createServer } from './server.js'

const app = createMcpExpressApp()
const port = Number(process.env.MCP_PORT || 9001)

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,mcp-session-id,last-event-id,authorization')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  next()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, server: 'anaheim-community-figma-make' })
})

app.post('/mcp', async (req, res) => {
  const server = createServer()

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    })

    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)

    res.on('close', () => {
      transport.close()
      server.close()
    })
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      })
    }
  }
})

app.get('/mcp', async (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.'
      },
      id: null
    })
  )
})

app.delete('/mcp', async (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.'
      },
      id: null
    })
  )
})

app.listen(port, (error) => {
  if (error) {
    process.stderr.write(`Failed to start MCP HTTP server: ${error.message}\n`)
    process.exit(1)
  }

  process.stdout.write(`MCP HTTP server listening at http://localhost:${port}/mcp\n`)
})
