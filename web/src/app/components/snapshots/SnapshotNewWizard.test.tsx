import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGetDevices = jest.fn()
const mockListNodes = jest.fn()

jest.mock('../../../map2/api', () => ({
  pipewireApi: {
    getDevices: (...args: unknown[]) => mockGetDevices(...args),
  },
}))

jest.mock('../../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    listNodes: (...args: unknown[]) => mockListNodes(...args),
  },
}))

const { SnapshotNewWizard } = require('./SnapshotNewWizard') as typeof import('./SnapshotNewWizard')

function renderWizard(props: Partial<React.ComponentProps<typeof SnapshotNewWizard>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const onSubmit = jest.fn()
  const onCancel = jest.fn()

  render(
    <QueryClientProvider client={queryClient}>
      <SnapshotNewWizard
        existingSnapshotNames={['ExistingSnapshot']}
        initialName="Snapshot2"
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </QueryClientProvider>,
  )

  return { onSubmit, onCancel }
}

describe('SnapshotNewWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockListNodes.mockResolvedValue({
      nodes: [
        { id: 'node-a', status: 'online', hostname: 'rack-a' },
        { id: 'node-b', status: 'online', hostname: 'rack-b' },
      ],
      count: 2,
    })
    mockGetDevices.mockResolvedValue({
      devices: [
        { id: 1, name: 'Input Alpha', nick: 'Input Alpha', driver: '', bus: '', media_class: 'Audio/Device', is_default: true, properties: {} },
        { id: 2, name: 'Output Beta', nick: 'Output Beta', driver: '', bus: '', media_class: 'Audio/Device', is_default: false, properties: {} },
      ],
    })
  })

  it('renders step 1 first', async () => {
    renderWizard()

    expect(await screen.findByText('Create new snapshot')).toBeTruthy()
    expect(screen.getByLabelText('Snapshot name')).toBeTruthy()
    expect(screen.getByText('Step 1 of 4')).toBeTruthy()
  })

  it('validates empty, special-character, and duplicate names', async () => {
    renderWizard({ initialName: '' })

    expect((await screen.findByRole('button', { name: 'Next' })).hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'Bad!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Use letters and numbers only. Spaces and special characters are not allowed.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'ExistingSnapshot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('A snapshot with that name already exists.')).toBeTruthy()
  })

  it('supports back and next navigation across the four steps', async () => {
    renderWizard({ initialName: 'FreshSnapshot' })

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Choose a live host')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Pick an input device')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Choose a live host')).toBeTruthy()
  })

  it('lets device steps continue when no devices are available', async () => {
    mockGetDevices.mockResolvedValueOnce({ devices: [] })
    renderWizard({ initialName: 'FreshSnapshot' })

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('No PipeWire devices are available right now')).toBeTruthy()
    expect(screen.getByText('This step can be skipped.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Pick an output device')).toBeTruthy()
  })

  it('submits the selected values after the final step', async () => {
    const { onSubmit } = renderWizard({ initialName: 'FreshSnapshot' })

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('Live host'), { target: { value: 'node-b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const inputSelect = await screen.findByLabelText('Input device')
    fireEvent.change(inputSelect, { target: { value: 'Output Beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const outputSelect = await screen.findByLabelText('Output device')
    fireEvent.change(outputSelect, { target: { value: 'Input Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'FreshSnapshot',
        hostId: 'node-b',
        inputDevice: 'Output Beta',
        outputDevice: 'Input Alpha',
      })
    })
  })
})
