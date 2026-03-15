import { IntelFXPanel } from '../components/IntelFX/IntelFXPanel'
import { useIntelFXPageContext } from './IntelFXPage'

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
