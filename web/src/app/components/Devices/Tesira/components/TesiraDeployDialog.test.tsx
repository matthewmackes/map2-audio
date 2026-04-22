import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraDeployDialog } from './TesiraDeployDialog'

const mockGetLayoutManualPackageDownloadUrl = jest.fn()

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraLayouts: () => ({
    data: {
      layouts: [
        {
          layout_id: 'ballroom-main',
          version: '1.2.3',
          name: 'Ballroom Main',
        },
      ],
    },
    isLoading: false,
  }),
}))

jest.mock('../../../../../map2/api', () => ({
  tesiraApi: {
    getLayoutManualPackageDownloadUrl: (...args: unknown[]) => mockGetLayoutManualPackageDownloadUrl(...args),
  },
}))

describe('TesiraDeployDialog', () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  beforeEach(() => {
    mockGetLayoutManualPackageDownloadUrl.mockReset()
    mockGetLayoutManualPackageDownloadUrl.mockReturnValue('/api/tesira/layouts/ballroom-main/manual-package?version=1.2.3&device_id=tesira-1')
  })

  it('reveals package contents and download link after a layout is selected', () => {
    render(<TesiraDeployDialog deviceId="tesira-1" open onClose={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Layout package'), {
      target: { value: 'ballroom-main@1.2.3' },
    })

    expect(screen.getByText('ballroom-main_1.2.3.tmf')).toBeTruthy()
    expect(screen.getByText('README_UPLOAD_TO_SAGEVUE.md')).toBeTruthy()
    expect(mockGetLayoutManualPackageDownloadUrl).toHaveBeenCalledWith('ballroom-main', '1.2.3', 'tesira-1')

    const downloadLink = screen.getByText('Download Manual Package').closest('a')
    expect(downloadLink?.getAttribute('href')).toBe(
      '/api/tesira/layouts/ballroom-main/manual-package?version=1.2.3&device_id=tesira-1',
    )
  })
})
