import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  buildDeviceHeroImageUrl,
  deviceHeroImagesApi,
} from '../../../map2/clients/deviceHeroImages'

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

interface DeviceCardHeroProps {
  entry: DeviceRegistryEntry
  overrideVersion: number | null
}

function DeviceCardHero({ entry, overrideVersion }: DeviceCardHeroProps) {
  const Icon = entry.icon
  const packaged = getDeviceHeroImage(entry.id)
  const hasOverride = overrideVersion !== null
  // Three-step render chain: override → packaged → icon placeholder.
  const [stage, setStage] = useState<'override' | 'packaged' | 'placeholder'>(
    hasOverride ? 'override' : packaged ? 'packaged' : 'placeholder',
  )

  // When overrideVersion changes (upload/revert), restart the chain.
  useEffect(() => {
    if (hasOverride) {
      setStage('override')
    } else if (packaged) {
      setStage('packaged')
    } else {
      setStage('placeholder')
    }
  }, [hasOverride, packaged])

  if (stage === 'override') {
    return (
      <img
        src={buildDeviceHeroImageUrl(entry.id, overrideVersion ?? undefined)}
        alt={`${entry.label} custom hero`}
        className="devices-store__card-hero-img"
        loading="lazy"
        onError={() => setStage(packaged ? 'packaged' : 'placeholder')}
      />
    )
  }

  if (stage === 'packaged' && packaged) {
    return (
      <img
        src={packaged.imagePath}
        alt={packaged.alt}
        className="devices-store__card-hero-img"
        loading="lazy"
        onError={() => setStage('placeholder')}
      />
    )
  }

  return (
    <div className="devices-store__card-hero-placeholder" aria-hidden>
      <Icon size={64} />
    </div>
  )
}

interface DeviceCardProps {
  entry: DeviceRegistryEntry
  pinned: boolean
  overrideVersion: number | null
  onOpen: (entry: DeviceRegistryEntry) => void
  onTogglePin: (entry: DeviceRegistryEntry) => void
  onUploadHero: (entry: DeviceRegistryEntry, file: File) => void
  onRevertHero: (entry: DeviceRegistryEntry) => void
}

function DeviceCard({
  entry,
  pinned,
  overrideVersion,
  onOpen,
  onTogglePin,
  onUploadHero,
  onRevertHero,
}: DeviceCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        onUploadHero(entry, file)
      }
      // Reset so selecting the same file twice still triggers change.
      if (event.target) event.target.value = ''
    },
    [entry, onUploadHero],
  )

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
        <DeviceCardHero entry={entry} overrideVersion={overrideVersion} />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          className="devices-store__card-file-input"
          onChange={handleFileChange}
          aria-label={`Upload hero image for ${entry.label}`}
        />
        <div className="devices-store__card-kebab" onClick={(e) => e.stopPropagation()}>
          <OverflowMenu
            size="sm"
            flipped
            aria-label={`More actions for ${entry.label}`}
          >
            <OverflowMenuItem
              itemText="Upload hero image… (PNG, max 2 MB, 1024×1024)"
              onClick={triggerFilePicker}
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
  // `overrideVersions` maps deviceId → non-negative integer used to cache-bust
  // the override `<img>`. A value of `0` (and the absence of a key) both mean
  // "no override known"; a probe on mount populates existing overrides so the
  // correct image renders on first paint without a flash.
  const [overrideVersions, setOverrideVersions] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    // Probe every registry entry once on mount to discover pre-existing overrides.
    // The server responds with 404 when no override exists, so this is cheap.
    Promise.all(
      DEVICE_REGISTRY.map(async (entry) => {
        try {
          const exists = await deviceHeroImagesApi.exists(entry.id)
          return exists ? entry.id : null
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const withOverrides = results.filter((id): id is string => id !== null)
      if (withOverrides.length === 0) return
      setOverrideVersions((prev) => {
        const next = { ...prev }
        for (const id of withOverrides) {
          if (!next[id]) next[id] = Date.now()
        }
        return next
      })
    })
    return () => { cancelled = true }
  }, [])

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

  const handleUploadHero = useCallback(
    async (entry: DeviceRegistryEntry, file: File) => {
      if (file.type !== 'image/png') {
        pushToast(`Hero image must be a PNG. Got ${file.type || 'unknown'}.`, 'error', { durationMs: 4500 })
        return
      }
      if (file.size > 2 * 1024 * 1024) {
        pushToast(`Hero image exceeds the 2 MB cap (got ${Math.ceil(file.size / 1024)} KB).`, 'error', { durationMs: 4500 })
        return
      }
      try {
        await deviceHeroImagesApi.upload(entry.id, file)
        setOverrideVersions((prev) => ({ ...prev, [entry.id]: Date.now() }))
        pushToast(`Hero image updated for ${entry.label}.`, 'success', { durationMs: 3500 })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        pushToast(`Couldn't upload hero image for ${entry.label}: ${message}`, 'error', { durationMs: 5000 })
      }
    },
    [pushToast],
  )

  const handleRevertHero = useCallback(
    async (entry: DeviceRegistryEntry) => {
      try {
        await deviceHeroImagesApi.revert(entry.id)
        setOverrideVersions((prev) => {
          if (!(entry.id in prev)) return prev
          const next = { ...prev }
          delete next[entry.id]
          return next
        })
        pushToast(`Reverted ${entry.label} to the packaged hero image.`, 'info', { durationMs: 3500 })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Revert failed'
        pushToast(`Couldn't revert hero image for ${entry.label}: ${message}`, 'error', { durationMs: 5000 })
      }
    },
    [pushToast],
  )

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
                  overrideVersion={overrideVersions[entry.id] ?? null}
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
