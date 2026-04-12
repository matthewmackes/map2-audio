import './LoadingState.css'
import { InlineLoading, Loading } from '@carbon/react'

type LoadingStateVariant = 'page' | 'section' | 'inline'

interface LoadingStateProps {
  description: string
  className?: string
  variant?: LoadingStateVariant
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function LoadingState({
  description,
  className,
  variant = 'section',
}: LoadingStateProps) {
  if (variant === 'inline') {
    return (
      <div className={joinClasses('app-loading-state', 'app-loading-state--inline', className)}>
        <InlineLoading description={description} status="active" />
      </div>
    )
  }

  return (
    <div className={joinClasses('app-loading-state', `app-loading-state--${variant}`, className)}>
      <Loading active small withOverlay={false} description={description} />
      <span className="app-loading-state__copy">{description}</span>
    </div>
  )
}
