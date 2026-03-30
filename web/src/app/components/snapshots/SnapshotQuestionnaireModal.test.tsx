import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  SnapshotQuestionnaireModal,
  type SnapshotQuestionnaireValue,
} from './SnapshotQuestionnaireModal'

function buildInitialValue(overrides: Partial<SnapshotQuestionnaireValue> = {}): SnapshotQuestionnaireValue {
  return {
    name: 'Snapshot 9',
    description: 'Created from Snapshot Editor',
    tags: [],
    program_number: null,
    input_device: null,
    output_device: null,
    ...overrides,
  }
}

describe('SnapshotQuestionnaireModal', () => {
  beforeEach(() => {
    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        configurable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  it('asks one question at a time and supports sequential navigation', () => {
    render(
      <SnapshotQuestionnaireModal
        open
        title="Create snapshot"
        label="Snapshot capture"
        initialValue={buildInitialValue()}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'What should this snapshot be called?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What is the core purpose of this snapshot?' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    expect(screen.getByRole('heading', { name: 'What is the core purpose of this snapshot?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'What should this snapshot be called?' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }))

    expect(screen.getByRole('heading', { name: 'What should this snapshot be called?' })).toBeInTheDocument()
  })

  it('submits questionnaire answers as enriched snapshot metadata on the final step', () => {
    const onSubmit = jest.fn()

    render(
      <SnapshotQuestionnaireModal
        open
        title="Create snapshot"
        label="Snapshot capture"
        initialValue={buildInitialValue({ name: '' })}
        onClose={jest.fn()}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Snapshot name'), {
      target: { value: 'Sunday Lead' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Primary description'), {
      target: { value: 'Lead scene for the main chorus.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Use case'), {
      target: { value: 'main stage chorus' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Instrument or source'), {
      target: { value: 'baritone guitar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Routing focus'), {
      target: { value: 'parallel blend' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Mood or scene'), {
      target: { value: 'wide ambient intro' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('MIDI program number'), {
      target: { value: '42' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Preferred input device'), {
      target: { value: 'USB Guitar In' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Preferred output device'), {
      target: { value: 'IEM bus 3/4' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))

    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'lead, sunday, midi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create snapshot' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Sunday Lead',
      description: 'Lead scene for the main chorus.\nmain stage chorus\nbaritone guitar\nparallel blend\nwide ambient intro',
      tags: ['lead', 'sunday', 'midi', 'main stage chorus', 'baritone guitar', 'parallel blend', 'wide ambient intro'],
      program_number: 42,
      input_device: 'USB Guitar In',
      output_device: 'IEM bus 3/4',
    })
  })
})
