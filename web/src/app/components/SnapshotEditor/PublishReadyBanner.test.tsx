import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { PublishReadyBanner } from './PublishReadyBanner'

describe('PublishReadyBanner', () => {
  it('shows the snapshot name and block count, and disables Publish when asked', () => {
    const onPublish = jest.fn()
    render(
      <PublishReadyBanner
        snapshotName="Sunday Set — Verse"
        blockCount={4}
        onPublish={onPublish}
        publishDisabled
      />,
    )

    expect(screen.getByText('Draft is ready to publish')).toBeInTheDocument()
    expect(screen.getByText(/Sunday Set — Verse/)).toBeInTheDocument()
    expect(screen.getByText(/4 blocks/)).toBeInTheDocument()

    const publishBtn = screen.getByRole('button', { name: /Publish to live/i })
    expect(publishBtn).toBeDisabled()
    fireEvent.click(publishBtn)
    expect(onPublish).not.toHaveBeenCalled()
  })

  it('uses singular "block" when there is exactly one', () => {
    render(<PublishReadyBanner snapshotName="Single" blockCount={1} onPublish={jest.fn()} />)
    expect(screen.getByText(/1 block\./)).toBeInTheDocument()
  })

  it('omits the Diff button when no handler is provided', () => {
    render(<PublishReadyBanner snapshotName="X" blockCount={2} onPublish={jest.fn()} />)
    expect(screen.queryByRole('button', { name: /Diff vs live/i })).toBeNull()
  })

  it('fires Diff and Publish callbacks', () => {
    const onDiff = jest.fn()
    const onPublish = jest.fn()
    render(
      <PublishReadyBanner snapshotName="X" blockCount={2} onDiff={onDiff} onPublish={onPublish} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Diff vs live/i }))
    fireEvent.click(screen.getByRole('button', { name: /Publish to live/i }))
    expect(onDiff).toHaveBeenCalledTimes(1)
    expect(onPublish).toHaveBeenCalledTimes(1)
  })
})
