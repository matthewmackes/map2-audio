import { useState } from 'react'
import { UploadSimple } from '@phosphor-icons/react'
import { UnifiedUploadDialog, type AssetType } from './UnifiedUploadDialog'

interface Props {
  className?: string
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  defaultAssetType?: AssetType
  onUploadComplete?: () => void
  label?: string
}

export function UploadButton({
  className = '',
  variant = 'primary',
  size = 'md',
  defaultAssetType,
  onUploadComplete,
  label = 'Upload',
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''

  return (
    <>
      <button
        className={`btn btn-${variant} ${sizeClass} ${className}`}
        onClick={() => setDialogOpen(true)}
      >
        <UploadSimple size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} weight="duotone" />
        {label}
      </button>

      <UnifiedUploadDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultAssetType={defaultAssetType}
        onUploadComplete={(count) => {
          if (count > 0) {
            onUploadComplete?.()
          }
        }}
      />
    </>
  )
}
