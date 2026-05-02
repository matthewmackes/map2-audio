import { IntelFXPanel } from '../IntelFXPanel'
import { useIntelFXPageContext } from '../IntelFXShell'
import { DeviceLandingHeader } from '../../Shared/DeviceLandingHeader'
import { intelfxDeviceManifest } from '../deviceManifest'

export function IntelFXPanelView() {
  const { intelfx, bypassState, onToggleBypass, setLcdText, lcdText } = useIntelFXPageContext()
  return (
    <>
      <DeviceLandingHeader manifest={intelfxDeviceManifest} />
      <IntelFXPanel
        intelfx={intelfx}
        bypassState={bypassState}
        onToggleBypass={(block) => onToggleBypass(block as never)}
        setLcdText={setLcdText}
        lcdText={lcdText}
      />
    </>
  )
}

export default IntelFXPanelView
