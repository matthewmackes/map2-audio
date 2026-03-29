import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGetDevices = jest.fn()

jest.mock('../../../map2/api', () => ({
  pipewireApi: {
    getDevices: (...args: unknown[]) => mockGetDevices(...args),
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
        existingSnapshotNames={['Existing Snapshot']}
        initialName="Snapshot 2"
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

  it('validates empty, long, special-character, and duplicate names', async () => {
    renderWizard({ initialName: '' })

    expect((await screen.findByRole('button', { name: 'Next' })).hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: '123456789012345678901' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Name must be 20 characters or fewer.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'Bad!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Use letters, numbers, spaces, and hyphens only.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Snapshot name'), { target: { value: 'Existing Snapshot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('A snapshot with that name already exists.')).toBeTruthy()
  })

  it('supports back and next navigation across the four steps', async () => {
    renderWizard({ initialName: 'Fresh Snapshot' })

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Choose a routing mode')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Pick an input device')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Choose a routing mode')).toBeTruthy()
  })

  it('lets device steps continue when no devices are available', async () => {
    mockGetDevices.mockResolvedValueOnce({ devices: [] })
    renderWizard({ initialName: 'Fresh Snapshot' })

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('No PipeWire devices are available right now. This step can be skipped.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Pick an output device')).toBeTruthy()
  })

  it('submits the selected values after the final step', async () => {
    const { onSubmit } = renderWizard({ initialName: 'Fresh Snapshot' })

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByLabelText('Morph'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const inputSelect = await screen.findByLabelText('Input device')
    fireEvent.change(inputSelect, { target: { value: 'Output Beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const outputSelect = await screen.findByLabelText('Output device')
    fireEvent.change(outputSelect, { target: { value: 'Input Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Fresh Snapshot',
        routingMode: 'morph',
        inputDevice: 'Output Beta',
        outputDevice: 'Input Alpha',
      })
    })
  })
})
