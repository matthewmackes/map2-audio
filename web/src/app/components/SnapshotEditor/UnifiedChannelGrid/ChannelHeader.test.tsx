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
  it('renders name, IO label, and one VU bar for mono', () => {
    const { container } = render(<ChannelHeader row={row()} />)

    expect(screen.getByText('Guitar A')).toBeInTheDocument()
    expect(screen.getByText('1/2 → Main')).toBeInTheDocument()

    const bars = container.querySelectorAll('.ucg-channel-header__vu-bar')
    expect(bars).toHaveLength(1)
  })

  it('renders two VU bars when stereo is true', () => {
    const { container } = render(<ChannelHeader row={row({ stereo: true })} />)
    const bars = container.querySelectorAll('.ucg-channel-header__vu-bar')
    expect(bars).toHaveLength(2)

    const header = container.querySelector('.ucg-channel-header')
    expect(header).toHaveAttribute('data-stereo', 'true')
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
