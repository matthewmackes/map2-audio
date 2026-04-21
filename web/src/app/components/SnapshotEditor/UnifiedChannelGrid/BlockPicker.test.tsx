import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { BlockPicker, type BlockPickerCatalogEntry } from './BlockPicker'

const CATALOG: BlockPickerCatalogEntry[] = [
  { uri: 'urn:plugin:reverb-hall', label: 'Hall Reverb', category: 'Reverb' },
  { uri: 'urn:plugin:reverb-plate', label: 'Plate Reverb', category: 'Reverb' },
  { uri: 'urn:plugin:comp', label: 'Compressor', category: 'Dynamics' },
  { uri: 'urn:plugin:eq', label: 'Parametric EQ', category: 'EQ' },
  { uri: 'urn:plugin:unknown', label: 'Utility Tool', category: null },
]

describe('BlockPicker', () => {
  it('renders all entries + category filters present in the catalog', () => {
    render(<BlockPicker catalog={CATALOG} />)

    expect(screen.getByText('Hall Reverb')).toBeInTheDocument()
    expect(screen.getByText('Plate Reverb')).toBeInTheDocument()
    expect(screen.getByText('Compressor')).toBeInTheDocument()
    expect(screen.getByText('Parametric EQ')).toBeInTheDocument()
    expect(screen.getByText('Utility Tool')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EQ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dynamics' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reverb' })).toBeInTheDocument()
  })

  it('filters entries by category when a filter tag is clicked', () => {
    render(<BlockPicker catalog={CATALOG} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reverb' }))

    expect(screen.getByText('Hall Reverb')).toBeInTheDocument()
    expect(screen.getByText('Plate Reverb')).toBeInTheDocument()
    expect(screen.queryByText('Compressor')).not.toBeInTheDocument()
    expect(screen.queryByText('Parametric EQ')).not.toBeInTheDocument()
    expect(screen.queryByText('Utility Tool')).not.toBeInTheDocument()
  })

  it('fires onPick with the chosen entry', () => {
    const onPick = jest.fn()
    render(<BlockPicker catalog={CATALOG} onPick={onPick} />)

    fireEvent.click(screen.getByRole('button', { name: 'Compressor' }))
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'urn:plugin:comp', label: 'Compressor' }),
    )
  })

  it('shows empty state when the active filter matches nothing', () => {
    render(<BlockPicker catalog={[{ uri: 'urn:x', label: 'X', category: 'EQ' }]} />)

    fireEvent.click(screen.getByRole('button', { name: 'EQ' }))
    expect(screen.getByText('X')).toBeInTheDocument()
  })
})
