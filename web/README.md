# MAP2 Web Frontend

The MAP2 web UI is production-only at `http://localhost:3000`.

## Supported Commands

```bash
# Build the production bundle
npm run build

# Serve the full production UI on port 3000
npm run serve

# Combined build + production start
npm run start:prod

# Validation
npm run typecheck
npm run test -- --runInBand
npm run lint
```

`npm run build` now publishes `dist/` atomically so the live port-3000 server does not briefly serve an `index.html` that points at a not-yet-written hashed bundle.
`npm run serve` runs the dedicated production server for `web/dist`, with backend proxying to `8080` and strict `404` responses for missing static assets.

## Port Contract

- `3000`: only supported frontend port
- `8080`: backend API and WebSocket services

If you change frontend code, rebuild and refresh the browser on port 3000.
