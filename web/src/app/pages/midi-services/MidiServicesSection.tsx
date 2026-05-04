/**
 * Shared section primitive for MIDI Services region pages.
 *
 * Combines the locked design choices (Q1–Q9, 2026-05-03):
 *   - kicker label (panel family) + numbered prefix + icon + bold title
 *     + status pill + one-line subtitle, separated by a thin underline
 *   - alternating background bands with generous whitespace between sections
 *   - active-state banner (live/recording/error) across the top
 *   - inline empty state (icon + message + CTA) for "nothing to show"
 *   - inline error banner (red bordered) with optional retry for "something is wrong"
 *
 * The section reads its title/kicker from MIDI_HUB_PANEL_META so existing
 * panelIds keep working; pages can override title/icon/etc. as needed.
 */

import type { ReactNode } from 'react'
import { Button, Tag } from '@carbon/react'
import { Renew, WarningFilled } from '@carbon/icons-react'

import { EmptyState } from '../../components/shared/EmptyState'
import {
  MIDI_HUB_PANEL_META,
  type MidiHubPanelId,
} from '../../components/MidiHub/MidiHubHelpPrimitives'
import './MidiServicesSection.css'

export type SectionStatusTone = 'live' | 'idle' | 'armed' | 'error' | 'neutral'

export interface MidiServicesSectionStatus {
  /** Tone drives the colour of the LED dot and active-state banner. */
  tone: SectionStatusTone
  /** Short label, e.g. "LIVE", "ARMED", "OFFLINE". */
  label: string
  /** Optional numeric/quantitative companion, e.g. "124 events/s". */
  detail?: string
  /** When true, the LED dot pulses and a coloured banner appears across the top of the section. */
  active?: boolean
}

export interface MidiServicesSectionEmpty {
  title: string
  description?: ReactNode
  icon?: ReactNode
  /** Primary CTA — wired to the user-facing action (e.g. "Scan for devices"). */
  actionLabel?: string
  onAction?: () => void
  /** Replace the default action button entirely. */
  actions?: ReactNode
}

export interface MidiServicesSectionError {
  title: string
  description?: ReactNode
  /** Optional retry callback — renders a "Retry" button when provided. */
  onRetry?: () => void
  retryLabel?: string
}

export interface MidiServicesSectionProps {
  /** Optional panelId reuse — provides default kicker/title from MIDI_HUB_PANEL_META. */
  panelId?: MidiHubPanelId
  /** 1-based index — rendered as a numbered prefix (`01 —`). */
  index?: number
  /** Override the kicker (panel family) — uppercased automatically. */
  kicker?: string
  /** Override the title. */
  title?: ReactNode
  /** Optional one-line description rendered below the title. */
  subtitle?: ReactNode
  /** Icon rendered to the left of the title. Carbon icon or custom MIDI glyph. */
  icon?: ReactNode
  /** Right-aligned status pill (LED dot + label + optional detail). */
  status?: MidiServicesSectionStatus
  /** Active-state banner replaces the section content with a coloured bar across the top. */
  bannerMessage?: ReactNode
  /** Empty-state content shown instead of `children` when truthy. */
  empty?: MidiServicesSectionEmpty
  /** Error-state content shown above `children` (or instead of empty) when truthy. */
  error?: MidiServicesSectionError
  /** Override the section identity for anchoring/testing. */
  id?: string
  /** Section content. */
  children?: ReactNode
}

type TagColor =
  | 'red'
  | 'magenta'
  | 'purple'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'green'
  | 'gray'
  | 'cool-gray'
  | 'warm-gray'
  | 'high-contrast'
  | 'outline'

const TONE_LABEL_TO_TAG_TYPE: Record<SectionStatusTone, TagColor> = {
  live: 'green',
  armed: 'magenta',
  idle: 'cool-gray',
  error: 'red',
  neutral: 'cool-gray',
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function MidiServicesSection({
  panelId,
  index,
  kicker,
  title,
  subtitle,
  icon,
  status,
  bannerMessage,
  empty,
  error,
  id,
  children,
}: MidiServicesSectionProps) {
  const meta = panelId ? MIDI_HUB_PANEL_META[panelId] : undefined
  const resolvedKicker = (kicker ?? meta?.family ?? 'Section').toUpperCase()
  const resolvedTitle = title ?? meta?.title ?? ''
  const resolvedId = id ?? (panelId ? `midi-services-section-${panelId}` : undefined)

  const numberedPrefix =
    typeof index === 'number'
      ? String(index).padStart(2, '0')
      : null

  const tone = status?.tone ?? 'neutral'
  const showActiveBanner = Boolean(status?.active) || Boolean(bannerMessage)
  const bannerTone: SectionStatusTone = error ? 'error' : tone
  const showBanner = Boolean(error) || showActiveBanner

  return (
    <section
      id={resolvedId}
      className={joinClasses(
        'midi-services-section',
        `midi-services-section--tone-${tone}`,
        showBanner && 'midi-services-section--has-banner',
        error && 'midi-services-section--has-error',
      )}
    >
      {showBanner ? (
        <div
          className={joinClasses(
            'midi-services-section__banner',
            `midi-services-section__banner--${bannerTone}`,
          )}
          role={error ? 'alert' : 'status'}
        >
          {error ? <WarningFilled /> : null}
          <span className="midi-services-section__banner-text">
            {bannerMessage ?? (error ? error.title : status?.label)}
          </span>
        </div>
      ) : null}

      <header className="midi-services-section__header">
        <div className="midi-services-section__heading-row">
          <div className="midi-services-section__title-block">
            <div className="midi-services-section__kicker">
              {numberedPrefix ? (
                <span className="midi-services-section__number">{numberedPrefix}</span>
              ) : null}
              <span className="midi-services-section__kicker-label">{resolvedKicker}</span>
              {meta?.advanced ? (
                <Tag type="warm-gray" size="sm">
                  Advanced
                </Tag>
              ) : null}
            </div>
            <h2 className="midi-services-section__title">
              {icon ? (
                <span className="midi-services-section__icon" aria-hidden="true">
                  {icon}
                </span>
              ) : null}
              <span className="midi-services-section__title-text">{resolvedTitle}</span>
            </h2>
          </div>
          {status ? (
            <div
              className={joinClasses(
                'midi-services-section__status',
                `midi-services-section__status--${tone}`,
                status.active && 'midi-services-section__status--active',
              )}
            >
              <span
                className={joinClasses(
                  'midi-services-section__led',
                  `midi-services-section__led--${tone}`,
                  status.active && 'midi-services-section__led--pulse',
                )}
                aria-hidden="true"
              />
              <Tag type={TONE_LABEL_TO_TAG_TYPE[tone]} size="md">
                {status.label}
              </Tag>
              {status.detail ? (
                <span className="midi-services-section__status-detail">{status.detail}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {subtitle ? (
          <p className="midi-services-section__subtitle">{subtitle}</p>
        ) : null}
        <span className="midi-services-section__rule" aria-hidden="true" />
      </header>

      <div className="midi-services-section__content">
        {error ? (
          <div className="midi-services-section__error" role="alert">
            <div className="midi-services-section__error-body">
              <WarningFilled className="midi-services-section__error-icon" />
              <div>
                <div className="midi-services-section__error-title">{error.title}</div>
                {error.description ? (
                  <div className="midi-services-section__error-description">
                    {error.description}
                  </div>
                ) : null}
              </div>
            </div>
            {error.onRetry ? (
              <Button
                kind="danger--tertiary"
                size="md"
                renderIcon={Renew}
                onClick={error.onRetry}
              >
                {error.retryLabel ?? 'Retry'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {!error && empty ? (
          <EmptyState
            title={empty.title}
            description={empty.description}
            icon={empty.icon}
            actions={
              empty.actions ??
              (empty.actionLabel && empty.onAction ? (
                <Button kind="primary" size="md" onClick={empty.onAction}>
                  {empty.actionLabel}
                </Button>
              ) : undefined)
            }
          />
        ) : null}

        {!error && !empty ? children : null}
      </div>
    </section>
  )
}

export default MidiServicesSection
