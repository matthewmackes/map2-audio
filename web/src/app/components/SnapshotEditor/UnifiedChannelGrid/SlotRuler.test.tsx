import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { SlotRuler } from './SlotRuler'

describe('SlotRuler', () => {
  it('renders 8 column headers labeled Slot 01..08 by default', () => {
    render(<SlotRuler />)

    for (let i = 1; i <= 8; i += 1) {
      const label = `Slot ${String(i).padStart(2, '0')}`
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(screen.getByText('Channel')).toBeInTheDocument()
  })

  it('renders a custom slot count when provided', () => {
    const { container } = render(<SlotRuler slotCount={4} />)
    const slots = container.querySelectorAll('.ucg-slot-ruler__slot')
    expect(slots).toHaveLength(4)
  })
})
