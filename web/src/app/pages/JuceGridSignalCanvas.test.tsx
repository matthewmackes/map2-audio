import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { JuceGridSignalCanvas, type JuceGridAudioInterfaceStatus } from './JuceGridSignalCanvas'
import type { Chain, Plugin } from '../../map2/types'

const pluginUri = 'plugin://compressor'

const chain: Chain = {
  id: 1,
  name: 'Flow A',
  is_active: true,
  created_at: '2026-03-15T00:00:00Z',
  updated_at: '2026-03-15T00:00:00Z',
  plugins: [
    {
      uri: pluginUri,
      name: 'Studio Compressor',
      position: 0,
      bypassed: false,
      parameters: {},
      in_ports: 2,
      out_ports: 2,
      latency_samples: 96,
      cpu_percent: 12.4,
    },
  ],
}

const pluginMeta: Record<string, Plugin> = {
  [pluginUri]: {
    uri: pluginUri,
    name: 'Studio Compressor',
    author: 'MAP2',
    category: 'Dynamics',
    class_label: 'Dynamics',
    version: '1.0.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
    format: 'VST3',
    sidechain_buses: 1,
  },
}

function buildInputStatus(): JuceGridAudioInterfaceStatus {
  return {
    deviceName: 'Default ALSA Output (currently PipeWire Media Server)',
    sampleRate: 48000,
    bufferSize: 128,
    isRunning: true,
    routingMode: 'series',
    bindings: [
      {
        selection_type: 'local_port',
        available: true,
        index: 0,
        name: 'Input 1',
      },
      {
        selection_type: 'local_port',
        available: true,
        index: 1,
        name: 'Input 2',
      },
      {
        selection_type: 'avb_endpoint',
        available: false,
        missing: true,
        endpoint_id: 'avb-in-1',
        direction: 'talker',
        device_name: 'Stage Rack Input',
        host: 'rack-a',
        channels: 2,
        sample_rate: 48000,
      },
    ],
    avbReadinessState: 'degraded',
    meterLevels: [0.28, 0.61],
  }
}

function buildOutputStatus(): JuceGridAudioInterfaceStatus {
  return {
    deviceName: 'Default ALSA Output (currently PipeWire Media Server)',
    sampleRate: 48000,
    bufferSize: 128,
    isRunning: true,
    routingMode: 'parallel_blend',
    bindings: [
      {
        selection_type: 'local_port',
        available: true,
        index: 0,
        name: 'Output 1',
      },
      {
        selection_type: 'local_port',
        available: true,
        index: 1,
        name: 'Output 2',
      },
      {
        selection_type: 'avb_endpoint',
        available: true,
        endpoint_id: 'avb-out-1',
        direction: 'listener',
        device_name: 'Main Room Listener',
        host: 'rack-b',
        channels: 2,
        sample_rate: 48000,
      },
    ],
    avbReadinessState: 'operational',
    meterLevels: [0.43, 0.52],
  }
}

function buildChainWithPluginCount(count: number): Chain {
  return {
    ...chain,
    plugins: Array.from({ length: count }, (_, index) => ({
      uri: `plugin://slot-${index}`,
      name: `Processor ${index + 1}`,
      position: index,
      bypassed: index === 5,
      parameters: {},
      in_ports: 2,
      out_ports: 2,
      latency_samples: 0,
      cpu_percent: 0,
    })),
  }
}

function buildPluginMetaForChain(targetChain: Chain): Record<string, Plugin> {
  return Object.fromEntries(
    targetChain.plugins.map((plugin, index) => [
      plugin.uri,
      {
        uri: plugin.uri,
        name: plugin.name,
        author: 'MAP2',
        category: index % 2 === 0 ? 'Dynamics' : 'Modulation',
        class_label: 'Effect',
        version: '1.0.0',
        license: 'AGPL-3.0-only',
        has_ui: false,
        in_ports: 2,
        out_ports: 2,
        parameters: [],
        format: 'VST3',
      } satisfies Plugin,
    ]),
  )
}

describe('JuceGridSignalCanvas', () => {
  it('renders uniform simplified signal cards with routing summaries above and below the block lane', () => {
    const handleInputPorts = jest.fn()
    const handleOutputPorts = jest.fn()
    const handlePluginSelect = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={chain}
        pluginMeta={pluginMeta}
        selectedPluginUri={pluginUri}
        onPluginSelect={handlePluginSelect}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        audioStatus={buildInputStatus()}
        audioOutputStatus={buildOutputStatus()}
        pluginLevels={{ [pluginUri]: { in: 0.31, out: 0.48 } }}
        automationSummary={{
          laneCountByPlugin: { [pluginUri]: 2 },
          armedLaneCountByPlugin: { [pluginUri]: 1 },
          playing: false,
          recording: true,
        }}
        showEndpoints
        onInputPortSelectClick={handleInputPorts}
        onOutputPortSelectClick={handleOutputPorts}
      />,
    )

    const inputRail = screen.getByTestId('juce-grid-signal-rail-input')
    const outputRail = screen.getByTestId('juce-grid-signal-rail-output')
    const pluginCard = screen.getByTestId('juce-grid-signal-plugin-card-0')

    expect(inputRail.compareDocumentPosition(pluginCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pluginCard.compareDocumentPosition(outputRail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(within(inputRail).getByText('AVB IN')).toBeTruthy()
    expect(within(outputRail).getByText('AVB OUT')).toBeTruthy()
    expect(within(inputRail).getByText('LOCAL')).toBeTruthy()
    expect(within(inputRail).getByText('AVB')).toBeTruthy()
    expect(within(inputRail).getByLabelText('AVB warning')).toBeTruthy()
    expect(within(outputRail).queryByLabelText('AVB warning')).toBeNull()
    expect(within(inputRail).getAllByText('2 in')).toHaveLength(2)
    expect(within(outputRail).getAllByText('2 out')).toHaveLength(2)

    expect(inputRail.getAttribute('title')).toContain('Default ALSA Output (currently PipeWire Media Server)')
    expect(inputRail.getAttribute('title')).toContain('Stage Rack Input')
    expect(inputRail.getAttribute('title')).toContain('missing')
    expect(outputRail.getAttribute('title')).toContain('Main Room Listener')

    const pluginTitle = within(pluginCard).getByText('Studio Compressor')
    const pluginCategory = within(pluginCard).getByText('Dynamics')

    expect(pluginTitle).toBeTruthy()
    expect(pluginTitle.getAttribute('title')).toBe('Studio Compressor')
    expect(pluginCategory).toBeTruthy()
    expect(pluginCategory.getAttribute('title')).toBe('Dynamics')
    expect(pluginCard.querySelector('.juce-grid-page__signal-plugin-face')).toBeTruthy()
    expect(pluginCard.querySelector('.juce-grid-page__signal-plugin-info')).toBeNull()
    expect(pluginCard.querySelector('.juce-grid-page__signal-plugin-hero-outline')).toBeNull()
    const heroImage = pluginCard.querySelector('.juce-grid-page__signal-plugin-hero-image')
    const heroSvg = pluginCard.querySelector('.juce-grid-page__signal-plugin-hero-svg')
    expect(heroImage).toBeTruthy()
    expect(heroImage?.getAttribute('data-icon-tone')).toBe('outline')
    expect(heroSvg).toBeTruthy()
    expect(heroSvg?.getAttribute('class')).toContain('is-outline')
    expect(within(pluginCard).getByTestId('juce-grid-signal-plugin-actions-0')).toBeTruthy()
    expect(within(pluginCard).getByRole('button', { name: 'Actions for Studio Compressor' })).toBeTruthy()
    expect(within(pluginCard).queryByText('CPU')).toBeNull()
    expect(within(pluginCard).queryByText('12.4%')).toBeNull()
    expect(within(pluginCard).queryByText('Latency')).toBeNull()
    expect(within(pluginCard).queryByText('SC')).toBeNull()
    expect(within(pluginCard).queryByText('Auto')).toBeNull()

    fireEvent.click(pluginCard)

    expect(handlePluginSelect).toHaveBeenCalledWith(pluginUri, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Configure input routing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Configure output routing' }))

    expect(handleInputPorts).toHaveBeenCalledTimes(1)
    expect(handleOutputPorts).toHaveBeenCalledTimes(1)
  })

  it('renders a line-free snake canvas without bridge or connector chrome', () => {
    const chainedFlow: Chain = {
      ...chain,
      plugins: [
        chain.plugins[0],
        {
          uri: 'plugin://chorus',
          name: 'Studio Chorus',
          position: 1,
          bypassed: true,
          parameters: {},
          in_ports: 2,
          out_ports: 2,
        },
      ],
    }

    const extendedMeta: Record<string, Plugin> = {
      ...pluginMeta,
      'plugin://chorus': {
        uri: 'plugin://chorus',
        name: 'Studio Chorus',
        author: 'MAP2',
        category: 'Modulation',
        class_label: 'Modulation',
        version: '1.0.0',
        license: 'AGPL-3.0-only',
        has_ui: false,
        in_ports: 2,
        out_ports: 2,
        parameters: [],
        format: 'VST3',
      },
    }

    render(
      <JuceGridSignalCanvas
        chain={chainedFlow}
        pluginMeta={extendedMeta}
        selectedPluginUri={pluginUri}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        audioStatus={buildInputStatus()}
        audioOutputStatus={buildOutputStatus()}
        pluginLevels={{
          [pluginUri]: { in: 0.31, out: 0.48 },
          'plugin://chorus': { in: 0.21, out: 0.32 },
        }}
        showEndpoints
      />,
    )

    expect(screen.queryByTestId('juce-grid-signal-flow-bridge-input')).toBeNull()
    expect(screen.queryByTestId('juce-grid-signal-flow-bridge-output')).toBeNull()
    expect(screen.queryByTestId('juce-grid-signal-flow-connector-0')).toBeNull()
    expect(screen.queryByTestId('juce-grid-signal-vertical-connector-0')).toBeNull()
  })

  it('falls back from unmapped plugin names to the mapped category icon before using the generic plugin fallback', () => {
    const multiEffectUri = 'plugin://shoegaze'
    const multiEffectChain: Chain = {
      ...chain,
      plugins: [
        {
          ...chain.plugins[0],
          uri: multiEffectUri,
          name: 'ShoeGaze',
        },
      ],
    }

    const multiEffectMeta: Record<string, Plugin> = {
      [multiEffectUri]: {
        ...pluginMeta[pluginUri],
        uri: multiEffectUri,
        name: 'ShoeGaze',
        category: 'Multi-Effect',
        class_label: 'Processor',
      },
    }

    render(
      <JuceGridSignalCanvas
        chain={multiEffectChain}
        pluginMeta={multiEffectMeta}
        selectedPluginUri={multiEffectUri}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        showEndpoints={false}
      />,
    )

    const pluginCard = screen.getByTestId('juce-grid-signal-plugin-card-0')
    const heroImage = pluginCard.querySelector('.juce-grid-page__signal-plugin-hero-image')
    const heroSvg = pluginCard.querySelector('.juce-grid-page__signal-plugin-hero-svg')

    expect(heroImage?.getAttribute('data-icon-tone')).toBe('outline')
    expect(heroSvg?.getAttribute('class')).toContain('is-outline')
    expect(heroSvg?.getAttribute('class')).not.toContain('is-solid')
  })

  it('builds left-aligned snake rows with a standard inline add card', () => {
    const longChain = buildChainWithPluginCount(7)
    const longMeta = buildPluginMetaForChain(longChain)

    render(
      <JuceGridSignalCanvas
        chain={longChain}
        pluginMeta={longMeta}
        selectedPluginUri={longChain.plugins[0].uri}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        showEndpoints={false}
      />,
    )

    const firstRow = screen.getByTestId('juce-grid-signal-row-0')
    const secondRow = screen.getByTestId('juce-grid-signal-row-1')

    expect(firstRow.getAttribute('data-row-direction')).toBe('forward')
    expect(secondRow.getAttribute('data-row-direction')).toBe('reverse')
    expect(firstRow.querySelectorAll('[data-testid^="juce-grid-signal-plugin-card-"]')).toHaveLength(4)
    expect(secondRow.querySelectorAll('[data-testid^="juce-grid-signal-plugin-card-"]')).toHaveLength(3)
    expect(within(secondRow).getByRole('button', { name: 'Add effect' })).toBeTruthy()
  })

  it('expands the row capacity from measured lane width without ResizeObserver support', async () => {
    const longChain = buildChainWithPluginCount(7)
    const longMeta = buildPluginMetaForChain(longChain)
    const resizeObserverOwner = globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }
    const originalResizeObserver = resizeObserverOwner.ResizeObserver

    delete resizeObserverOwner.ResizeObserver

    try {
      render(
        <JuceGridSignalCanvas
          chain={longChain}
          pluginMeta={longMeta}
          selectedPluginUri={longChain.plugins[0].uri}
          onPluginSelect={jest.fn()}
          onToggleBypass={jest.fn()}
          onReorderPlugins={jest.fn()}
          onAddPlugin={jest.fn()}
          showEndpoints={false}
        />,
      )

      const grid = screen.getByTestId('juce-grid-signal-grid')
      Object.defineProperty(grid, 'clientWidth', {
        configurable: true,
        value: 1500,
      })

      fireEvent(window, new Event('resize'))

      await waitFor(() => expect(screen.queryByTestId('juce-grid-signal-row-1')).toBeNull())

      const firstRow = screen.getByTestId('juce-grid-signal-row-0')
      expect(firstRow.getAttribute('data-row-direction')).toBe('forward')
      expect(firstRow.querySelectorAll('[data-testid^="juce-grid-signal-plugin-card-"]')).toHaveLength(7)
      expect(within(firstRow).getByRole('button', { name: 'Add effect' })).toBeTruthy()
    } finally {
      if (originalResizeObserver) {
        resizeObserverOwner.ResizeObserver = originalResizeObserver
      }
    }
  })

  it('prefers rendered slot width over the fallback estimate when recalculating row capacity', async () => {
    const longChain = buildChainWithPluginCount(7)
    const longMeta = buildPluginMetaForChain(longChain)
    const resizeObserverOwner = globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }
    const originalResizeObserver = resizeObserverOwner.ResizeObserver

    delete resizeObserverOwner.ResizeObserver

    try {
      render(
        <JuceGridSignalCanvas
          chain={longChain}
          pluginMeta={longMeta}
          selectedPluginUri={longChain.plugins[0].uri}
          onPluginSelect={jest.fn()}
          onToggleBypass={jest.fn()}
          onReorderPlugins={jest.fn()}
          onAddPlugin={jest.fn()}
          showEndpoints={false}
        />,
      )

      const grid = screen.getByTestId('juce-grid-signal-grid')
      Object.defineProperty(grid, 'clientWidth', {
        configurable: true,
        value: 1000,
      })

      const row = screen.getByTestId('juce-grid-signal-row-0')
      row.setAttribute('style', 'gap: 10px;')

      const firstSlot = row.querySelector('.juce-grid-page__signal-grid-item[data-slot-kind="plugin"]') as HTMLElement | null
      expect(firstSlot).toBeTruthy()
      Object.defineProperty(firstSlot as HTMLElement, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          width: 100,
          height: 100,
          top: 0,
          left: 0,
          right: 100,
          bottom: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }),
      })

      fireEvent(window, new Event('resize'))

      await waitFor(() => expect(screen.queryByTestId('juce-grid-signal-row-1')).toBeNull())

      const onlyRow = screen.getByTestId('juce-grid-signal-row-0')
      expect(onlyRow.querySelectorAll('[data-testid^="juce-grid-signal-plugin-card-"]')).toHaveLength(7)
      expect(within(onlyRow).getByRole('button', { name: 'Add effect' })).toBeTruthy()
    } finally {
      if (originalResizeObserver) {
        resizeObserverOwner.ResizeObserver = originalResizeObserver
      }
    }
  })

  it('re-attaches row-capacity measurement when a populated chain arrives after an empty mount', async () => {
    const longChain = buildChainWithPluginCount(7)
    const longMeta = buildPluginMetaForChain(longChain)
    const resizeObserverOwner = globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }
    const originalResizeObserver = resizeObserverOwner.ResizeObserver

    delete resizeObserverOwner.ResizeObserver

    try {
      const { rerender } = render(
        <JuceGridSignalCanvas
          chain={null}
          pluginMeta={{}}
          selectedPluginUri={null}
          onPluginSelect={jest.fn()}
          onToggleBypass={jest.fn()}
          onReorderPlugins={jest.fn()}
          onAddPlugin={jest.fn()}
          showEndpoints={false}
        />,
      )

      rerender(
        <JuceGridSignalCanvas
          chain={longChain}
          pluginMeta={longMeta}
          selectedPluginUri={longChain.plugins[0].uri}
          onPluginSelect={jest.fn()}
          onToggleBypass={jest.fn()}
          onReorderPlugins={jest.fn()}
          onAddPlugin={jest.fn()}
          showEndpoints={false}
        />,
      )

      const grid = await screen.findByTestId('juce-grid-signal-grid')
      Object.defineProperty(grid, 'clientWidth', {
        configurable: true,
        value: 1500,
      })

      fireEvent(window, new Event('resize'))

      await waitFor(() => expect(screen.queryByTestId('juce-grid-signal-row-1')).toBeNull())

      const onlyRow = screen.getByTestId('juce-grid-signal-row-0')
      expect(onlyRow.querySelectorAll('[data-testid^="juce-grid-signal-plugin-card-"]')).toHaveLength(7)
      expect(within(onlyRow).getByRole('button', { name: 'Add effect' })).toBeTruthy()
    } finally {
      if (originalResizeObserver) {
        resizeObserverOwner.ResizeObserver = originalResizeObserver
      }
    }
  })

  it('keeps the active card in place and subtly dims the other cards', () => {
    const longChain = buildChainWithPluginCount(4)
    const longMeta = buildPluginMetaForChain(longChain)

    render(
      <JuceGridSignalCanvas
        chain={longChain}
        pluginMeta={longMeta}
        selectedPluginUri={longChain.plugins[1].uri}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        showEndpoints={false}
      />,
    )

    const activeCard = screen.getByTestId('juce-grid-signal-plugin-card-1')
    const activeRowItem = activeCard.closest('.juce-grid-page__signal-grid-item')
    const dimmedItems = document.querySelectorAll('.juce-grid-page__signal-grid-item.is-dimmed')

    expect(activeCard.className).toContain('is-selected')
    expect(activeRowItem).toBeTruthy()
    expect(dimmedItems.length).toBeGreaterThan(0)
    expect(screen.queryByText('Position')).toBeNull()
    expect(screen.queryByText('Latency')).toBeNull()
  })

  it('tracks duplicate-uri selection by chain position', () => {
    const duplicateUri = 'plugin://duplicate-compressor'
    const duplicateChain: Chain = {
      ...chain,
      plugins: [
        {
          ...chain.plugins[0],
          uri: duplicateUri,
          position: 0,
        },
        {
          ...chain.plugins[0],
          uri: duplicateUri,
          position: 1,
        },
      ],
    }
    const duplicateMeta: Record<string, Plugin> = {
      [duplicateUri]: {
        ...pluginMeta[pluginUri],
        uri: duplicateUri,
      },
    }
    const handlePluginSelect = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={duplicateChain}
        pluginMeta={duplicateMeta}
        selectedPluginUri={duplicateUri}
        selectedPluginPosition={1}
        onPluginSelect={handlePluginSelect}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-1').className).toContain('is-selected')
    expect(screen.getByTestId('juce-grid-signal-plugin-card-0').className).not.toContain('is-selected')

    fireEvent.click(screen.getByTestId('juce-grid-signal-plugin-card-0'))
    expect(handlePluginSelect).toHaveBeenCalledWith(duplicateUri, 0)
  })

  it('reorders duplicate-uri cards by position instead of collapsing them by URI', () => {
    const duplicateUri = 'plugin://duplicate-delay'
    const duplicateChain: Chain = {
      ...chain,
      plugins: [
        {
          ...chain.plugins[0],
          uri: duplicateUri,
          position: 0,
          name: 'Delay A',
        },
        {
          ...chain.plugins[0],
          uri: duplicateUri,
          position: 1,
          name: 'Delay B',
        },
        {
          ...chain.plugins[0],
          uri: 'plugin://widener',
          position: 2,
          name: 'Widener',
        },
      ],
    }
    const duplicateMeta: Record<string, Plugin> = {
      [duplicateUri]: {
        ...pluginMeta[pluginUri],
        uri: duplicateUri,
        name: 'Stereo Delay',
        category: 'Delay',
      },
      'plugin://widener': {
        ...pluginMeta[pluginUri],
        uri: 'plugin://widener',
        name: 'Widener',
        category: 'Modulation',
      },
    }
    const handleReorderPlugins = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={duplicateChain}
        pluginMeta={duplicateMeta}
        selectedPluginUri={duplicateUri}
        selectedPluginPosition={0}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={handleReorderPlugins}
      />,
    )

    const firstDuplicate = screen.getByTestId('juce-grid-signal-plugin-card-0')
    const thirdCard = screen.getByTestId('juce-grid-signal-plugin-card-2')

    fireEvent.dragStart(firstDuplicate)
    fireEvent.dragOver(thirdCard)
    fireEvent.drop(thirdCard)

    expect(handleReorderPlugins).toHaveBeenCalledWith([
      { uri: duplicateUri, position: 1 },
      { uri: 'plugin://widener', position: 2 },
      { uri: duplicateUri, position: 0 },
    ])
  })

  it('pages tablet branches as eight real effect tiles per page without a tablet add tile', () => {
    const longChain = buildChainWithPluginCount(10)
    const longMeta = buildPluginMetaForChain(longChain)

    const { rerender } = render(
      <JuceGridSignalCanvas
        chain={longChain}
        branchId="flow-0"
        pluginMeta={longMeta}
        selectedPluginUri={longChain.plugins[0].uri}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        tabletMode
        focusedBranchId="flow-0"
        currentBranchPage={0}
        onBranchPageChange={jest.fn()}
        showEndpoints={false}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-0')).toBeTruthy()
    expect(screen.getByTestId('juce-grid-signal-plugin-card-7')).toBeTruthy()
    expect(screen.queryByTestId('juce-grid-signal-plugin-card-8')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add effect' })).toBeNull()

    rerender(
      <JuceGridSignalCanvas
        chain={longChain}
        branchId="flow-0"
        pluginMeta={longMeta}
        selectedPluginUri={longChain.plugins[8].uri}
        onPluginSelect={jest.fn()}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        tabletMode
        focusedBranchId="flow-0"
        currentBranchPage={1}
        onBranchPageChange={jest.fn()}
        showEndpoints={false}
      />,
    )

    expect(screen.getByTestId('juce-grid-signal-plugin-card-8')).toBeTruthy()
    expect(screen.getByTestId('juce-grid-signal-plugin-card-9')).toBeTruthy()
    expect(screen.queryByTestId('juce-grid-signal-plugin-card-7')).toBeNull()
  })

  it('clears tablet selection from empty grid taps and removes per-tile overflow actions', () => {
    const handlePluginSelect = jest.fn()
    const handleCanvasEmptyPress = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={chain}
        branchId="flow-0"
        pluginMeta={pluginMeta}
        selectedPluginUri={pluginUri}
        onPluginSelect={handlePluginSelect}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        tabletMode
        focusedBranchId="flow-0"
        currentBranchPage={0}
        onBranchPageChange={jest.fn()}
        onCanvasEmptyPress={handleCanvasEmptyPress}
      />,
    )

    fireEvent.click(screen.getByTestId('juce-grid-signal-plugin-card-0'))
    expect(handlePluginSelect).toHaveBeenCalledWith(pluginUri, 0)

    fireEvent.click(screen.getByTestId('juce-grid-signal-grid'))
    expect(handleCanvasEmptyPress).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Actions for Studio Compressor' })).toBeNull()
  })
})
