import '../../OutboardHardwareShell.css'

import { OutboardHardwareDevicePage } from '../../OutboardHardwareDevicePage'
import { buildWorkspaceOutboardHardwarePath } from '../../outboardHardwareRoutes'

export function WorkspaceOutboardHardwareDevicePage() {
  return <OutboardHardwareDevicePage buildDevicePath={buildWorkspaceOutboardHardwarePath} />
}

export default WorkspaceOutboardHardwareDevicePage
