import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DeviceConfiguratorShell } from './DeviceConfiguratorShell'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
} from './types'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

function makeStatus(overrides: Partial<DeviceDetectionStatus> = {}): DeviceDetectionStatus {
  return {
    pack_id: 'acme',
    presence: 'present_stock',
    transport: 'usb-sysfs',
    serial: 'SN-001',
    raw: { vendor_id: '0x2EEE', product_id: '0x0301' },
    ...overrides,
  }
}

function makePack(
  overrides: Partial<ConfiguratorPackDescriptor> = {},
): ConfiguratorPackDescriptor {
  return {
    packId: 'acme',
    displayName: 'ACME Pad',
    vendorName: 'ACME Corp',
    summary: 'Provision an ACME Pad against this MAP2 install.',
    supportedPrimitives: ['detection', 'discovery', 'push'],
    fetchStatus: jest.fn(async () => makeStatus()),
    tabs: [],
    metadata: { vendor_url: 'https://example.com' },
    ...overrides,
  }
}

function renderShell(pack: ConfiguratorPackDescriptor) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <DeviceConfiguratorShell pack={pack} statusPollMs={false} />
    </QueryClientProvider>,
  )
}

describe('DeviceConfiguratorShell', () => {
  it('renders the title, summary, and vendor', async () => {
    renderShell(makePack())
    expect(await screen.findByText('ACME Pad')).toBeInTheDocument()
    expect(
      screen.getByText('Provision an ACME Pad against this MAP2 install.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/by ACME Corp/)).toBeInTheDocument()
  })

  it('renders the status card with presence + transport tags after fetch resolves', async () => {
    renderShell(makePack())
    expect(await screen.findByTestId('presence-tag')).toHaveTextContent('Stock')
    expect(screen.getByText('usb-sysfs')).toBeInTheDocument()
    expect(screen.getByText('SN-001')).toBeInTheDocument()
  })

  it('renders raw descriptor entries from status.raw', async () => {
    renderShell(
      makePack({
        fetchStatus: async () =>
          makeStatus({
            raw: {
              custom_field: 'hello',
              numeric: 42,
              flag: true,
              nothing: '',
            },
          }),
      }),
    )
    expect(await screen.findByText('custom_field')).toBeInTheDocument()
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByText('numeric')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('flag')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
  })

  it('renders the not-on-bus tag and copy when presence=not_present', async () => {
    renderShell(
      makePack({
        fetchStatus: async () => makeStatus({ presence: 'not_present', serial: null }),
      }),
    )
    expect(await screen.findByTestId('presence-tag')).toHaveTextContent('Not on bus')
    expect(
      screen.getByText(/No device matching this pack is on the bus/),
    ).toBeInTheDocument()
  })

  it('surfaces the backend error message when detection fails', async () => {
    renderShell(
      makePack({
        fetchStatus: async () => {
          throw new Error('detector blew up: dfu-util missing')
        },
      }),
    )
    expect(
      await screen.findByText('Could not detect device'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('detector blew up: dfu-util missing'),
    ).toBeInTheDocument()
  })

  it('renders tabs sorted by priority and respects visibleFor filtering', async () => {
    const renderA = jest.fn(() => <div data-testid="tab-a-body">A body</div>)
    const renderB = jest.fn(() => <div data-testid="tab-b-body">B body</div>)
    const renderHidden = jest.fn(() => <div>Should not appear</div>)
    renderShell(
      makePack({
        tabs: [
          { id: 'b', label: 'Tab B', priority: 200, render: renderB },
          { id: 'a', label: 'Tab A', priority: 100, render: renderA },
          {
            id: 'bootloader-only',
            label: 'Bootloader',
            visibleFor: ['present_bootloader'],
            render: renderHidden,
          },
        ],
      }),
    )
    // First visible tab body renders eagerly (others on click); confirm order via tab buttons
    const tabs = await screen.findAllByRole('tab')
    expect(tabs.map((el) => el.textContent)).toEqual(['Tab A', 'Tab B'])
    expect(renderHidden).not.toHaveBeenCalled()
  })

  it('shows the bootloader-only tab when presence=present_bootloader', async () => {
    renderShell(
      makePack({
        fetchStatus: async () => makeStatus({ presence: 'present_bootloader' }),
        tabs: [
          { id: 'a', label: 'Always', render: () => <div>always</div> },
          {
            id: 'boot',
            label: 'Bootloader',
            visibleFor: ['present_bootloader'],
            render: () => <div>boot body</div>,
          },
        ],
      }),
    )
    // Wait for the status fetch to resolve and the conditional tab to mount.
    await waitFor(() => {
      const tabs = screen.queryAllByRole('tab')
      expect(tabs.map((el) => el.textContent)).toEqual(['Always', 'Bootloader'])
    })
  })

  it('hides the tab list entirely when no tabs are visible', async () => {
    renderShell(
      makePack({
        tabs: [
          {
            id: 'only-when-bootloader',
            label: 'Bootloader',
            visibleFor: ['present_bootloader'],
            render: () => <div>boot body</div>,
          },
        ],
      }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('presence-tag')).toBeInTheDocument(),
    )
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('threads metadata + status into the tab render context', async () => {
    const renderA = jest.fn(() => <div data-testid="ctx-marker">ctx</div>)
    renderShell(
      makePack({
        tabs: [{ id: 'a', label: 'A', render: renderA }],
      }),
    )
    await screen.findByTestId('ctx-marker')
    // Wait for the post-status-resolution render to land in mock.calls.
    await waitFor(() => {
      const last = renderA.mock.calls.at(-1)?.[0] as
        | { status: DeviceDetectionStatus | null; metadata: Record<string, unknown> }
        | undefined
      expect(last?.status?.pack_id).toBe('acme')
    })
    const lastCall = renderA.mock.calls.at(-1)![0] as {
      status: DeviceDetectionStatus | null
      metadata: Record<string, unknown>
    }
    expect(lastCall.metadata).toEqual({ vendor_url: 'https://example.com' })
  })
})
