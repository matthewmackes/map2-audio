import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { ChannelHeader } from './ChannelHeader'
import { makeEmptyRow, type UnifiedChannelRow } from './gridConstants'

function row(overrides: Partial<UnifiedChannelRow> = {}): UnifiedChannelRow {
  return {
    ...makeEmptyRow('row-1', 'Guitar A'),
    ioLabel: '1/2 → Main',
    stereo: false,
    ...overrides,
  }
}

describe('ChannelHeader', () => {
  it('renders name, IO label, and one VU track for mono', () => {
    const { container } = render(<ChannelHeader row={row()} />)

    expect(screen.getByText('Guitar A')).toBeInTheDocument()
    expect(screen.getByText('1/2 → Main')).toBeInTheDocument()

    const tracks = container.querySelectorAll('.ucg-channel-header__vu-track')
    expect(tracks).toHaveLength(1)
  })

  it('renders two VU tracks when stereo is true', () => {
    const { container } = render(<ChannelHeader row={row({ stereo: true })} />)
    const tracks = container.querySelectorAll('.ucg-channel-header__vu-track')
    expect(tracks).toHaveLength(2)

    const header = container.querySelector('.ucg-channel-header')
    expect(header).toHaveAttribute('data-stereo', 'true')
  })

  it('renders live bar fill from meter.left/right', () => {
    const { container } = render(
      <ChannelHeader
        row={row({ stereo: true })}
        meter={{ left: 0.5, right: 0.25, isLive: true, clipped: false }}
      />,
    )
    const fills = container.querySelectorAll<HTMLElement>('.ucg-channel-header__vu-fill')
    expect(fills).toHaveLength(2)
    expect(fills[0].style.inlineSize).toBe('50%')
    expect(fills[1].style.inlineSize).toBe('25%')

    const vu = container.querySelector('.ucg-channel-header__vu')
    expect(vu).toHaveAttribute('data-live', 'true')
    expect(vu).toHaveAttribute('data-clipped', 'false')
    expect(container.querySelector('.ucg-channel-header__live-dot')).not.toBeNull()
  })

  it('renders CLIP tag + clipped state when meter.clipped is true', () => {
    const { container } = render(
      <ChannelHeader
        row={row()}
        meter={{ left: 1, right: 1, isLive: true, clipped: true }}
      />,
    )
    expect(screen.getByText('CLIP')).toBeInTheDocument()
    expect(container.querySelector('.ucg-channel-header__vu')).toHaveAttribute(
      'data-clipped',
      'true',
    )
  })

  it('treats missing meter as offline placeholder (no live dot, 0% fill)', () => {
    const { container } = render(<ChannelHeader row={row()} />)
    expect(container.querySelector('.ucg-channel-header__live-dot')).toBeNull()
    const fill = container.querySelector<HTMLElement>('.ucg-channel-header__vu-fill')
    expect(fill?.style.inlineSize).toBe('0%')
  })

  it('fires onToggleMute and onToggleSolo with row id', () => {
    const onToggleMute = jest.fn()
    const onToggleSolo = jest.fn()

    render(
      <ChannelHeader
        row={row()}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(onToggleMute).toHaveBeenCalledWith('row-1')

    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    expect(onToggleSolo).toHaveBeenCalledWith('row-1')
  })

  it('reflects muted + solo state in ARIA + dataset', () => {
    const { container } = render(
      <ChannelHeader row={row({ muted: true, solo: true })} />,
    )

    const header = container.querySelector('.ucg-channel-header')
    expect(header).toHaveAttribute('data-muted', 'true')
    expect(header).toHaveAttribute('data-solo', 'true')

    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'S' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
