interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'error' | 'processing'
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
}

export function StatusBadge({
  status,
  onClick,
  size = 'md'
}: StatusBadgeProps) {
  const symbols = {
    active: '●',
    inactive: '○',
    error: '⚠',
    processing: '◆'
  }

  const sizeMap = {
    sm: 16,
    md: 24,
    lg: 32
  }

  return (
    <button
      onClick={onClick}
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
        fontSize: sizeMap[size] * 0.6,
        fontWeight: 'bold',
        transition: 'all var(--map2-dur-slow, 380ms) var(--map2-ease-in-out-rack, ease)',
        background:
          status === 'active' ? '#10b981' :
          status === 'inactive' ? '#6b7280' :
          status === 'error' ? '#ef4444' :
          '#f59e0b',
        color: 'white',
        boxShadow: status === 'active' ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none',
        animation: status === 'active' ? 'pulse 2s infinite' : 'none'
      }}
      title={`Status: ${status}`}
    >
      {symbols[status]}
    </button>
  )
}
