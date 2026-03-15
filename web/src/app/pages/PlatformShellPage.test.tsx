import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformShellPage } from './PlatformShellPage'
import { PLATFORM_LAYER_META, makePlatformHealthRecord } from '../platform/model'
import { usePlatformStore } from '../stores/platformStore'

const mockUsePlatformShellData = jest.fn()

jest.mock('../hooks/usePlatformShellData', () => ({
  usePlatformShellData: () => mockUsePlatformShellData(),
}))

const mockData = {
  layers: PLATFORM_LAYER_META.map((layer, index) => ({
    ...layer,
    health: index === 0 ? 'warning' : 'healthy',
    activityLevel: 45 + index * 6,
    alertCount: index === 0 ? 1 : 0,
    isLoading: false,
    error: null,
    summaryMetrics: [
      {
        id: `${layer.id}-metric`,
        label: 'Metric',
        value: String(index + 1),
        helper: 'helper copy',
        tone: 'info',
      },
    ],
    gridItems: [
      {
        id: `${layer.id}-grid`,
        title: 'Grid item',
        eyebrow: 'Eyebrow',
        metric: `${index + 1}`,
        helper: 'Grid helper',
        status: index === 0 ? 'warning' : 'healthy',
      },
    ],
    tableColumns: [
      { key: 'name', header: 'Name' },
      { key: 'status', header: 'Status' },
    ],
    tableRows: [
      {
        id: `${layer.id}-row`,
        name: `${layer.label} row`,
        status: index === 0 ? 'warning' : 'healthy',
      },
    ],
    tableTitle: `${layer.label} table`,
    tableDescription: 'table description',
    notifications: index === 0 ? [{
      id: `${layer.id}-alert`,
      severity: 'warning',
      title: 'Overview degraded',
      subtitle: 'One layer needs attention.',
    }] : [],
  })),
  layerHealth: makePlatformHealthRecord((layerId) => (layerId === 'overview' ? 'warning' : 'healthy')),
  summaryMetrics: [
    { id: 'nodes', label: 'Nodes', value: '2/2', helper: 'Online', tone: 'healthy' },
    { id: 'alerts', label: 'Alerts', value: '1', helper: 'Current alerts', tone: 'warning' },
  ],
  alerts: [
    {
      id: 'overview-alert',
      layerId: 'overview',
      severity: 'warning',
      title: 'Overview degraded',
      subtitle: 'One layer needs attention.',
    },
  ],
}

function renderPage(initialEntries: string[] = ['/platform']) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <PlatformShellPage />
    </MemoryRouter>,
  )
}

describe('PlatformShellPage', () => {
  beforeEach(() => {
    mockUsePlatformShellData.mockReset()
    mockUsePlatformShellData.mockReturnValue(mockData)
    usePlatformStore.setState({
      currentView: 'stack',
      activeLayer: null,
      layerHealth: makePlatformHealthRecord(() => 'unknown'),
      alerts: [],
      summaryMetrics: [],
      animationState: {
        expandingLayer: null,
        collapsingLayer: null,
      },
    })
  })

  it('renders the stack view without crashing', async () => {
    renderPage()

    expect(screen.getByText('Unified Platform Stack')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Open Overview layer' })).toBeTruthy()
    expect(screen.getByText('Choose a layer to flatten the stack into a focused workspace.')).toBeTruthy()
  })

  it('changes active layer when a stack plane is clicked', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Open Overview layer' }))

    expect(await screen.findByRole('button', { name: /Back to Platform Stack/i })).toBeTruthy()
    expect(screen.getByText('Overview table')).toBeTruthy()
  })

  it('returns to stack view when the back button is pressed', async () => {
    renderPage(['/platform?layer=overview'])

    fireEvent.click(await screen.findByRole('button', { name: /Back to Platform Stack/i }))

    await waitFor(() => {
      expect(screen.getByText('Choose a layer to flatten the stack into a focused workspace.')).toBeTruthy()
    })
  })

  it('shows the notification strip for active layer alerts', async () => {
    renderPage(['/platform?layer=overview'])

    expect(await screen.findByText('Overview degraded')).toBeTruthy()
    expect(screen.getByText('One layer needs attention.')).toBeTruthy()
  })
})
