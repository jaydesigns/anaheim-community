import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const categoryOptions = [
  'Free Community Events',
  'Service Opportunities',
  'Language Tutorial',
  'Self-Reliance Programs',
  'Sports',
  'Youth Activities',
  'Young Single Adults (18-35)',
  'Single Adults (36+)'
]

const eventFormFields = [
  'name',
  'description',
  'category',
  'location',
  'date',
  'time',
  'visibility',
  'contactPhone',
  'contactEmail',
  'coverPicture'
]

const markerIcons = {
  Sports: 'sports_soccer',
  'Youth Activities': 'family_star',
  'Service Opportunities': 'front_hand',
  'Language Tutorial': 'language',
  'Self-Reliance Programs': 'chat_bubble',
  'Young Single Adults (18-35)': 'celebration',
  'Single Adults (36+)': 'stars',
  'Free Community Events': 'groups'
}

const workspaceRoot = process.cwd()

const safeResolve = (relativePath) => {
  const cleaned = relativePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const absolutePath = path.resolve(workspaceRoot, cleaned)

  if (!absolutePath.startsWith(workspaceRoot)) {
    throw new Error('Path must stay within the workspace root')
  }

  return absolutePath
}

const formatText = (text) => ({
  content: [
    {
      type: 'text',
      text
    }
  ]
})

export const createServer = () => {
  const server = new McpServer({
    name: 'anaheim-community-figma-make',
    version: '1.0.0'
  })

  server.tool('project_overview', 'Get app architecture and UI behavior used for Figma Make prompts', async () => {
    const summary = {
      project: 'anaheim-community',
      stack: ['React 19', 'Vite 7', 'Mapbox GL JS'],
      keyFiles: ['src/App.jsx', 'src/App.css', 'src/components/MaterialSymbol.jsx'],
      mapBehavior: {
        markerSource: 'events saved in localStorage key communityEvents',
        markerClick: 'flyTo marker location, zoom in, open left event card',
        filterModel: 'default all categories; selecting a chip filters to one category; reset clears filter',
        sidebarBehavior: 'search always visible; chips collapse when form or selected event is open'
      },
      eventModel: {
        storage: 'browser localStorage only (no backend)',
        fields: eventFormFields,
        categories: categoryOptions
      }
    }

    return formatText(JSON.stringify(summary, null, 2))
  })

  server.tool('event_schema', 'Get event schema, categories, and icon names for design/code generation', async () => {
    return formatText(
      JSON.stringify(
        {
          localStorageKey: 'communityEvents',
          categories: categoryOptions,
          fields: eventFormFields,
          markerIcons
        },
        null,
        2
      )
    )
  })

  server.tool(
    'read_source_file',
    'Read a source file in this workspace by relative path',
    {
      relativePath: z.string().min(1),
      maxChars: z.number().int().positive().max(200000).optional()
    },
    async ({ relativePath, maxChars = 20000 }) => {
      const absolutePath = safeResolve(relativePath)
      const source = await fs.readFile(absolutePath, 'utf8')
      const truncated = source.length > maxChars ? `${source.slice(0, maxChars)}\n\n[truncated]` : source

      return formatText(truncated)
    }
  )

  server.tool(
    'figma_make_prompt',
    'Generate a ready-to-use prompt for Figma Make based on this codebase',
    {
      objective: z.string().min(1)
    },
    async ({ objective }) => {
      const prompt = [
        'Build from this existing React + Mapbox project and keep UI behavior consistent.',
        '',
        `Objective: ${objective}`,
        '',
        'Required product behavior:',
        '- Keep search bar visible at all times.',
        '- Collapse category chips when add-event form or selected event card is visible.',
        '- Category filters default to all categories selected.',
        '- Single category selection filters visible markers/events to that category.',
        '- Reset clears the category filter back to all categories.',
        '- Use Material Symbols icons via a reusable MaterialSymbol component.',
        '- Event form fields: name, description, category, location, date, time, visibility, phone, email, cover picture.',
        '- Persist events in localStorage using key communityEvents.',
        '- Marker click must center/zoom map and open event details card.',
        '',
        'Code references:',
        '- src/App.jsx',
        '- src/App.css',
        '- src/components/MaterialSymbol.jsx'
      ].join('\n')

      return formatText(prompt)
    }
  )

  return server
}
