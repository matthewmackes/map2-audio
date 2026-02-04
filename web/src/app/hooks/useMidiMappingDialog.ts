/**
 * useMidiMappingDialog Hook
 *
 * Manages the state for the MIDI CC Mapping Dialog.
 * Provides open/close controls and tracks the current plugin context.
 */

import { useState, useCallback } from 'react'

interface MidiMappingDialogState {
  isOpen: boolean
  pluginUri: string | null
  chainId: number | null
}

export function useMidiMappingDialog() {
  const [state, setState] = useState<MidiMappingDialogState>({
    isOpen: false,
    pluginUri: null,
    chainId: null,
  })

  const openDialog = useCallback((pluginUri: string, chainId?: number) => {
    setState({
      isOpen: true,
      pluginUri,
      chainId: chainId ?? null,
    })
  }, [])

  const closeDialog = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }))
  }, [])

  return {
    isOpen: state.isOpen,
    pluginUri: state.pluginUri,
    chainId: state.chainId,
    openDialog,
    closeDialog,
  }
}

export default useMidiMappingDialog
