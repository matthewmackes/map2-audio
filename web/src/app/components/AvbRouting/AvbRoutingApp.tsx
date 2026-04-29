// AVB Routing Matrix - main application shell. T2475 (E1):
// migrated from MUI to Carbon. Box → semantic divs, CircularProgress
// → Carbon Loading, Alert+Typography → InlineNotification + spans,
// useTheme/useMediaQuery → CSS @media via stylesheet. Safe-patch
// banner now consumes the canonical AlertPanel-style classNames
// driven by --map2-alert-* tokens.

import { InlineNotification, Loading } from '@carbon/react'
import { WarningAltFilled } from '@carbon/icons-react'

import { RoutingProvider, useRoutingState } from './context/RoutingContext'
import { TopBar } from './components/TopBar/TopBar'
import { NodeTree } from './components/NodeTree/NodeTree'
import { RoutingGrid } from './components/RoutingGrid/RoutingGrid'
import { InspectorPanel } from './components/Inspector/InspectorPanel'
import './AvbRoutingApp.css'

function AvbRoutingAppInner() {
  const state = useRoutingState()

  if (state.loading && Object.keys(state.endpoints).length === 0) {
    return (
      <div className="avb-routing-app__loading">
        <Loading withOverlay={false} description="Loading AVB routing matrix" />
        <span className="avb-routing-app__loading-title">
          Loading AVB routing matrix...
        </span>
        <span className="avb-routing-app__loading-subtitle">
          Discovering endpoints and connections
        </span>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="avb-routing-app__error">
        <InlineNotification
          kind="error"
          title="AVB Routing Error"
          subtitle={state.error}
          lowContrast
          hideCloseButton
        />
        <span className="avb-routing-app__error-hint">Please check:</span>
        <ul className="avb-routing-app__error-list">
          <li>Backend API is running (http://localhost:8080)</li>
          <li>AVB is enabled in configuration</li>
          <li>Network interfaces are configured</li>
        </ul>
      </div>
    )
  }

  return (
    <div className="avb-routing-app">
      <TopBar />

      <div className="avb-routing-app__body">
        <div className="avb-routing-app__sidebar avb-routing-app__sidebar--left">
          <NodeTree />
        </div>

        <div className="avb-routing-app__grid">
          <RoutingGrid />
        </div>

        <div className="avb-routing-app__sidebar avb-routing-app__sidebar--right">
          <InspectorPanel />
        </div>
      </div>

      {state.safePatchMode && (
        <div className="avb-routing-app__safe-patch" role="status">
          <WarningAltFilled size={16} />
          <span className="avb-routing-app__safe-patch-title">
            Safe patch mode active
          </span>
          <span className="avb-routing-app__safe-patch-detail">
            ({Object.keys(state.pendingRoutes).length} pending changes)
          </span>
        </div>
      )}
    </div>
  )
}

export function AvbRoutingApp() {
  return (
    <RoutingProvider>
      <AvbRoutingAppInner />
    </RoutingProvider>
  )
}

export default AvbRoutingApp
