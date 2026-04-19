import React from 'react'
import { render, screen } from '@testing-library/react'

import { SnapshotEditorPage } from './SnapshotEditorPageContent'

jest.mock('./SnapshotEditorPageContent', () => ({
  SnapshotEditorPage: () => <div data-testid="snapshot-editor-page-core">Snapshot editor core</div>,
  __esModule: true,
  default: () => <div data-testid="snapshot-editor-page-core">Snapshot editor core</div>,
}))

describe('SnapshotEditorPage', () => {
  it('renders the snapshot editor page entry without crashing', () => {
    render(<SnapshotEditorPage />)

    expect(screen.getByTestId('snapshot-editor-page-core').textContent).toBe('Snapshot editor core')
  })
})
