import process from 'node:process'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const start = async () => {
  const server = createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

start().catch((error) => {
  process.stderr.write(`MCP server failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
