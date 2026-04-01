import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'

import { JuceGridSignalCanvas } from './SnapshotEditorSignalCanvas'

const pluginMeta = {
  'plugin://drive': {
    uri: 'plugin://drive',
    name: 'Drive',
    category: 'Drive',
  },
} as any

function buildChain(bypassed: boolean) {
  return {
    id: 101,
    name: 'Main Chain',
    is_active: true,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    plugins: [
      {
        uri: 'plugin://drive',
        name: 'Drive',
        position: 0,
        bypassed,
        parameters: {},
      },
    ],
    loop_insertions: [],
    effects_loops: [],
    runtime_sync: null,
  }
}

describe('SnapshotEditorSignalCanvas', () => {
  it('marks bypassed plugins with the dimmed card class', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(true)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-0')).toHaveClass('is-bypassed')
  })

  it('keeps active plugins at full-opacity state', () => {
    render(
      <JuceGridSignalCanvas
        chain={buildChain(false)}
        pluginMeta={pluginMeta}
        selectedPluginUri={null}
        selectedPluginPosition={null}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-0')).not.toHaveClass('is-bypassed')
  })
})
