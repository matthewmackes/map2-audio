import { Outlet } from 'react-router-dom'

import { OUTBOARD_HARDWARE_DEVICES, type OutboardHardwareShellContextValue } from '../../OutboardHardwareShell'
import '../../OutboardHardwareShell.css'

export function WorkspaceOutboardHardwareOutlet() {
  const contextValue: OutboardHardwareShellContextValue = {
    devices: OUTBOARD_HARDWARE_DEVICES,
  }

  return <Outlet context={contextValue} />
}

export default WorkspaceOutboardHardwareOutlet
