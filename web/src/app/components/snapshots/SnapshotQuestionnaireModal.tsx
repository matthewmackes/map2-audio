import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import {
  Modal,
  NumberInput,
  ProgressIndicator,
  ProgressStep,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'

import './SnapshotQuestionnaireModal.css'

export interface SnapshotQuestionnaireValue {
  name: string
  description: string
  tags: string[]
  program_number: number | null
  input_device: string | null
  output_device: string | null
}

interface SnapshotQuestionnaireModalProps {
  open: boolean
  title: string
  label: string
  initialValue: SnapshotQuestionnaireValue
  onClose: () => void
  onSubmit: (value: SnapshotQuestionnaireValue) => void | Promise<void>
  submitting?: boolean
}

interface SnapshotQuestionDefinition {
  id: string
  eyebrow: string
  title: string
  helper: string
  accent: string
  tagType: 'blue' | 'cyan' | 'teal' | 'green' | 'purple' | 'magenta'
  render: (value: SnapshotQuestionnaireValue, update: (patch: Partial<SnapshotQuestionnaireValue>) => void) => ReactElement
}

function parseTagValue(input: string): string[] {
  return input
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
}

function formatTagValue(tags: string[]) {
  return tags.join(', ')
}

export function buildSnapshotQuestionnaireDescription(value: SnapshotQuestionnaireValue, extraAnswers: string[]): string {
  const lines = [value.description.trim(), ...extraAnswers.map((answer) => answer.trim()).filter(Boolean)]
  return lines.filter(Boolean).join('\n')
}

export function SnapshotQuestionnaireModal({
  open,
  title,
  label,
  initialValue,
  onClose,
  onSubmit,
  submitting = false,
}: SnapshotQuestionnaireModalProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [value, setValue] = useState<SnapshotQuestionnaireValue>(initialValue)
  const [useCase, setUseCase] = useState('')
  const [instrumentation, setInstrumentation] = useState('')
  const [routingFocus, setRoutingFocus] = useState('')
  const [sceneMood, setSceneMood] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    setStepIndex(0)
    setValue(initialValue)
    setUseCase('')
    setInstrumentation('')
    setRoutingFocus('')
    setSceneMood('')
  }, [initialValue, open])

  const updateValue = (patch: Partial<SnapshotQuestionnaireValue>) => {
    setValue((current) => ({ ...current, ...patch }))
  }

  const questions = useMemo<SnapshotQuestionDefinition[]>(() => [
    {
      id: 'name',
      eyebrow: 'Question 1 of 10',
      title: 'What should this snapshot be called?',
      helper: 'Choose the visible recall name performers will recognize fast.',
      accent: '#0f62fe',
      tagType: 'blue',
      render: (current, update) => (
        <TextInput
          id="snapshot-questionnaire-name"
          labelText="Snapshot name"
          value={current.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder="Sunday lead stack"
        />
      ),
    },
    {
      id: 'description',
      eyebrow: 'Question 2 of 10',
      title: 'What is the core purpose of this snapshot?',
      helper: 'Keep it short. This becomes the main description visible in snapshot views.',
      accent: '#0043ce',
      tagType: 'blue',
      render: (current, update) => (
        <TextArea
          id="snapshot-questionnaire-description"
          labelText="Primary description"
          rows={4}
          value={current.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="Tight rhythm scene with edge breakup and MIDI-ready lead handoff."
        />
      ),
    },
    {
      id: 'use-case',
      eyebrow: 'Question 3 of 10',
      title: 'Where or when will you use it?',
      helper: 'Add context like service, song section, rehearsal, fly date, or failover role.',
      accent: '#00539a',
      tagType: 'cyan',
      render: () => (
        <TextInput
          id="snapshot-questionnaire-use-case"
          labelText="Use case"
          value={useCase}
          onChange={(event) => setUseCase(event.target.value)}
          placeholder="Main stage chorus, fallback FOH, rehearsal programming"
        />
      ),
    },
    {
      id: 'instrumentation',
      eyebrow: 'Question 4 of 10',
      title: 'What source or instrument does it serve?',
      helper: 'Capture the performer, instrument, or input role for later filtering.',
      accent: '#007d79',
      tagType: 'teal',
      render: () => (
        <TextInput
          id="snapshot-questionnaire-instrumentation"
          labelText="Instrument or source"
          value={instrumentation}
          onChange={(event) => setInstrumentation(event.target.value)}
          placeholder="Baritone guitar, synth lead, click stem return"
        />
      ),
    },
    {
      id: 'routing',
      eyebrow: 'Question 5 of 10',
      title: 'What routing or mix behavior matters most?',
      helper: 'Note any routing priority so the snapshot intent is obvious on inspection.',
      accent: '#198038',
      tagType: 'green',
      render: () => (
        <TextInput
          id="snapshot-questionnaire-routing"
          labelText="Routing focus"
          value={routingFocus}
          onChange={(event) => setRoutingFocus(event.target.value)}
          placeholder="Parallel blend, dry/wet split, spillover-safe scene"
        />
      ),
    },
    {
      id: 'scene',
      eyebrow: 'Question 6 of 10',
      title: 'What feeling or scene should this communicate?',
      helper: 'Useful when multiple snapshots share the same technical layout.',
      accent: '#6929c4',
      tagType: 'purple',
      render: () => (
        <TextInput
          id="snapshot-questionnaire-scene"
          labelText="Mood or scene"
          value={sceneMood}
          onChange={(event) => setSceneMood(event.target.value)}
          placeholder="Wide ambient intro, dry punch verse, bright solo bloom"
        />
      ),
    },
    {
      id: 'program-number',
      eyebrow: 'Question 7 of 10',
      title: 'Should it respond to a MIDI program number?',
      helper: 'Leave blank if recall will stay UI-only.',
      accent: '#8a3ffc',
      tagType: 'purple',
      render: (current, update) => (
        <NumberInput
          id="snapshot-questionnaire-program"
          label="MIDI program number"
          min={0}
          max={127}
          step={1}
          allowEmpty
          value={current.program_number ?? ''}
          onChange={(_event, { value: nextValue }) => {
            const parsed = typeof nextValue === 'number' && Number.isFinite(nextValue)
              ? Math.min(127, Math.max(0, Math.round(nextValue)))
              : null
            update({ program_number: parsed })
          }}
        />
      ),
    },
    {
      id: 'input-device',
      eyebrow: 'Question 8 of 10',
      title: 'What input device should operators expect?',
      helper: 'Optional device intent helps during restore or hardware remap.',
      accent: '#a56eff',
      tagType: 'magenta',
      render: (current, update) => (
        <TextInput
          id="snapshot-questionnaire-input"
          labelText="Preferred input device"
          value={current.input_device ?? ''}
          onChange={(event) => update({ input_device: event.target.value.trim() || null })}
          placeholder="Stagebox 1, USB Guitar In, RTP-MIDI controller"
        />
      ),
    },
    {
      id: 'output-device',
      eyebrow: 'Question 9 of 10',
      title: 'What output device or destination should it target?',
      helper: 'Optional output intent helps the snapshot stand out during deployment review.',
      accent: '#d12771',
      tagType: 'magenta',
      render: (current, update) => (
        <TextInput
          id="snapshot-questionnaire-output"
          labelText="Preferred output device"
          value={current.output_device ?? ''}
          onChange={(event) => update({ output_device: event.target.value.trim() || null })}
          placeholder="IEM bus 3/4, FOH stem pair, reamp return"
        />
      ),
    },
    {
      id: 'tags',
      eyebrow: 'Question 10 of 10',
      title: 'Which tags should make it easy to find later?',
      helper: 'Comma-separated tags work best. Use short searchable labels.',
      accent: '#ee5396',
      tagType: 'magenta',
      render: (current, update) => (
        <TextInput
          id="snapshot-questionnaire-tags"
          labelText="Tags"
          value={formatTagValue(current.tags)}
          onChange={(event) => update({ tags: parseTagValue(event.target.value) })}
          placeholder="lead, sunday, midi, ambient"
        />
      ),
    },
  ], [instrumentation, routingFocus, sceneMood, useCase])

  const activeQuestion = questions[stepIndex]
  const canAdvance = activeQuestion.id !== 'name' || value.name.trim().length > 0
  const primaryButtonText = stepIndex === questions.length - 1
    ? (submitting ? 'Creating…' : 'Create snapshot')
    : 'Next question'
  const secondaryButtonText = stepIndex === 0 ? 'Cancel' : 'Previous question'

  const handleSecondary = () => {
    if (stepIndex === 0) {
      onClose()
      return
    }
    setStepIndex((current) => current - 1)
  }

  const handleSubmit = () => {
    if (stepIndex < questions.length - 1) {
      setStepIndex((current) => current + 1)
      return
    }

    const summaryAnswers = [useCase, instrumentation, routingFocus, sceneMood]
    onSubmit({
      ...value,
      name: value.name.trim(),
      description: buildSnapshotQuestionnaireDescription(value, summaryAnswers),
      tags: [
        ...value.tags,
        ...parseTagValue([useCase, instrumentation, routingFocus, sceneMood].join(',')),
      ].filter((tag, index, array) => array.indexOf(tag) === index),
      input_device: value.input_device?.trim() || null,
      output_device: value.output_device?.trim() || null,
    })
  }

  return (
    <Modal
      open={open}
      size="md"
      modalHeading={title}
      modalLabel={label}
      primaryButtonText={primaryButtonText}
      secondaryButtonText={secondaryButtonText}
      primaryButtonDisabled={!canAdvance || submitting}
      onRequestClose={onClose}
      onSecondarySubmit={handleSecondary}
      onRequestSubmit={handleSubmit}
      className="snapshot-questionnaire-modal"
    >
      <div
        className="snapshot-questionnaire-modal__body"
        style={{ '--snapshot-questionnaire-accent': activeQuestion.accent } as CSSProperties}
      >
        <ProgressIndicator currentIndex={stepIndex} spaceEqually className="snapshot-questionnaire-modal__progress">
          {questions.map((question) => (
            <ProgressStep
              key={question.id}
              label={`Q${questions.findIndex((candidate) => candidate.id === question.id) + 1}`}
              secondaryLabel={question.title}
            />
          ))}
        </ProgressIndicator>

        <section className="snapshot-questionnaire-modal__question-card" aria-live="polite">
          <div className="snapshot-questionnaire-modal__question-header">
            <p className="snapshot-questionnaire-modal__eyebrow">{activeQuestion.eyebrow}</p>
            <Tag type={activeQuestion.tagType}>Sequential capture</Tag>
          </div>
          <h3 className="snapshot-questionnaire-modal__title">{activeQuestion.title}</h3>
          <p className="snapshot-questionnaire-modal__helper">{activeQuestion.helper}</p>
          <div className="snapshot-questionnaire-modal__field">
            {activeQuestion.render(value, updateValue)}
          </div>
        </section>
      </div>
    </Modal>
  )
}
