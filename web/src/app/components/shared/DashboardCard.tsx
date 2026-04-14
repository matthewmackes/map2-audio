import {
  ClickableTile,
  Tile,
  type ClickableTileProps,
  type TileProps,
} from '@carbon/react'
import type { ReactNode } from 'react'

import './DashboardCard.css'

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type BaseDashboardCardProps = {
  children: ReactNode
  className?: string
}

type StaticDashboardCardProps = BaseDashboardCardProps & TileProps & {
  interactive?: false
}

type InteractiveDashboardCardProps = BaseDashboardCardProps & ClickableTileProps & {
  interactive: true
}

export function DashboardCard(props: StaticDashboardCardProps | InteractiveDashboardCardProps) {
  if ('interactive' in props && props.interactive) {
    const { children, className, interactive: _interactive, ...rest } = props
    return (
      <ClickableTile
        {...rest}
        className={joinClasses('dashboard-card', 'dashboard-card--interactive', className)}
      >
        {children}
      </ClickableTile>
    )
  }

  const { children, className, interactive: _interactive, ...rest } = props
  return (
    <Tile
      {...rest}
      className={joinClasses('dashboard-card', className)}
    >
      {children}
    </Tile>
  )
}

export default DashboardCard
