interface ButtonGroupProps {
  label?: string
  children: React.ReactNode
}

export function ButtonGroup({ label, children }: ButtonGroupProps) {
  return (
    <div className="grid-toolbar-button-group">
      {label && <div className="grid-toolbar-button-group-label">{label}</div>}
      <div className="grid-toolbar-button-group-content">{children}</div>
    </div>
  )
}
