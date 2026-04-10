import { useState } from 'react'
import { Upload } from '@carbon/icons-react'
import { LegacyButton } from '../shared/LegacyButton'
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

  return (
    <>
      <LegacyButton
        className={className}
        variant={variant}
        size={size}
        renderIcon={Upload}
        iconDescription={label}
        onClick={() => setDialogOpen(true)}
      >
        {label}
      </LegacyButton>

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
