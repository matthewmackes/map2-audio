import { IntelFXPanel } from '../IntelFXPanel'
import { useIntelFXPageContext } from '../IntelFXShell'

export function IntelFXPanelView() {
  const { intelfx, bypassState, onToggleBypass, setLcdText, lcdText } = useIntelFXPageContext()
  return (
    <IntelFXPanel
      intelfx={intelfx}
      bypassState={bypassState}
      onToggleBypass={(block) => onToggleBypass(block as never)}
      setLcdText={setLcdText}
      lcdText={lcdText}
    />
  )
}

export default IntelFXPanelView
