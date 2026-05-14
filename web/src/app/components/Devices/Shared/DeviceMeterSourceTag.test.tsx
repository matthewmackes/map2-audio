// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// DeviceMeterSourceTag RTL coverage. Locks the four-state Carbon Tag
// color/label policy in one place: any future tweak lands here and
// every device's Status surface picks it up automatically.

import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import { DeviceMeterSourceTag } from './DeviceMeterSourceTag'

describe('DeviceMeterSourceTag', () => {
  it('renders warm-gray "Awaiting engine wire-up" for placeholder', () => {
    render(<DeviceMeterSourceTag source="placeholder" isError={false} />)
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('Awaiting engine wire-up')
    expect(tag.classList.contains('cds--tag--warm-gray')).toBe(true)
  })

  it('renders green "Live" for engine source', () => {
    render(<DeviceMeterSourceTag source="engine" isError={false} />)
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('Live')
    expect(tag.classList.contains('cds--tag--green')).toBe(true)
  })

  it('renders red "Endpoint unavailable" when isError=true', () => {
    render(<DeviceMeterSourceTag source={undefined} isError={true} />)
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('Endpoint unavailable')
    expect(tag.classList.contains('cds--tag--red')).toBe(true)
  })

  it('renders red "Endpoint unavailable" even when source is defined but isError=true', () => {
    // Error wins over source — if the route errors the most recent
    // source value is stale and should not be trusted.
    render(<DeviceMeterSourceTag source="engine" isError={true} />)
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('Endpoint unavailable')
  })

  it('renders cool-gray "…" while source is undefined (no error)', () => {
    render(<DeviceMeterSourceTag source={undefined} isError={false} />)
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('…')
    expect(tag.classList.contains('cds--tag--cool-gray')).toBe(true)
  })

  it('honors a custom testId so panel-scoped assertions stay clear', () => {
    render(
      <DeviceMeterSourceTag
        source="placeholder"
        isError={false}
        testId="ua1000-meter-source"
      />,
    )
    expect(screen.getByTestId('ua1000-meter-source')).toBeInTheDocument()
  })

  it('renders warm-gray "Stale" with engine source when isStale=true', () => {
    render(
      <DeviceMeterSourceTag
        source="engine"
        isError={false}
        isStale={true}
        ageSeconds={30}
      />,
    )
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('Stale (30s)')
    expect(tag.classList.contains('cds--tag--warm-gray')).toBe(true)
  })

  it('formats stale age in minutes when over 60 seconds', () => {
    render(
      <DeviceMeterSourceTag
        source="engine"
        isError={false}
        isStale={true}
        ageSeconds={125}
      />,
    )
    expect(screen.getByTestId('device-meter-source-tag')).toHaveTextContent(
      'Stale (2m)',
    )
  })

  it('renders red "Engine unavailable" for engine_unavailable source', () => {
    render(
      <DeviceMeterSourceTag source="engine_unavailable" isError={false} />,
    )
    const tag = screen.getByTestId('device-meter-source-tag')
    expect(tag).toHaveTextContent('Engine unavailable')
    expect(tag.classList.contains('cds--tag--red')).toBe(true)
  })

  it('ignores isStale when source is not engine', () => {
    render(
      <DeviceMeterSourceTag
        source="placeholder"
        isError={false}
        isStale={true}
        ageSeconds={300}
      />,
    )
    // Placeholder copy wins — staleness only applies to engine source.
    expect(screen.getByTestId('device-meter-source-tag')).toHaveTextContent(
      'Awaiting engine wire-up',
    )
  })
})
