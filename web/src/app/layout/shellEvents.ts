export const SHELL_OPEN_RESTART_CONFIRM_EVENT = 'map2:shell-open-restart-confirm'

export function dispatchShellOpenRestartConfirmEvent() {
  window.dispatchEvent(new CustomEvent(SHELL_OPEN_RESTART_CONFIRM_EVENT))
}
