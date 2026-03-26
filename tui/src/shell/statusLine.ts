function truncateLabel(value: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return ''
  }
  if (value.length <= maxWidth) {
    return value
  }
  if (maxWidth === 1) {
    return '…'
  }
  return `${value.slice(0, maxWidth - 1)}…`
}

export function formatStatusLine(left: string, right: string, columns: number): string {
  const safeColumns = Math.max(columns, 20)
  const fittedRight = truncateLabel(right, Math.max(1, safeColumns - 1))
  const maxLeftWidth = Math.max(1, safeColumns - fittedRight.length - 1)
  const fittedLeft = truncateLabel(left, maxLeftWidth)
  const gapWidth = Math.max(safeColumns - fittedLeft.length - fittedRight.length, 1)
  return `${fittedLeft}${' '.repeat(gapWidth)}${fittedRight}`
}
