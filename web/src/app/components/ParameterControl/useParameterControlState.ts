import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ParameterCommitStrategy, ParameterDescriptor } from '../../data/parameterSchema'
import { dispatchCommit, dispatchLiveChange } from './dispatch'
import { formatEditableParameterValue, formatParameterValue } from './format'
import { snapValue } from './scale'

export interface UseParameterControlStateOptions {
  descriptor: ParameterDescriptor
  value: number
  commitStrategy?: ParameterCommitStrategy | 'legacy'
  valueFormatter?: (value: number) => string
  onLiveChange?: (value: number) => void
  onCommit?: (value: number) => void
}

export interface UseParameterControlStateResult {
  commitStrategy: ParameterCommitStrategy | 'legacy'
  descriptor: ParameterDescriptor
  editableValue: string
  formattedValue: string
  isInteracting: boolean
  liveValue: number
  commitValue: (nextValue: number) => number
  revertDraft: () => number
  setLiveValue: (nextValue: number) => number
}

export function useParameterControlState({
  descriptor,
  value,
  commitStrategy = descriptor.commitStrategy ?? 'pointer-up',
  valueFormatter,
  onLiveChange,
  onCommit,
}: UseParameterControlStateOptions): UseParameterControlStateResult {
  const normalizedValue = useMemo(() => snapValue(value, descriptor), [descriptor, value])
  const committedValueRef = useRef(normalizedValue)
  const liveValueRef = useRef(normalizedValue)
  const [liveValue, setLiveValueState] = useState(normalizedValue)
  const [isInteracting, setIsInteracting] = useState(false)

  useEffect(() => {
    if (!isInteracting) {
      committedValueRef.current = normalizedValue
      liveValueRef.current = normalizedValue
      setLiveValueState(normalizedValue)
    }
  }, [isInteracting, normalizedValue])

  const setLiveValue = useCallback((nextValue: number) => {
    const normalized = snapValue(nextValue, descriptor)
    const previousValue = liveValueRef.current
    liveValueRef.current = normalized
    setIsInteracting(true)
    setLiveValueState(normalized)
    dispatchLiveChange(normalized, previousValue, onLiveChange)
    return normalized
  }, [descriptor, onLiveChange])

  const commitValue = useCallback((nextValue: number) => {
    const normalized = snapValue(nextValue, descriptor)
    const previousCommitted = committedValueRef.current
    committedValueRef.current = normalized
    liveValueRef.current = normalized
    setLiveValueState(normalized)
    setIsInteracting(false)
    dispatchCommit(normalized, previousCommitted, onCommit)
    return normalized
  }, [descriptor, onCommit])

  const revertDraft = useCallback(() => {
    const reverted = committedValueRef.current
    liveValueRef.current = reverted
    setLiveValueState(reverted)
    setIsInteracting(false)
    return reverted
  }, [])

  return {
    commitStrategy,
    descriptor,
    editableValue: formatEditableParameterValue(liveValue, descriptor),
    formattedValue: valueFormatter ? valueFormatter(liveValue) : formatParameterValue(liveValue, descriptor),
    isInteracting,
    liveValue,
    commitValue,
    revertDraft,
    setLiveValue,
  }
}
