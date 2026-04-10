import { ClickableTile, Tile, type ClickableTileProps, type TileProps } from '@carbon/react'
import type { CSSProperties, ReactNode } from 'react'

interface BaseProps {
  className?: string
  children?: ReactNode
  style?: CSSProperties
}

interface StaticTileProps extends BaseProps {
  clickable?: false
}

interface InteractiveTileProps extends BaseProps {
  clickable: true
  href?: ClickableTileProps['href']
  onClick?: ClickableTileProps['onClick']
}

type LegacyTileProps = StaticTileProps | InteractiveTileProps

export function LegacyTile(props: LegacyTileProps) {
  if (props.clickable) {
    const { clickable: _clickable, children, ...rest } = props
    return <ClickableTile {...rest}>{children}</ClickableTile>
  }

  const { clickable: _clickable, children, ...rest } = props
  return <Tile {...(rest as TileProps)}>{children}</Tile>
}

export default LegacyTile
