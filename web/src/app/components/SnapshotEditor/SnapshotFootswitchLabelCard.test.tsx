import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotFootswitchLabelCard } from './SnapshotFootswitchLabelCard'
import { createEmptyFootswitchLabelDrafts } from '../../utils/snapshotFootswitchLabels'

describe('SnapshotFootswitchLabelCard', () => {
  it('renders eight switch inputs, previews configured labels, and forwards edits', () => {
    const onChange = jest.fn()
    const onSave = jest.fn()
    const onClear = jest.fn()
    const labelMap = {
      ...createEmptyFootswitchLabelDrafts(),
      '1': 'Clean',
      '2': 'Lead',
    }

    render(
      <SnapshotFootswitchLabelCard
        hasActiveSnapshot
        disabled={false}
        isPending={false}
        labelMap={labelMap}
        onChange={onChange}
        onSave={onSave}
        onClear={onClear}
        saveDisabled={false}
      />,
    )

    expect(screen.getByLabelText('Switch 8')).not.toBeNull()
    expect(screen.getByText('S1 Clean')).not.toBeNull()
    expect(screen.getByText('S2 Lead')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('Switch 3'), { target: { value: 'Solo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledWith(3, 'Solo')
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('shows the empty-state copy when no snapshot is active', () => {
    render(
      <SnapshotFootswitchLabelCard
        hasActiveSnapshot={false}
        disabled
        isPending={false}
        labelMap={createEmptyFootswitchLabelDrafts()}
        onChange={jest.fn()}
        onSave={jest.fn()}
        onClear={jest.fn()}
        saveDisabled
      />,
    )

    expect(screen.getByText('Load a snapshot to configure footswitch labels.')).not.toBeNull()
  })
})
