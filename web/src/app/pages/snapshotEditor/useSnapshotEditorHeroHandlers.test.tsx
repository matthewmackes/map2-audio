/**
 * T2473 cycle 33 — hero-card handlers parity test.
 *
 * Pins behavior of `handleHeroCopyMetadataValue` +
 * `handleHeroNavigateToPublishPage` against the original inline
 * monolith callbacks.
 */
import { renderHook, act } from '@testing-library/react'

import type { SnapshotDetail } from '../../../map2/types'
import { useSnapshotEditorHeroHandlers } from './useSnapshotEditorHeroHandlers'

function makeSnapshot(id: number): SnapshotDetail {
  // SnapshotDetail has a large surface; cast through unknown so the
  // test fixture stays focused on the two fields the hero handlers
  // actually read (`id` for the publish-page route).
  return {
    id,
    name: `snapshot-${id}`,
  } as unknown as SnapshotDetail
}

interface HarnessOptions {
  activeSnapshot?: SnapshotDetail | null
  clipboardAvailable?: boolean
  clipboardWriteShouldReject?: boolean
}

function setupHandlers(options: HarnessOptions = {}) {
  const pushToast = jest.fn()
  const navigate = jest.fn()

  const originalNavigator = globalThis.navigator
  const clipboardWriteText = options.clipboardAvailable === false
    ? undefined
    : jest.fn(async (_value: string) => {
        if (options.clipboardWriteShouldReject) {
          throw new Error('blocked')
        }
        return undefined
      })

  // Re-define navigator.clipboard for this test only. JSDOM doesn't
  // ship one by default.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      ...originalNavigator,
      clipboard: clipboardWriteText
        ? { writeText: clipboardWriteText }
        : undefined,
    },
  })

  const restoreNavigator = () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  }

  const { result } = renderHook(() =>
    useSnapshotEditorHeroHandlers({
      activeSnapshot: options.activeSnapshot ?? null,
      navigate,
      pushToast,
    }),
  )

  return { result, pushToast, navigate, clipboardWriteText, restoreNavigator }
}

afterEach(() => {
  jest.clearAllMocks()
})

describe('useSnapshotEditorHeroHandlers', () => {
  it('handleHeroCopyMetadataValue is a no-op for an empty value', () => {
    const { result, pushToast, clipboardWriteText, restoreNavigator } =
      setupHandlers({})
    try {
      act(() => {
        result.current.handleHeroCopyMetadataValue('')
      })
      expect(clipboardWriteText).not.toHaveBeenCalled()
      expect(pushToast).not.toHaveBeenCalled()
    } finally {
      restoreNavigator()
    }
  })

  it('writes to clipboard + emits success toast on resolve', async () => {
    const { result, pushToast, clipboardWriteText, restoreNavigator } =
      setupHandlers({})
    try {
      await act(async () => {
        result.current.handleHeroCopyMetadataValue('hello')
        // Flush the promise the handler kicked off.
        await Promise.resolve()
      })
      expect(clipboardWriteText).toHaveBeenCalledWith('hello')
      expect(pushToast).toHaveBeenCalledWith('Copied to clipboard', 'success')
    } finally {
      restoreNavigator()
    }
  })

  it('emits a "blocked" warn toast when clipboard.writeText rejects', async () => {
    const { result, pushToast, restoreNavigator } = setupHandlers({
      clipboardWriteShouldReject: true,
    })
    try {
      await act(async () => {
        result.current.handleHeroCopyMetadataValue('hello')
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(pushToast).toHaveBeenCalledWith(
        'Clipboard copy blocked by browser',
        'warn',
      )
    } finally {
      restoreNavigator()
    }
  })

  it('emits a "not available" warn toast when navigator.clipboard is missing', () => {
    const { result, pushToast, restoreNavigator } = setupHandlers({
      clipboardAvailable: false,
    })
    try {
      act(() => {
        result.current.handleHeroCopyMetadataValue('hello')
      })
      expect(pushToast).toHaveBeenCalledWith(
        'Clipboard not available',
        'warn',
      )
    } finally {
      restoreNavigator()
    }
  })

  it('handleHeroNavigateToPublishPage is a no-op when activeSnapshot is null', () => {
    const { result, navigate, restoreNavigator } = setupHandlers({
      activeSnapshot: null,
    })
    try {
      act(() => {
        result.current.handleHeroNavigateToPublishPage()
      })
      expect(navigate).not.toHaveBeenCalled()
    } finally {
      restoreNavigator()
    }
  })

  it('routes to /snapshots/<id>/publish for the active snapshot', () => {
    const snapshot = makeSnapshot(42)
    const { result, navigate, restoreNavigator } = setupHandlers({
      activeSnapshot: snapshot,
    })
    try {
      act(() => {
        result.current.handleHeroNavigateToPublishPage()
      })
      expect(navigate).toHaveBeenCalledWith('/snapshots/42/publish')
    } finally {
      restoreNavigator()
    }
  })
})
