import {
  Button,
  ComposedModal,
  InlineLoading,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from '@carbon/react'
import {
  AudioConsole,
  CheckmarkOutline,
  ErrorOutline,
  Network_3,
  WarningAlt,
} from '@carbon/icons-react'

import type { RebootPreflightResult } from './useRebootSystem'

type Props = {
  open: boolean
  preflightLoading: boolean
  preflight: RebootPreflightResult | null
  onClose: () => void
  onConfirm: () => void
}

type PreflightRow = {
  icon: React.ReactNode
  label: string
  value: string
  status: 'ok' | 'warn' | 'info'
}

function buildPreflightRows(p: RebootPreflightResult): PreflightRow[] {
  return [
    {
      icon: <AudioConsole size={16} aria-hidden />,
      label: 'Audio engine',
      value: p.audioLive ? 'Active — output will be cut' : 'Idle',
      status: p.audioLive ? 'warn' : 'ok',
    },
    {
      icon: <Network_3 size={16} aria-hidden />,
      label: 'AVB network',
      value: p.avbEnabled ? 'Connected — streams will drop and re-connect' : 'Not in use',
      status: p.avbEnabled ? 'warn' : 'ok',
    },
    {
      icon: <WarningAlt size={16} aria-hidden />,
      label: 'MIDI learn',
      value: p.midiLearning ? 'In progress — session will be lost' : 'Not active',
      status: p.midiLearning ? 'warn' : 'ok',
    },
    {
      icon: <CheckmarkOutline size={16} aria-hidden />,
      label: 'Session data',
      value: 'Will be saved before shutdown begins',
      status: 'ok',
    },
  ]
}

export function RebootConfirmModal({ open, preflightLoading, preflight, onClose, onConfirm }: Props) {
  const rows = preflight ? buildPreflightRows(preflight) : []
  const hasWarnings = rows.some((r) => r.status === 'warn')

  return (
    <ComposedModal className="shell-reboot-modal" open={open} onClose={onClose} size="sm">
      <ModalHeader title="Full platform reboot" label="Power" closeModal={onClose} />
      <ModalBody>
        <p className="shell-reboot-modal__lead">
          This will perform a complete reboot of the MAP2 platform, including all audio services and
          the foundational operating system. Expect 20–60 seconds of downtime.
        </p>

        <div className="shell-reboot-modal__preflight-head">
          <span>System readiness check</span>
          {preflightLoading && <InlineLoading description="Checking…" status="active" />}
        </div>

        {preflightLoading || !preflight ? (
          <div className="shell-reboot-modal__preflight-skeleton">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="shell-reboot-modal__preflight-row shell-reboot-modal__preflight-row--loading" />
            ))}
          </div>
        ) : (
          <div className="shell-reboot-modal__preflight-list">
            {rows.map((row) => (
              <div
                key={row.label}
                className={`shell-reboot-modal__preflight-row shell-reboot-modal__preflight-row--${row.status}`}
              >
                <span className="shell-reboot-modal__preflight-icon">{row.icon}</span>
                <span className="shell-reboot-modal__preflight-label">{row.label}</span>
                <span className="shell-reboot-modal__preflight-value">{row.value}</span>
                <span className="shell-reboot-modal__preflight-status-icon" aria-hidden>
                  {row.status === 'ok' ? (
                    <CheckmarkOutline size={14} />
                  ) : row.status === 'warn' ? (
                    <WarningAlt size={14} />
                  ) : (
                    <ErrorOutline size={14} />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {hasWarnings && !preflightLoading ? (
          <p className="shell-reboot-modal__warning-note">
            Items marked above will be interrupted. This is expected behavior during a full system reboot.
          </p>
        ) : null}

        <p className="shell-reboot-modal__irrevocable">
          Once confirmed, the reboot cannot be stopped.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          kind="danger"
          onClick={onConfirm}
          disabled={preflightLoading}
        >
          Reboot system
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}
