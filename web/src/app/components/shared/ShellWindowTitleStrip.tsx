import { useShellWindowOptional } from '../../layout/useShellWindow'
import { WindowTitleStrip } from './WindowTitleStrip'

/**
 * Convenience wrapper that reads shell window context and renders a WindowTitleStrip.
 * Drop this at the top of any page component to get the titlebar automatically.
 * Falls back to nothing if no context is available.
 */
export function ShellWindowTitleStrip() {
  const shell = useShellWindowOptional()

  if (!shell) {
    return null
  }

  return (
    <WindowTitleStrip
      title={shell.title}
      titleIcon={shell.titleIcon}
      routeHint={shell.routeHint}
      accentColor={shell.accentColor}
      onClose={shell.onClose}
    />
  )
}
