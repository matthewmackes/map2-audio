import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { ChainHead } from './ChainHead'
import { ChainSide } from './ChainSide'
import { SignalCanvasIconSprite } from './icons'

describe('SignalCanvas chain head and side primitives', () => {
  it('renders inline chain management actions and routes callbacks', () => {
    const callbacks = {
      onRename: jest.fn(),
      onDuplicate: jest.fn(),
      onActivate: jest.fn(),
      onDelete: jest.fn(),
      onAssign: jest.fn(),
      onRoutingTagClick: jest.fn(),
      onSendTagClick: jest.fn(),
    }

    render(
      <>
        <SignalCanvasIconSprite />
        <ChainHead chainLabel="A" chainName="Lead" active={false} assigned={false} {...callbacks} />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'SERIES' }))
    fireEvent.click(screen.getByRole('button', { name: 'NO SEND' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign Lead' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename Lead' }))
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Lead' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activate Lead' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Lead' }))

    expect(callbacks.onRoutingTagClick).toHaveBeenCalledTimes(1)
    expect(callbacks.onSendTagClick).toHaveBeenCalledTimes(1)
    expect(callbacks.onAssign).toHaveBeenCalledTimes(1)
    expect(callbacks.onRename).toHaveBeenCalledTimes(1)
    expect(callbacks.onDuplicate).toHaveBeenCalledTimes(1)
    expect(callbacks.onActivate).toHaveBeenCalledTimes(1)
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1)
  })

  it('renders the inline undo contract for delete recovery', () => {
    const handleUndo = jest.fn()

    render(
      <ChainHead
        chainLabel="B"
        chainName="Texture"
        deleteUndo={{ label: 'Texture deleted', actionLabel: 'Restore' }}
        onUndoDelete={handleUndo}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Texture deleted')
    fireEvent.click(screen.getByRole('button', { name: /restore/i }))

    expect(handleUndo).toHaveBeenCalledTimes(1)
  })

  it('disables chain mutations in readonly mode while keeping routing tags visible', () => {
    render(<ChainHead chainLabel="C" chainName="Readonly" readOnly onRename={jest.fn()} onDelete={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'Rename Readonly' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Readonly' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'SERIES' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'NO SEND' })).toBeInTheDocument()
  })

  it('renders the responsive side panel stats, pedals, and inspector actions', () => {
    const handleMute = jest.fn()
    const handleSolo = jest.fn()
    const handleDelete = jest.fn()

    render(
      <>
        <SignalCanvasIconSprite />
        <ChainSide
          chainLabel="D"
          chainName="Wet Bus"
          active
          muted
          soloed
          pluginCount={4}
          branchCount={3}
          cpuLoad={0.875}
          onMuteToggle={handleMute}
          onSoloToggle={handleSolo}
          onDelete={handleDelete}
        />
      </>,
    )

    expect(screen.getByLabelText('Wet Bus chain side panel')).toHaveClass('is-active', 'is-muted')
    expect(screen.getByText('Blocks')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('88%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Unmute Wet Bus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unsolo Wet Bus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Wet Bus' }))

    expect(handleMute).toHaveBeenCalledTimes(1)
    expect(handleSolo).toHaveBeenCalledTimes(1)
    expect(handleDelete).toHaveBeenCalledTimes(1)
  })
})
