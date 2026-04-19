import { fireEvent, render, screen } from '@testing-library/react'
import type { Plugin } from '../../../map2/types'
import { withMidiDialog } from './withMidiDialog'

jest.mock('./Dialogs/MidiMappingDialog', () => ({
  MidiMappingDialog: ({ isOpen, plugin }: { isOpen: boolean; plugin: Plugin }) => (
    isOpen ? (
      <div data-testid="midi-dialog">
        {plugin.parameters.length}:{plugin.parameters[0]?.symbol ?? 'none'}
      </div>
    ) : null
  ),
}))

interface TestProps {
  plugin?: Plugin
  chainId?: number
  onOpenMidiMappings?: () => void
}

function TestCard({ onOpenMidiMappings }: TestProps) {
  return (
    <button type="button" onClick={onOpenMidiMappings}>
      Open MIDI
    </button>
  )
}

const WrappedCard = withMidiDialog(TestCard, 'map2://juce/test', [
  { index: 0, name: 'Static Parameter', symbol: 'static_param' },
])

const livePlugin: Plugin = {
  uri: 'map2://juce/test',
  name: 'Live Test Plugin',
  author: 'MAP2',
  category: 'Utility',
  class_label: 'Effect',
  version: '1.0',
  license: 'MIT',
  has_ui: false,
  in_ports: 2,
  out_ports: 2,
  parameters: [
    {
      index: 0,
      name: 'Live Parameter A',
      symbol: 'live_param_a',
      min: 0,
      max: 100,
      default: 50,
      is_toggled: false,
      is_log: false,
    },
    {
      index: 1,
      name: 'Live Parameter B',
      symbol: 'live_param_b',
      min: 0,
      max: 1,
      default: 0,
      is_toggled: true,
      is_log: false,
    },
  ],
}

describe('withMidiDialog', () => {
  it('prefers live plugin metadata over static fallback definitions', () => {
    render(<WrappedCard plugin={livePlugin} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open MIDI' }))

    expect(screen.getByTestId('midi-dialog').textContent).toBe('2:live_param_a')
  })
})
