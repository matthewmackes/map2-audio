export const OUTBOARD_HARDWARE_BASE_PATH = '/outboard-hardware'
export const WORKSPACE_OUTBOARD_HARDWARE_BASE_PATH = '/workspace/outboard-hardware'

export function buildOutboardHardwarePath(deviceId?: string | null): string {
  return deviceId ? `${OUTBOARD_HARDWARE_BASE_PATH}/${deviceId}` : OUTBOARD_HARDWARE_BASE_PATH
}

export function buildWorkspaceOutboardHardwarePath(deviceId?: string | null): string {
  return deviceId ? `${WORKSPACE_OUTBOARD_HARDWARE_BASE_PATH}/${deviceId}` : WORKSPACE_OUTBOARD_HARDWARE_BASE_PATH
}
