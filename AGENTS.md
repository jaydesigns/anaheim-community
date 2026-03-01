# AI Agent Instructions

This repository is a Vite + React web app using Mapbox GL JS and Mapbox Search.

## Project quick start

1. Install dependencies: `npm install`
2. Configure env vars: copy `.env.example` to `.env`
3. Set `VITE_MAPBOX_ACCESS_TOKEN`
4. Start dev server: `npm run dev`

## Tech stack

- React 19
- Vite 7
- mapbox-gl
- @mapbox/search-js-react

## Coding rules for agents

- Do not hardcode secrets or tokens in source files.
- Read the Mapbox token from `import.meta.env.VITE_MAPBOX_ACCESS_TOKEN`.
- Keep map initialization/cleanup in `useEffect`.
- Keep changes minimal and focused; avoid unrelated refactors.
- Follow existing formatting and lint rules.

## Validation checklist

- Run `npm run lint` after code edits.
- If behavior changed, verify in browser with `npm run dev`.
- Update `README.md` when setup or workflow changes.

## Mapbox-specific notes

- Use public Mapbox access tokens intended for client-side apps.
- Do not commit private keys or server credentials.
- Keep default map interactions responsive (avoid blocking UI work in render).
