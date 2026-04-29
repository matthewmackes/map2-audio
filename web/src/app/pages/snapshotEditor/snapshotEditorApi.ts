// SnapshotEditor API base resolver (T2467 follow-up).
// Module-scope, zero-React, evaluated once at import time. Lives
// here so the monolith no longer owns the network base, and any
// future sibling modules that need to hit the backend can import
// the resolved base directly without dragging the page module in.

export const API_BASE: string = (() => {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()
