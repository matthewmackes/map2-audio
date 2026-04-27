import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  pinDeviceProfile: jest.fn(),
  unpinDeviceProfile: jest.fn(),
}))

jest.mock('../Toasts', () => ({
  __esModule: true,
  useToasts: () => ({ pushToast: jest.fn(() => 'tid'), dismissToast: jest.fn() }),
  useNotifications: () => ({ pushNotification: jest.fn(() => 'nid'), dismissNotification: jest.fn() }),
}))

import { CatalogueSection } from './CatalogueSection'
import type { DeviceCardRow } from './DeviceCard'

function row(over: Partial<DeviceCardRow>): DeviceCardRow {
  return {
    profileKey: 'edirol-ua/ua-1000.audio',
    packId: 'edirol-ua', model: 'ua-1000', kind: 'audio',
    vendor: 'EDIROL / Roland', source: 'shipped',
    isConnected: false, isPinned: false, lastSeenAt: null,
    ...over,
  }
}

function buildRows(): DeviceCardRow[] {
  const native: DeviceCardRow[] = [
    row({ profileKey: 'edirol-ua/ua-1000.audio', packId: 'edirol-ua', model: 'ua-1000' }),
    row({ profileKey: 'edirol-ua/ua-25.audio', packId: 'edirol-ua', model: 'ua-25' }),
    row({ profileKey: 'hotone/jogg.audio', packId: 'hotone', model: 'jogg', vendor: 'Hotone' }),
  ]
  // 15 imported rows so the importedTailCap=12 default leaves 3 in the tail.
  const imported: DeviceCardRow[] = Array.from({ length: 15 }, (_, i) =>
    row({
      profileKey: `_mixx-imports/imp-${i}.midi`,
      packId: '_mixx-imports', model: `imp-${i}`, kind: 'midi',
      vendor: 'Mixxx', source: 'imported',
    }),
  )
  return [...native, ...imported]
}

function renderSection(rows: DeviceCardRow[]) {
  return render(
    <MemoryRouter>
      <CatalogueSection rows={rows} />
    </MemoryRouter>,
  )
}

test('CatalogueSection: hero counts reflect the row mix', () => {
  renderSection(buildRows())
  expect(screen.getByText('18 total')).toBeInTheDocument()
  expect(screen.getByText('3 shipped')).toBeInTheDocument()
  expect(screen.getByText('15 imported')).toBeInTheDocument()
})

test('CatalogueSection: search filters by model name', () => {
  renderSection(buildRows())
  const search = screen.getByPlaceholderText(/Search model/) as HTMLInputElement
  fireEvent.change(search, { target: { value: 'ua-1000' } })
  // Only the shipped UA-1000 native row should remain in the featured grid.
  expect(document.querySelectorAll('[data-testid="catalogue-featured"] .device-card').length).toBe(1)
})

test('CatalogueSection: imported tail caps at 12 by default', () => {
  renderSection(buildRows())
  const importedCards = document.querySelectorAll('[data-testid="catalogue-imported"] .device-card')
  expect(importedCards.length).toBe(12)
  // "Show all" button mentions the remaining 3.
  expect(screen.getByText(/Show all imported mappings \(3 more\)/)).toBeInTheDocument()
})

test('CatalogueSection: clicking Show all reveals every imported row', () => {
  renderSection(buildRows())
  fireEvent.click(screen.getByText(/Show all imported mappings/))
  const importedCards = document.querySelectorAll('[data-testid="catalogue-imported"] .device-card')
  expect(importedCards.length).toBe(15)
})

test('CatalogueSection: Q4 unknown-device empty state on no-results', () => {
  renderSection(buildRows())
  const search = screen.getByPlaceholderText(/Search model/) as HTMLInputElement
  fireEvent.change(search, { target: { value: 'nothing-matches-this' } })
  expect(screen.getByText('No device matches these filters')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open Learn Wizard' })).toBeInTheDocument()
})
