import { PageHeader } from '../components/PageHeader'
import { AudioInterfaceControl } from '../../map2/components/AudioInterfaceControl'

export function HoToneJoGGPage() {
  return (
    <div className="stack">
      <PageHeader
        title="HoTone JoGG"
        subtitle="USB Audio Interface Configuration & Monitoring"
      />

      <AudioInterfaceControl />
    </div>
  )
}
