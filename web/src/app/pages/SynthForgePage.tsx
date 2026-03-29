import { ArrowLeft, Waveform } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '@/app/components/PageHeader'
import { SynthForgeCard } from '@/app/components/PluginCards/Custom/JUCE/SynthForgeCard'
import type { Plugin } from '@/map2/types'
import './SynthForgePage.css'

const SYNTHFORGE_PLUGIN_URI = 'map2://juce/synthforge'

function buildStandaloneSynthForgePlugin(): Plugin {
  return {
    uri: SYNTHFORGE_PLUGIN_URI,
    name: 'SynthForge',
    author: 'MAP2',
    category: 'Instrument',
    class_label: 'Instrument',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 0,
    out_ports: 2,
    parameters: [],
  }
}

export function SynthForgePage() {
  const navigate = useNavigate()
  const plugin = useMemo(() => buildStandaloneSynthForgePlugin(), [])

  return (
    <section className="synthforge-page">
      <PageHeader
        title="SynthForge"
        subtitle="Sampler, SoundFont, and multitimbral synthesis workspace with the full five-tab workstation flow."
        icon={<Waveform size={24} />}
        actions={(
          <Button kind="secondary" size="sm" renderIcon={ArrowLeft} onClick={() => navigate('/juce-grid')}>
            Back to Audio Grid
          </Button>
        )}
      />

      <div className="synthforge-page__workspace">
        <SynthForgeCard
          plugin={plugin}
          parameterValues={{}}
          onParameterChange={() => undefined}
          onParameterChangeEnd={() => undefined}
          accentColor="#38d6c4"
          compact={false}
        />
      </div>
    </section>
  )
}

export default SynthForgePage
