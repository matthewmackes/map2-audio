import '@testing-library/jest-dom'
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MaschineOnboardingWizard } from './MaschineOnboardingWizard'
import type {
  OnboardingState,
  OnboardingStatus,
} from '../../../map2/clients/maschineOnboarding'

type OnboardingApi = typeof import('../../../map2/clients/maschineOnboarding').maschineOnboardingApi

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

function statusFor(state: OnboardingState, serial: string | null = 'MK1X'): OnboardingStatus {
  return {
    status: 'ok',
    state,
    usb_serial: serial,
    phase_index: 0,
    phase_order: ['tour', 'pad_sensitivity', 'pressure_curves', 'lcd_calibration', 'profile_selection', 'ready'],
    is_ready: state === 'ready',
    history: [],
  }
}

/** Stateful fake API that advances through the orchestrator phases. */
function makeFakeApi(initial: OnboardingState = 'idle') {
  let state: OnboardingState = initial
  const set = (s: OnboardingState) => {
    state = s
    return statusFor(state)
  }
  const api: OnboardingApi = {
    status: jest.fn(async () => statusFor(state)),
    calibration: jest.fn(async () => ({ status: 'ok', calibration: null })),
    connect: jest.fn(async () => set('tour')),
    tourComplete: jest.fn(async () => set('pad_sensitivity')),
    skip: jest.fn(async () => set('ready')),
    completePhase: jest.fn(async (phase) => {
      const next: Record<string, OnboardingState> = {
        pad_sensitivity: 'pressure_curves',
        pressure_curves: 'lcd_calibration',
        lcd_calibration: 'profile_selection',
        profile_selection: 'ready',
      }
      return set(next[phase])
    }),
    reset: jest.fn(async () => set('idle')),
    profileCatalog: jest.fn(async () => ({
      status: 'ok',
      profiles: [
        { id: 'T1', name: 'CTRL', source: 'json' as const },
        { id: 'T9', name: 'EFFECT CHAIN EDITOR', source: 'code' as const },
      ],
    })),
  }
  return api
}

function renderWizard(api: ReturnType<typeof makeFakeApi>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MaschineOnboardingWizard api={api} />
    </QueryClientProvider>,
  )
}

describe('MaschineOnboardingWizard', () => {
  it('renders the connect step when idle', async () => {
    renderWizard(makeFakeApi('idle'))
    expect(await screen.findByText('Calibrate Maschine MK1')).toBeInTheDocument()
    expect(screen.getByLabelText('USB serial')).toBeInTheDocument()
    expect(screen.getByText('Begin onboarding')).toBeInTheDocument()
  })

  it('connects a unit and enters the tour step', async () => {
    const api = makeFakeApi('idle')
    renderWizard(api)
    fireEvent.change(await screen.findByLabelText('USB serial'), {
      target: { value: 'MK1X' },
    })
    fireEvent.click(screen.getByText('Begin onboarding'))
    await waitFor(() => expect(api.connect).toHaveBeenCalledWith('MK1X'))
    expect(await screen.findByText('Tour complete — continue')).toBeInTheDocument()
  })

  it('walks through every phase to ready', async () => {
    const api = makeFakeApi('tour')
    renderWizard(api)

    fireEvent.click(await screen.findByText('Tour complete — continue'))
    await waitFor(() => expect(api.tourComplete).toHaveBeenCalled())

    fireEvent.click(await screen.findByText('Accept defaults — continue'))
    await waitFor(() =>
      expect(api.completePhase).toHaveBeenCalledWith('pad_sensitivity', expect.anything()),
    )

    fireEvent.click(await screen.findByText('Accept defaults — continue'))
    await waitFor(() =>
      expect(api.completePhase).toHaveBeenCalledWith('pressure_curves', expect.anything()),
    )

    fireEvent.click(await screen.findByText('Accept defaults — continue'))
    await waitFor(() =>
      expect(api.completePhase).toHaveBeenCalledWith('lcd_calibration', expect.anything()),
    )

    // profile step: pick T9 then finish
    expect(await screen.findByText('Finish onboarding')).toBeInTheDocument()
  })

  it('skips onboarding from the tour and lands ready', async () => {
    const api = makeFakeApi('tour')
    renderWizard(api)
    fireEvent.click(await screen.findByText('Skip — use defaults'))
    await waitFor(() => expect(api.skip).toHaveBeenCalled())
    expect(await screen.findByText('Onboarding complete')).toBeInTheDocument()
  })

  it('shows the completion state and offers to onboard another unit', async () => {
    const api = makeFakeApi('ready')
    renderWizard(api)
    expect(await screen.findByText('Onboarding complete')).toBeInTheDocument()
    expect(screen.getByText('Onboard another unit')).toBeInTheDocument()
  })
})
