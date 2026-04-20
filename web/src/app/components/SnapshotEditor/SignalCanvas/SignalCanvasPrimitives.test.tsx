import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { ChainTab } from './ChainTab'
import { Joiner } from './Joiner'
import { Meter } from './Meter'
import { SignalNode } from './Node'
import { SignalGrid } from './SignalGrid'
import { SignalCanvasIconSprite } from './icons'
import { Terminal } from './Terminal'

describe('SignalCanvas primitives', () => {
  it('renders chain tabs with active and mute state labels', () => {
    render(<ChainTab label="A" active muted />)

    expect(screen.getByLabelText('Chain A active muted')).toHaveClass('is-active', 'is-muted')
  })

  it('renders input and output terminals with LED affordances', () => {
    render(
      <>
        <SignalCanvasIconSprite />
        <Terminal role="input" active />
        <Terminal role="output" />
      </>,
    )

    expect(screen.getByLabelText('IN terminal')).toHaveClass('is-active')
    expect(screen.getByLabelText('OUT terminal')).toBeInTheDocument()
  })

  it('renders numbered split and merge joiners', () => {
    render(
      <>
        <Joiner kind="split" index={1} active />
        <Joiner kind="merge" index={2} />
      </>,
    )

    expect(screen.getByLabelText('Split 1')).toHaveClass('is-active')
    expect(screen.getByLabelText('Merge 2')).toHaveTextContent('2')
  })

  it('routes node select and bypass actions separately', () => {
    const handleSelect = jest.fn()
    const handleBypass = jest.fn()

    render(
      <>
        <SignalCanvasIconSprite />
        <SignalNode label="Drive" iconId="i-drive" selected bypassed cpuLoad={0.9} onSelect={handleSelect} onBypassToggle={handleBypass} />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Drive bypassed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enable Drive' }))

    expect(screen.getByRole('button', { name: 'Drive bypassed' })).toHaveClass('is-selected', 'is-bypassed', 'is-cpu-warn')
    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleBypass).toHaveBeenCalledTimes(1)
  })

  it('renders stale and clipped meter states with clear callback', () => {
    const handleClear = jest.fn()

    render(<Meter left={1.4} right={0.5} stale clipped onClearClip={handleClear} />)

    expect(screen.getByRole('button', { name: 'Meter clipped, click to clear' })).toHaveClass('is-stale', 'is-clipped')
    expect(screen.getByText('--.-')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Meter clipped, click to clear' }))

    expect(handleClear).toHaveBeenCalledTimes(1)
  })

  it('freezes grid dimensions through CSS variables', () => {
    render(
      <SignalGrid cols={13} rows={5} gridBackdrop={false}>
        <span>grid child</span>
      </SignalGrid>,
    )

    expect(screen.getByLabelText('13 by 5 signal grid')).toHaveAttribute('data-grid-backdrop', 'false')
    expect(screen.getByLabelText('13 by 5 signal grid')).toHaveStyle({
      '--snapshot-grid-cols': '13',
      '--snapshot-grid-rows': '5',
    })
  })
})
