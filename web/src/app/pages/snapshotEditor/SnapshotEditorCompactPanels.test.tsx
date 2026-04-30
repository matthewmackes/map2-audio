/* SnapshotEditorCompactPanels unit tests (T2473 part 13). */

import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { SnapshotEditorCompactPanels } from './SnapshotEditorCompactPanels'
import type { RoutingConfig } from './snapshotEditorPageTypes'

const baseRouting: RoutingConfig = {
  mode: 'series',
  morphProgress: 0,
  blendPositions: {},
} as RoutingConfig

const baseProps = (
  overrides: Partial<React.ComponentProps<typeof SnapshotEditorCompactPanels>> = {},
) => ({
  visible: true,
  compactTab: 'grid' as const,
  snapshotEntryRequired: false,
  selectedPlugin: null,
  openSelectedBlockEditor: jest.fn(),
  openSnapshotProgressModal: jest.fn(),
  snapshotEditorMutationDisabled: false,
  activeRoutingMode: { label: 'Series' },
  activeFlowLabel: 'A',
  routing: baseRouting,
  ...overrides,
})

describe('SnapshotEditorCompactPanels', () => {
  it('returns null when not visible', () => {
    const { container } = render(
      <SnapshotEditorCompactPanels {...baseProps({ visible: false })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the grid tab body', () => {
    render(<SnapshotEditorCompactPanels {...baseProps({ compactTab: 'grid' })} />)
    expect(screen.getByText('Grid workspace')).toBeInTheDocument()
  })

  it('renders the editor tab placeholder describing the no-selection state', () => {
    render(<SnapshotEditorCompactPanels {...baseProps({ compactTab: 'editor' })} />)
    expect(screen.getByText('No block selected')).toBeInTheDocument()
  })

  it('shows the snapshot-required messaging in editor tab when entry required', () => {
    render(
      <SnapshotEditorCompactPanels
        {...baseProps({ compactTab: 'editor', snapshotEntryRequired: true })}
      />,
    )
    expect(screen.getByText('No snapshot loaded')).toBeInTheDocument()
  })

  it('renders routing tab with mode + flow tags and morph badge when active', () => {
    render(
      <SnapshotEditorCompactPanels
        {...baseProps({
          compactTab: 'routing',
          activeRoutingMode: { label: 'Parallel' },
          activeFlowLabel: 'B',
          routing: { ...baseRouting, mode: 'parameter_morph', morphProgress: 0.42 },
        })}
      />,
    )
    expect(screen.getByText('Parallel')).toBeInTheDocument()
    expect(screen.getByText('Focus B')).toBeInTheDocument()
    expect(screen.getByText('Morph 42%')).toBeInTheDocument()
  })

  it('renders presets tab heading', () => {
    render(<SnapshotEditorCompactPanels {...baseProps({ compactTab: 'presets' })} />)
    expect(screen.getByText('Presets')).toBeInTheDocument()
  })
})
