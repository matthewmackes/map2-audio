import '../../OutboardHardwareShell.css'

import { OutboardHardwareOverviewPage } from '../../OutboardHardwareOverviewPage'
import { buildWorkspaceOutboardHardwarePath } from '../../outboardHardwareRoutes'

export function WorkspaceOutboardHardwareOverviewPage() {
  return <OutboardHardwareOverviewPage buildDevicePath={buildWorkspaceOutboardHardwarePath} />
}

export default WorkspaceOutboardHardwareOverviewPage
