import type { ChangeEvent, ComponentProps } from 'react'
import { Button } from '@carbon/react'
import { Upload } from '@carbon/icons-react'
import './AssetUploadButton.css'

interface AssetUploadButtonProps {
  accept: string[]
  ariaLabel: string
  className?: string
  disabled?: boolean
  kind?: ComponentProps<typeof Button>['kind']
  label: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  size?: ComponentProps<typeof Button>['size']
}

export function AssetUploadButton({
  accept,
  ariaLabel,
  className = '',
  disabled = false,
  kind = 'secondary',
  label,
  onChange,
  size = 'sm',
}: AssetUploadButtonProps) {
  return (
    <div className={`map2-asset-upload-button ${className}`.trim()}>
      <input
        className="map2-asset-upload-button__input"
        type="file"
        accept={accept.join(',')}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={onChange}
      />
      <Button
        kind={kind}
        size={size}
        renderIcon={Upload}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        className="map2-asset-upload-button__button"
      >
        {label}
      </Button>
    </div>
  )
}

export default AssetUploadButton
