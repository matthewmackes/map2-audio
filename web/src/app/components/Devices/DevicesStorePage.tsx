import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Tag,
} from '@carbon/react'

import {
  DEVICE_REGISTRY,
  resolveDeviceOpenRoute,
  type DeviceRegistryEntry,
} from '../../data/deviceRegistry'
import { getDeviceHeroImage } from '../../data/deviceHeroImages'
import {
  isDevicePinned,
  pinDevice,
  unpinDevice,
  usePinnedDevices,
} from '../../state/uiSettings'
import { useToasts } from '../Toasts'

import './DevicesStorePage.css'

const KIND_ORDER: DeviceRegistryEntry['kind'][] = [
  'processor',
  'console',
  'control-surface',
  'audio-interface',
]

const KIND_LABELS: Record<DeviceRegistryEntry['kind'], string> = {
  processor: 'Processors',
  console: 'Consoles',
  'control-surface': 'Control Surfaces',
  'audio-interface': 'Audio Interfaces',
}

interface PendingOpen {
  deviceId: string
  deviceLabel: string
  targetRoute: string
}

interface DeviceCardProps {
  entry: DeviceRegistryEntry
  pinned: boolean
  onOpen: (entry: DeviceRegistryEntry) => void
  onTogglePin: (entry: DeviceRegistryEntry) => void
  onUploadHero: (entry: DeviceRegistryEntry) => void
  onRevertHero: (entry: DeviceRegistryEntry) => void
}

function DeviceCard({ entry, pinned, onOpen, onTogglePin, onUploadHero, onRevertHero }: DeviceCardProps) {
  const hero = getDeviceHeroImage(entry.id)
  const Icon = entry.icon

  return (
    <article
      className={`devices-store__card${pinned ? ' devices-store__card--pinned' : ''}`}
      data-device-id={entry.id}
      data-kind={entry.kind}
      data-pinned={pinned ? 'true' : 'false'}
      style={{ '--device-color': entry.color } as React.CSSProperties}
      aria-label={entry.label}
    >
      <div className="devices-store__card-hero">
        {hero ? (
          <img src={hero.imagePath} alt={hero.alt} className="devices-store__card-hero-img" loading="lazy" />
        ) : (
          <div className="devices-store__card-hero-placeholder" aria-hidden>
            <Icon size={64} />
          </div>
        )}
        <div className="devices-store__card-kebab" onClick={(e) => e.stopPropagation()}>
          <OverflowMenu
            size="sm"
            flipped
            aria-label={`More actions for ${entry.label}`}
          >
            <OverflowMenuItem
              itemText="Upload hero image…"
              onClick={() => onUploadHero(entry)}
            />
            <OverflowMenuItem
              itemText="Revert to default image"
              onClick={() => onRevertHero(entry)}
            />
          </OverflowMenu>
        </div>
      </div>

      <div className="devices-store__card-body">
        <header className="devices-store__card-head">
          <h2 className="devices-store__card-title">{entry.label}</h2>
          <p className="devices-store__card-eyebrow">{entry.eyebrow}</p>
        </header>
        <p className="devices-store__card-desc">{entry.description}</p>
        {entry.capabilities.length > 0 ? (
          <div className="devices-store__card-tags" aria-label="Capabilities">
            {entry.capabilities.slice(0, 3).map((cap) => (
              <Tag key={cap} type="cool-gray" size="sm">{cap}</Tag>
            ))}
          </div>
        ) : null}
      </div>

      <footer className="devices-store__card-footer">
        {pinned ? (
          <Button
            kind="danger--ghost"
            size="md"
            onClick={() => onTogglePin(entry)}
            className="devices-store__card-btn devices-store__card-btn--full"
          >
            Unpin
          </Button>
        ) : (
          <>
            <Button
              kind="tertiary"
              size="md"
              onClick={() => onOpen(entry)}
              className="devices-store__card-btn"
            >
              Open
            </Button>
            <Button
              kind="primary"
              size="md"
              onClick={() => onTogglePin(entry)}
              className="devices-store__card-btn"
            >
              Pin
            </Button>
          </>
        )}
      </footer>
    </article>
  )
}

export function DevicesStorePage() {
  const navigate = useNavigate()
  const pinnedIds = usePinnedDevices()
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])
  const { pushToast } = useToasts()
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null)

  const groupedEntries = useMemo(() => {
    return KIND_ORDER.map((kind) => ({
      kind,
      label: KIND_LABELS[kind],
      entries: DEVICE_REGISTRY
        .filter((entry) => entry.kind === kind)
        .sort((a, b) => a.label.localeCompare(b.label)),
    })).filter((group) => group.entries.length > 0)
  }, [])

  const handleTogglePin = useCallback((entry: DeviceRegistryEntry) => {
    if (isDevicePinned(entry.id)) {
      unpinDevice(entry.id)
      pushToast(`Unpinned ${entry.label} from Devices.`, 'info', {
        durationMs: 5000,
        action: {
          label: 'Undo',
          onClick: () => pinDevice(entry.id),
        },
      })
    } else {
      pinDevice(entry.id)
      pushToast(`Pinned ${entry.label}.`, 'success', { durationMs: 3500 })
    }
  }, [pushToast])

  const handleOpen = useCallback((entry: DeviceRegistryEntry) => {
    const target = resolveDeviceOpenRoute(entry.id)
    if (isDevicePinned(entry.id)) {
      navigate(target)
      return
    }
    setPendingOpen({ deviceId: entry.id, deviceLabel: entry.label, targetRoute: target })
  }, [navigate])

  const handlePinAndOpen = useCallback(() => {
    if (!pendingOpen) return
    pinDevice(pendingOpen.deviceId)
    pushToast(`Pinned ${pendingOpen.deviceLabel}.`, 'success', { durationMs: 3500 })
    const route = pendingOpen.targetRoute
    setPendingOpen(null)
    navigate(route)
  }, [pendingOpen, pushToast, navigate])

  const handleJustOpen = useCallback(() => {
    if (!pendingOpen) return
    const route = pendingOpen.targetRoute
    setPendingOpen(null)
    navigate(route)
  }, [pendingOpen, navigate])

  // Hero-image upload/revert are stubbed until T2426-C lands the backend.
  const handleUploadHero = useCallback((entry: DeviceRegistryEntry) => {
    pushToast(
      `Hero-image upload for ${entry.label} ships in the next slice (T2426-C).`,
      'info',
      { durationMs: 3500 },
    )
  }, [pushToast])

  const handleRevertHero = useCallback((entry: DeviceRegistryEntry) => {
    pushToast(
      `Hero-image revert for ${entry.label} ships in the next slice (T2426-C).`,
      'info',
      { durationMs: 3500 },
    )
  }, [pushToast])

  return (
    <div className="devices-store" data-testid="devices-store-page">
      <header className="devices-store__intro">
        <p className="devices-store__intro-eyebrow">Devices</p>
        <h1 className="devices-store__intro-title">Hardware &amp; control surfaces</h1>
        <p className="devices-store__intro-body">
          Browse the full catalog and pin the devices you use so they appear under
          <strong> Devices</strong> in the left navigation.
        </p>
      </header>

      {groupedEntries.map((group) => (
        <section key={group.kind} className="devices-store__group" aria-label={group.label}>
          <h2 className="devices-store__group-title">{group.label}</h2>
          <div className="devices-store__grid" role="list">
            {group.entries.map((entry) => (
              <div role="listitem" key={entry.id} className="devices-store__grid-cell">
                <DeviceCard
                  entry={entry}
                  pinned={pinnedSet.has(entry.id)}
                  onOpen={handleOpen}
                  onTogglePin={handleTogglePin}
                  onUploadHero={handleUploadHero}
                  onRevertHero={handleRevertHero}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {pendingOpen ? (
        <Modal
          open
          size="sm"
          modalHeading={`Pin ${pendingOpen.deviceLabel}?`}
          primaryButtonText="Pin and open"
          secondaryButtonText="Just open"
          onRequestSubmit={handlePinAndOpen}
          onSecondarySubmit={handleJustOpen}
          onRequestClose={() => setPendingOpen(null)}
          className="devices-store__pin-open-modal"
        >
          <p>
            {pendingOpen.deviceLabel} isn&apos;t pinned yet. Pinning adds it to the
            <strong> Devices</strong> section of the left navigation so you can jump back
            without revisiting this page.
          </p>
        </Modal>
      ) : null}
    </div>
  )
}

export default DevicesStorePage
