interface SignalFlowVisualizationProps {
  namStatus?: 'active' | 'inactive'
  cabinetStatus?: 'active' | 'inactive'
  reverbStatus?: 'active' | 'inactive'
}

export function SignalFlowVisualization({
  namStatus = 'inactive',
  cabinetStatus = 'inactive',
  reverbStatus = 'inactive'
}: SignalFlowVisualizationProps) {
  const getColor = (status: 'active' | 'inactive') => {
    return status === 'active' ? 'rgba(55, 214, 201, 0.2)' : 'rgba(100, 100, 100, 0.2)'
  }

  const getBorder = (status: 'active' | 'inactive') => {
    return status === 'active' ? '#37d6c9' : '#666'
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 20,
      fontSize: 13,
      flexWrap: 'wrap'
    }}>
      <span>Input</span>
      <span style={{ color: '#666' }}>→</span>
      <div style={{
        padding: '8px 12px',
        background: getColor(namStatus),
        border: `1px solid ${getBorder(namStatus)}`,
        borderRadius: 6,
        fontWeight: 500
      }}>
        [NAM]
      </div>
      <span style={{ color: '#666' }}>→</span>
      <div style={{
        padding: '8px 12px',
        background: getColor(cabinetStatus),
        border: `1px solid ${getBorder(cabinetStatus)}`,
        borderRadius: 6,
        fontWeight: 500
      }}>
        [Cabinet]
      </div>
      <span style={{ color: '#666' }}>→</span>
      <div style={{
        padding: '8px 12px',
        background: getColor(reverbStatus),
        border: `1px solid ${getBorder(reverbStatus)}`,
        borderRadius: 6,
        fontWeight: 500
      }}>
        [Reverb]
      </div>
      <span style={{ color: '#666' }}>→</span>
      <span>Output</span>
    </div>
  )
}
