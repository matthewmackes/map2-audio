export function dispatchLiveChange(
  nextValue: number,
  previousValue: number,
  onLiveChange?: (value: number) => void,
): number {
  if (onLiveChange && Math.abs(nextValue - previousValue) > 1e-9) {
    onLiveChange(nextValue)
  }
  return nextValue
}

export function dispatchCommit(
  nextValue: number,
  previousValue: number,
  onCommit?: (value: number) => void,
): number {
  if (onCommit && Math.abs(nextValue - previousValue) > 1e-9) {
    onCommit(nextValue)
  }
  return nextValue
}
