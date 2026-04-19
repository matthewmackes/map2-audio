import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ToastProvider } from './Toasts'
import { PlatformEventProvider } from './PlatformEventProvider'
import { PLATFORM_EVENT_STORE_TEST_ONLY, usePlatformEventStore } from '../stores/platformEventStore'
import type { PlatformEventTransport } from '../services/platformEventTransport'

jest.mock('./Toasts', () => {
  const original = jest.requireActual('./Toasts')
  return {
    ...original,
    useNotifications: () => ({
      notifications: [],
      pushNotification: jest.fn(),
      dismissNotification: jest.fn(),
      clearNotifications: jest.fn(),
    }),
  }
})

function resetStore() {
  usePlatformEventStore.setState({
    ...usePlatformEventStore.getState(),
    ...PLATFORM_EVENT_STORE_TEST_ONLY.INITIAL_PLATFORM_EVENT_STATE,
  })
}

function renderProvider(transport: PlatformEventTransport, duplicate = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ToastProvider>
          <PlatformEventProvider transport={transport}>
            {duplicate ? (
              <PlatformEventProvider transport={transport}>
                <div>child</div>
              </PlatformEventProvider>
            ) : (
              <div>child</div>
            )}
          </PlatformEventProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PlatformEventProvider', () => {
  beforeEach(() => {
    resetStore()
  })

  afterAll(() => {
    resetStore()
  })

  it('mounts the transport once and hydrates the session id', () => {
    const subscribe = jest.fn(() => () => {})
    const start = jest.fn(() => () => {})
    const transport: PlatformEventTransport = {
      subscribe,
      start,
      ack: jest.fn(),
      getSessionId: () => 'session-test',
    }

    renderProvider(transport, true)

    expect(screen.getByText('child')).toBeInTheDocument()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(1)
  })
})
