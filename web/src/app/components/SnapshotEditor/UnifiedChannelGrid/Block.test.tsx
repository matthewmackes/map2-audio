import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { Block } from './Block'
import { makeEmptySlot, type UnifiedSlot } from './gridConstants'

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

describe('Block', () => {
  it('renders a plugin block with label, category dataset, and fx icon', () => {
    render(<Block slot={pluginSlot()} />)

    const button = screen.getByRole('button', { name: 'Hall Reverb' })
    expect(button).toHaveAttribute('data-category', 'Reverb')
    expect(button).toHaveAttribute('data-kind', 'plugin')
    expect(button).toHaveAttribute('data-bypass', 'false')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('Hall Reverb')).toBeInTheDocument()
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
})
