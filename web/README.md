# MAP2 Web Frontend

The MAP2 web UI is production-only at `http://localhost:3000`.

## Supported Commands

```bash
# Build the production bundle
npm run build

# Serve the full production UI on port 3000
npm run preview

# Combined build + production start
npm run start:prod

# Validation
npm run typecheck
npm run test -- --runInBand
npm run lint
```

## Port Contract

- `3000`: only supported frontend port
- `8080`: backend API and WebSocket services

If you change frontend code, rebuild and refresh the browser on port 3000.
