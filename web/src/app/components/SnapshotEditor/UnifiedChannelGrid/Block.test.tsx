import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { Block } from './Block'
import { makeEmptySlot, type UnifiedSlot } from './gridConstants'

import * as slotStyleHook from '../../../hooks/useSnapshotSlotStyle'

function pluginSlot(overrides: Partial<UnifiedSlot> = {}): UnifiedSlot {
  return {
    ...makeEmptySlot(0),
    kind: 'plugin',
    uri: 'urn:plugin:reverb',
    label: 'Hall Reverb',
    category: 'Reverb',
    ...overrides,
  }
}

// Per-test override of the slot-style hook. By default (no override), the real
// hook runs and returns 'default' (jsdom localStorage starts empty), which
// matches the legacy expectations of the existing tests below.
function withSlotStyle(style: 'default' | 'v3-tinted' | 'v4-ring' | 'v6-led') {
  jest
    .spyOn(slotStyleHook, 'useSnapshotSlotStyle')
    .mockReturnValue([style, jest.fn()] as const)
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('Block', () => {
  it('renders a plugin block with label, category dataset, and fx icon', () => {
    render(<Block slot={pluginSlot({ cpuPercent: 3.4 })} />)

    const button = screen.getByRole('button', { name: 'Hall Reverb' })
    expect(button).toHaveAttribute('data-category', 'Reverb')
    expect(button).toHaveAttribute('data-kind', 'plugin')
    expect(button).toHaveAttribute('data-bypass', 'false')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('Hall Reverb')).toBeInTheDocument()
    expect(screen.getByText('3.4%')).toBeInTheDocument()
  })

  it('renders a bypassed dynamics block with SC tag when sidechain source is set', () => {
    render(
      <Block
        slot={pluginSlot({
          index: 2,
          label: 'Compressor',
          category: 'Dynamics',
          kind: 'dynamics',
          bypass: true,
          sidechainSourceLabel: 'Kick',
        })}
      />,
    )

    const button = screen.getByRole('button', { name: 'Compressor' })
    expect(button).toHaveAttribute('data-bypass', 'true')
    expect(button).toHaveAttribute('data-category', 'Dynamics')
    expect(screen.getByText('SC←Kick')).toBeInTheDocument()
  })

  it('fires onClick with slot index when clicked', () => {
    const onClick = jest.fn()
    render(<Block slot={pluginSlot({ index: 5 })} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(5)
  })

  it('renders the red X remove control without selecting the block', () => {
    const onClick = jest.fn()
    const onRemove = jest.fn()
    render(<Block slot={pluginSlot({ index: 3 })} onClick={onClick} onRemove={onRemove} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove block from slot 4' }))

    expect(onRemove).toHaveBeenCalledWith(3)
    expect(onClick).not.toHaveBeenCalled()
  })

  describe('slot-style variants', () => {
    it('reflects the active slot style via data-slot-style on the block element', () => {
      withSlotStyle('v3-tinted')
      render(<Block slot={pluginSlot({ cpuPercent: 30 })} />)

      const button = screen.getByRole('button', { name: 'Hall Reverb' })
      expect(button).toHaveAttribute('data-slot-style', 'v3-tinted')
    })

    it('renders the CPU ring SVG when slot style is v4-ring', () => {
      withSlotStyle('v4-ring')
      render(<Block slot={pluginSlot({ cpuPercent: 30 })} />)

      const button = screen.getByRole('button', { name: 'Hall Reverb' })
      const ring = button.querySelector('.ucg-block__cpu-ring')
      expect(ring).not.toBeNull()
      // Track + fill: two circles, one with the dasharray indicating progress.
      const circles = ring!.querySelectorAll('circle')
      expect(circles.length).toBe(2)
      const fill = button.querySelector('.ucg-block__cpu-ring-fill') as SVGCircleElement | null
      expect(fill).not.toBeNull()
      expect(fill!.getAttribute('stroke-dasharray')).toMatch(/^[0-9.]+ [0-9.]+$/)
    })

    it('floors the CPU ring fill at the visual minimum so idle slots read as alive', () => {
      withSlotStyle('v4-ring')
      const { container } = render(<Block slot={pluginSlot({ cpuPercent: 0 })} />)
      const fill = container.querySelector('.ucg-block__cpu-ring-fill') as SVGCircleElement | null
      expect(fill).not.toBeNull()
      const dasharray = fill!.getAttribute('stroke-dasharray')!
      const drawn = Number(dasharray.split(' ')[0])
      // Floor is 4% — circumference 2π·13 ≈ 81.68, so 4% ≈ 3.27. Anything > 0
      // satisfies "alive at idle"; assert the floor with a generous lower
      // bound so a future tweak from 4 → 3 doesn't churn this test.
      expect(drawn).toBeGreaterThan(2)
    })

    it('caps the CPU ring fill below a closed loop so heavy slots still show headroom', () => {
      withSlotStyle('v4-ring')
      const { container } = render(<Block slot={pluginSlot({ cpuPercent: 100 })} />)
      const fill = container.querySelector('.ucg-block__cpu-ring-fill') as SVGCircleElement | null
      expect(fill).not.toBeNull()
      const dasharray = fill!.getAttribute('stroke-dasharray')!
      const [drawn, total] = dasharray.split(' ').map(Number)
      // Ceiling is 95% — never a closed loop, always some unfilled track left.
      expect(drawn).toBeLessThan(total)
      expect(drawn / total).toBeLessThanOrEqual(0.96)
    })

    it('renders the LED bar when slot style is v6-led with width tracking CPU%', () => {
      withSlotStyle('v6-led')
      const { container } = render(<Block slot={pluginSlot({ cpuPercent: 30 })} />)

      const fill = container.querySelector('.ucg-block__led-bar-fill') as HTMLElement | null
      expect(fill).not.toBeNull()
      // Inline style width should reflect the clamped CPU% as a string ending
      // in '%'. At 30% the clamp is a no-op (within [4, 95]).
      expect(fill!.style.width).toBe('30%')
    })

    it('floors the LED bar at the visual minimum so a 0% slot still shows accent', () => {
      withSlotStyle('v6-led')
      const { container } = render(<Block slot={pluginSlot({ cpuPercent: 0 })} />)
      const fill = container.querySelector('.ucg-block__led-bar-fill') as HTMLElement | null
      expect(fill).not.toBeNull()
      // Width at idle should equal the floor, not 0%.
      expect(fill!.style.width).toBe('4%')
    })

    it('caps the LED bar below 100% so heavy slots show headroom', () => {
      withSlotStyle('v6-led')
      const { container } = render(<Block slot={pluginSlot({ cpuPercent: 100 })} />)
      const fill = container.querySelector('.ucg-block__led-bar-fill') as HTMLElement | null
      expect(fill).not.toBeNull()
      expect(fill!.style.width).toBe('95%')
    })

    it('does not render the CPU ring or LED bar in default mode', () => {
      withSlotStyle('default')
      const { container } = render(<Block slot={pluginSlot({ cpuPercent: 30 })} />)

      expect(container.querySelector('.ucg-block__cpu-ring')).toBeNull()
      expect(container.querySelector('.ucg-block__led-bar')).toBeNull()
    })
  })
})
