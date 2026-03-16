import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  JuceGridRoutingVisualizer,
  getJuceGridRoutingInspectorItems,
  type JuceGridRoutingFlowInfo,
} from './JuceGridRoutingVisualizer'

function createFlow(
  id: string,
  overrides: Partial<JuceGridRoutingFlowInfo> = {},
): JuceGridRoutingFlowInfo {
  return {
    id,
    label: id.toUpperCase(),
    color: '#0f62fe',
    muted: false,
    active: id === 'a',
    ...overrides,
  }
}

describe('JuceGridRoutingVisualizer', () => {
  it('renders clickable routing markers for parallel mode', () => {
    const handleMarkerSelect = jest.fn()

    render(
      <JuceGridRoutingVisualizer
        mode="parallel_blend"
        flows={[
          createFlow('a', { blendPercent: 65, active: true }),
          createFlow('b', { blendPercent: 35, active: false }),
        ]}
        activeFlowId="a"
        onMarkerSelect={handleMarkerSelect}
      />,
    )

    expect(screen.getByRole('button', { name: 'Input routing inspector' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Split routing inspector' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mix routing inspector' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Output routing inspector' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Split routing inspector' }))
    expect(handleMarkerSelect).toHaveBeenCalledWith('split')
  })

  it('supports compact keyboard access for sidechain markers', () => {
    const handleMarkerSelect = jest.fn()

    render(
      <JuceGridRoutingVisualizer
        mode="sidechain"
        compact
        flows={[
          createFlow('a', { active: true }),
          createFlow('b', { active: false }),
        ]}
        activeFlowId="a"
        onMarkerSelect={handleMarkerSelect}
      />,
    )

    const sidechainMarker = screen.getByRole('button', { name: 'SC routing inspector' })
    const keyMarker = screen.getByRole('button', { name: 'Key routing inspector' })

    expect(screen.getByRole('button', { name: 'In routing inspector' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Out routing inspector' })).toBeTruthy()
    expect(sidechainMarker).toBeTruthy()
    expect(keyMarker).toBeTruthy()

    fireEvent.keyDown(sidechainMarker, { key: 'Enter' })
    fireEvent.keyDown(keyMarker, { key: ' ' })

    expect(handleMarkerSelect).toHaveBeenNthCalledWith(1, 'sidechain')
    expect(handleMarkerSelect).toHaveBeenNthCalledWith(2, 'key')
  })

  it('returns abbreviated summary actions for compact layouts', () => {
    expect(getJuceGridRoutingInspectorItems('sidechain', true)).toEqual([
      { id: 'input', label: 'In' },
      { id: 'key', label: 'Key' },
      { id: 'sidechain', label: 'SC' },
      { id: 'output', label: 'Out' },
    ])
  })

  it('lets the rendered svg scale across the full available card width', () => {
    render(
      <JuceGridRoutingVisualizer
        mode="parameter_morph"
        flows={[
          createFlow('a', { active: true }),
          createFlow('b', { active: false }),
        ]}
        activeFlowId="a"
        morphSourceId="a"
        morphTargetId="b"
      />,
    )

    const diagram = screen.getByRole('img', { name: 'Morph routing diagram' })
    expect(diagram.getAttribute('style') || '').not.toContain('max-width')
  })

  it('can hide the flow list while preserving the routing diagram', () => {
    render(
      <JuceGridRoutingVisualizer
        mode="series"
        flows={[
          createFlow('a', { active: true }),
          createFlow('b', { active: false }),
        ]}
        activeFlowId="a"
        showFlowList={false}
      />,
    )

    expect(screen.getByRole('img', { name: 'Series routing diagram' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Routing flows' })).toBeNull()
  })
})
