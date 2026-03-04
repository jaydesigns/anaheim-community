# use-mapbox-gl-js-with-react

This is supporting code for the Mapbox tutorial [Use Mapbox GL JS in an React app](https://docs.mapbox.com/help/tutorials/use-mapbox-gl-js-with-react/).

## Overview

This tutorial walks through how to setup [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) in an [React](https://react.dev) project.  


You'll learn how to:
- Setup a Vite JS app to use React
- How to install Mapbox GL JS and its dependencies.
- Use Mapbox GL JS to render a full screen map.
- How to add a toolbar which displays map state like `longitude`, `latitude`, and `zoom` level and is updated as the map is interacted with (showing the map to app data flow).
- How to create a UI button to reset the map to its original view (showing the app to map data flow).


## Prerequisites

- Node v18.20 or higher
- npm

## How to run

- Clone this repository and navigate to this directory
- Install dependencies with `npm install`
- Copy `.env.example` to `.env` and set `VITE_MAPBOX_ACCESS_TOKEN` with an access token from your [Mapbox account](https://console.mapbox.com/).
- Run the development server with `npm run dev` and open the app in your browser at [http://localhost:5173](http://localhost:5173).

## Community events workflow

- Click the `+` button in the bottom-left Community Events bar to open the add-event form.
- Added events are geocoded through Mapbox and placed on the map as category-based markers.
- Clicking a marker zooms and centers the map on that event and opens the event info card in the left panel.
- Event data is stored in browser `localStorage` under the `communityEvents` key (no backend persistence yet).

## AI Agents and MCP Servers

These instructions work well for apps scaffolded with `npm create @mapbox/web-app`.

### 1) Agent instructions

- See `AGENTS.md` for project-specific guidance (stack, coding conventions, and Mapbox-specific rules).
- If you use GitHub Copilot Agent mode or another coding agent, keep that file updated so the agent follows your project standards.

### 2) MCP server setup (VS Code)

- Copy `.vscode/mcp.json.example` to `.vscode/mcp.json`.
- Update server commands and environment variables for your local environment.
- Restart your MCP client (or VS Code window) so servers reconnect with the new config.

### 3) Recommended MCP servers for this project

- **Filesystem**: lets the agent read and edit files in this repository.
- **Git/GitHub**: lets the agent inspect PRs/issues and repository history.
- **Fetch/Web**: lets the agent retrieve docs (for example, Mapbox API docs) while implementing features.
- **Mapbox-specific MCP (optional)**: add your org's Mapbox MCP server, if available, for account/internal workflows.

### 3.1) Local MCP server for Figma Make

This repo now includes a local MCP server at `mcp-server/index.js` with tools that expose project context for Figma Make workflows.

- Install dependencies: `npm install`
- Start server manually: `npm run mcp:figma-make`
- Or use the included VS Code MCP entry `anaheim-figma-make` from `.vscode/mcp.json.example`

URL mode for Figma Make:

- Start HTTP MCP server: `npm run mcp:figma-make:http`
- Default URL to enter in Figma: `http://localhost:3333/mcp`
- Optional custom port: `MCP_PORT=4000 npm run mcp:figma-make:http`

Available tools:
- `project_overview`: app architecture + behavior summary
- `event_schema`: event fields, categories, and marker icon names
- `read_source_file`: read workspace source files by relative path
- `figma_make_prompt`: generate a Figma Make prompt based on your objective

### 4) Example agent tasks

- "Add a new map control and update the README."
- "Refactor `src/App.jsx` to extract the map setup into a custom hook."
- "Add tests for map state behavior and run `npm run lint`."

Tip: Ask agents to run `npm run lint` after edits to catch issues quickly.
