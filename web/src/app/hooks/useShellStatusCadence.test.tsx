import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { useShellStatusCadence } from './useShellStatusCadence'

function renderShellStatusCadence(pathname: string) {
  return renderHook(() => useShellStatusCadence(), {
    wrapper: ({ children }) => (
      <MemoryRouter
        initialEntries={[pathname]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        {children}
      </MemoryRouter>
    ),
  })
}

describe('useShellStatusCadence', () => {
  it('keeps the standard shell cadence on normal routes', () => {
    const { result } = renderShellStatusCadence('/')

    expect(result.current.pollMs).toBe(10_000)
    expect(result.current.staleMs).toBe(8_000)
  })

  it('slows shell status polling on heavy snapshot routes', () => {
    const { result } = renderShellStatusCadence('/snapshot-editor')

    expect(result.current.pollMs).toBe(30_000)
    expect(result.current.staleMs).toBe(28_000)
  })
})
