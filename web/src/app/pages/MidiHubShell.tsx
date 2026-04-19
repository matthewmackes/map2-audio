import {
  GlobalTheme,
  Theme,
} from '@carbon/react'
import { useLocation, Outlet } from 'react-router-dom'
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { useMidiHubOverview } from '../components/MidiHub/useMidiHubOverview'
import { MidiHubStatusBar } from '../components/MidiHub/MidiHubStatusBar'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { ShellWindowProvider } from '../layout/ShellWindowContext'
import { useTheme } from '../theme'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './MidiHubShell.css'

export function MidiHubShell() {
  const location = useLocation()
  const { localNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.midiHub)
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId
  const scopeKey = apiNodeId ?? 'local'
  const { theme } = useTheme()
  useMidiHubOverview(apiNodeId, scopeKey)
  const resolvedTheme = theme.carbonTheme ?? 'g100'

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <GlobalTheme theme={resolvedTheme}>
        <Theme as="div" theme={resolvedTheme} className="midi-hub-shell">
          <ShellWindowTitleStrip />
          <ShellWindowProvider value={null}>
            <WorkspacePageTemplate
              className="midi-hub-shell__template"
              windowClassName="midi-hub-shell__frame"
              contentClassName="midi-hub-shell__content"
              sidebar={null}
              content={(
                <main className="midi-hub-shell__content-body" key={location.pathname}>
                  <MidiHubStatusBar apiNodeId={apiNodeId} scopeKey={scopeKey} />
                  <Outlet />
                </main>
              )}
            />
          </ShellWindowProvider>
        </Theme>
      </GlobalTheme>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubShell
