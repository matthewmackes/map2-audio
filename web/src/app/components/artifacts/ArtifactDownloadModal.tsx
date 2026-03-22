/**
 * ArtifactDownloadModal
 *
 * Carbon ComposedModal with 5 tabs matching Artifacts page category order:
 *   Plugin Packs · NAM Models · Cabinet IRs · Reverb IRs · SoundFonts
 *
 * Each content tab embeds Carbon-native source selection + ProgressIndicator
 * download management — fully replacing the old MUI/Phosphor DownloadManager
 * and LibrarySources components inside this surface.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Accordion,
  AccordionItem,
  Button,
  Checkbox,
  ComposedModal,
  InlineLoading,
  InlineNotification,
  Layer,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ProgressIndicator,
  ProgressStep,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import {
  CheckmarkFilled,
  Close,
  Download,
  Launch,
  MachineLearningModel,
  Music,
  Package,
  Pause,
  Play,
  Renew,
  Reset,
  VolumeUp,
  Waveform,
  View,
  ViewOff,
} from '@carbon/icons-react'
import type { CarbonIconType } from '@carbon/icons-react'
import { irLibraryApi, soundfontApi } from '../../../map2/api'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'
import { useSoundFontDownloadProgress } from '../../hooks/useSoundFontDownloadProgress'
import { LIBRARY_SOURCES, SOUNDFONT_SOURCES } from '../../types/library'
import { withNodeQuery } from '../../utils/clusterTransport'
import './ArtifactDownloadModal.css'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'plugin-packs' | 'nam' | 'cabinet-irs' | 'reverb-irs' | 'soundfonts'

interface PluginPack {
  id: string
  name: string
  description: string
  packages: string[]
  category: string
  size_estimate: string
  plugin_count: number
  status: 'installed' | 'not_installed' | 'installing' | 'uninstalling' | 'disabled' | 'disabling' | 'enabling' | 'error'
  error_message?: string | null
  can_install?: boolean
  can_uninstall?: boolean
}

const TABS: Array<{ id: TabId; label: string; icon: CarbonIconType }> = [
  { id: 'plugin-packs', label: 'Plugin Packs', icon: Package },
  { id: 'nam', label: 'NAM Models', icon: MachineLearningModel },
  { id: 'cabinet-irs', label: 'Cabinet IRs', icon: VolumeUp },
  { id: 'reverb-irs', label: 'Reverb IRs', icon: Waveform },
  { id: 'soundfonts', label: 'SoundFonts', icon: Music },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

function packStatusTag(status: PluginPack['status']): { type: 'green' | 'gray' | 'blue' | 'red'; label: string } {
  switch (status) {
    case 'installed': return { type: 'green', label: 'Installed' }
    case 'disabled': return { type: 'gray', label: 'Disabled' }
    case 'installing':
    case 'uninstalling':
    case 'disabling':
    case 'enabling': return { type: 'blue', label: status }
    case 'error': return { type: 'red', label: 'Error' }
    default: return { type: 'gray', label: 'Not installed' }
  }
}

// ─── Carbon Download Progress ─────────────────────────────────────────────────

interface DownloadProgressPanelProps {
  hook: ReturnType<typeof useDownloadProgress> | ReturnType<typeof useSoundFontDownloadProgress>
  label: string
}

function DownloadProgressPanel({ hook, label }: DownloadProgressPanelProps) {
  const { status, isDownloading, isPaused, pauseDownload, resumeDownload, cancelDownload, resetDownload, retrySource, isCancelling, isPausing, isResuming } = hook
  if (!status?.stats && !isDownloading) return null

  const sources = status?.sources ?? []
  const stats = status?.stats
  const progress = status?.progress_percent ?? 0

  const stateToStep = (state: string): 'current' | 'complete' | 'invalid' | undefined => {
    switch (state) {
      case 'discovering': return 'current'
      case 'downloading': return 'current'
      case 'completed': return 'complete'
      case 'failed': return 'invalid'
      default: return undefined
    }
  }

  const speed = stats && stats.duration_seconds > 0
    ? stats.downloaded / stats.duration_seconds
    : 0

  return (
    <div className="adm-progress-panel">
      <div className="adm-progress-panel__header">
        <span className="adm-progress-panel__title">
          {isDownloading ? (isPaused ? `${label} — Paused` : `${label} — Downloading…`) : `${label} — Complete`}
        </span>
        <div className="adm-progress-panel__controls">
          {stats ? (
            <Tag type={stats.failed > 0 ? 'red' : 'green'}>
              {stats.downloaded}/{stats.total_files} files
            </Tag>
          ) : null}
          {isDownloading && !isPaused ? (
            <Button kind="ghost" size="sm" renderIcon={Pause} iconDescription="Pause" hasIconOnly onClick={() => pauseDownload()} disabled={isPausing} />
          ) : null}
          {isDownloading && isPaused ? (
            <Button kind="ghost" size="sm" renderIcon={Play} iconDescription="Resume" hasIconOnly onClick={() => resumeDownload()} disabled={isResuming} />
          ) : null}
          {isDownloading ? (
            <Button kind="ghost" size="sm" renderIcon={Close} iconDescription="Cancel" hasIconOnly onClick={() => cancelDownload()} disabled={isCancelling} />
          ) : (
            <Button kind="ghost" size="sm" renderIcon={Reset} iconDescription="Clear" hasIconOnly onClick={() => resetDownload()} />
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="adm-progress-panel__bar-wrap">
        <div className="adm-progress-panel__bar" style={{ '--prog': `${progress}%` } as React.CSSProperties} />
        <span className="adm-progress-panel__pct">{Math.round(progress)}%</span>
      </div>

      {stats ? (
        <div className="adm-progress-panel__stats">
          <Tag type="green" size="sm"><CheckmarkFilled size={12} aria-hidden="true" /> {stats.downloaded} downloaded</Tag>
          {stats.skipped > 0 ? <Tag type="cool-gray" size="sm">{stats.skipped} skipped</Tag> : null}
          {stats.failed > 0 ? <Tag type="red" size="sm">{stats.failed} failed</Tag> : null}
          {isDownloading && speed > 0 ? <Tag type="blue" size="sm">{speed.toFixed(1)} files/s</Tag> : null}
          {!isDownloading && stats.duration_seconds > 0 ? <Tag type="cool-gray" size="sm">{formatDuration(stats.duration_seconds)}</Tag> : null}
        </div>
      ) : null}

      {/* Per-source ProgressIndicator (Carbon pattern) */}
      {sources.length > 0 ? (
        <div className="adm-progress-panel__sources">
          <ProgressIndicator vertical spaceEqually={false} className="adm-progress-panel__indicator">
            {sources.map((source) => (
              <ProgressStep
                key={source.name}
                label={source.name}
                description={
                  source.state === 'discovering' ? 'Discovering files…'
                    : source.state === 'downloading' ? `${source.downloaded}/${source.total_files} — ${source.current_file ?? ''}`
                    : source.state === 'completed' ? `${source.downloaded} files downloaded`
                    : source.state === 'failed' ? `${source.failed} failed`
                    : 'Pending'
                }
                current={stateToStep(source.state) === 'current'}
                complete={stateToStep(source.state) === 'complete'}
                invalid={stateToStep(source.state) === 'invalid'}
                secondaryLabel={
                  (source.state === 'failed' || source.failed > 0) && !isDownloading
                    ? 'retry available'
                    : undefined
                }
                onClick={
                  (source.state === 'failed' || source.failed > 0) && !isDownloading
                    ? () => retrySource(source.name)
                    : undefined
                }
              />
            ))}
          </ProgressIndicator>
        </div>
      ) : null}
    </div>
  )
}

// ─── Tone3000 inline section (Carbon, minimal) ────────────────────────────────

function Tone3000Section({ downloadHook }: { downloadHook: ReturnType<typeof useDownloadProgress> }) {
  const [apiKey, setApiKey] = useState('')
  const [showInput, setShowInput] = useState(false)
  const queryClient = useQueryClient()
  const { startDownload, isDownloading, isStarting } = downloadHook

  const statusQuery = useQuery({
    queryKey: ['tone3000', 'status'],
    queryFn: irLibraryApi.getTone3000Status,
  })

  const setApiKeyMutation = useMutation({
    mutationFn: (key: string) => irLibraryApi.setTone3000ApiKey(key),
    onSuccess: () => {
      setApiKey('')
      setShowInput(false)
      void queryClient.invalidateQueries({ queryKey: ['tone3000'] })
    },
  })

  const testMutation = useMutation({
    mutationFn: irLibraryApi.testTone3000Auth,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tone3000'] }),
  })

  const status = statusQuery.data
  const isConfigured = status?.configured ?? false
  const isAuthenticated = status?.authenticated ?? false

  return (
    <div className="adm-tone3000">
      <div className="adm-tone3000__header">
        <span className="adm-tone3000__title">Tone3000</span>
        {isConfigured
          ? <Tag type={isAuthenticated ? 'green' : 'cyan'}>{isAuthenticated ? 'Connected' : 'Configured'}</Tag>
          : <Tag type="warm-gray">Not configured</Tag>}
      </div>
      <p className="adm-tone3000__desc">Largest NAM model community. Connect your account to download trending amp models.</p>

      {isConfigured ? (
        <div className="adm-tone3000__actions">
          <Button kind="primary" size="sm" renderIcon={Download} disabled={isDownloading || isStarting}
            onClick={() => startDownload({ sources: ['tone3000'], parallel: 4, skip_existing: true })}>
            Top 10 NAM models
          </Button>
          <Button kind="ghost" size="sm" renderIcon={Renew} disabled={testMutation.isPending}
            onClick={() => testMutation.mutate()}>
            Test auth
          </Button>
        </div>
      ) : null}

      {!isConfigured && !showInput ? (
        <div className="adm-tone3000__setup">
          <Button kind="primary" size="sm" renderIcon={Launch}
            href={status?.auth_url ?? 'https://www.tone3000.com/api/v1/auth'}
            target="_blank" rel="noopener noreferrer">
            Get API key
          </Button>
          <Button kind="ghost" size="sm" onClick={() => setShowInput(true)}>Enter key</Button>
        </div>
      ) : null}

      {showInput || isConfigured ? (
        <div className="adm-tone3000__credentials">
          <TextInput
            id="adm-tone3000-key"
            type="password"
            labelText="Tone3000 API key"
            value={apiKey}
            placeholder={isConfigured ? '••••••••••••••••' : 'Paste API key'}
            onChange={(e) => setApiKey(e.currentTarget.value)}
            size="sm"
          />
          <div className="adm-tone3000__cred-actions">
            <Button kind="primary" size="sm" renderIcon={CheckmarkFilled}
              disabled={!apiKey.trim() || setApiKeyMutation.isPending}
              onClick={() => { if (apiKey.trim()) setApiKeyMutation.mutate(apiKey.trim()) }}>
              Save
            </Button>
            {showInput && !isConfigured
              ? <Button kind="ghost" size="sm" onClick={() => { setShowInput(false); setApiKey('') }}>Cancel</Button>
              : null}
          </div>
        </div>
      ) : null}

      {testMutation.data ? (
        <InlineNotification
          kind={testMutation.data.authenticated ? 'success' : 'error'}
          lowContrast hideCloseButton
          title={testMutation.data.authenticated ? 'Authentication successful' : 'Authentication failed'}
          subtitle={testMutation.data.message ?? undefined}
        />
      ) : null}
    </div>
  )
}

// ─── IR / NAM Source Grid ─────────────────────────────────────────────────────

const SOURCE_TYPE_ICONS: Record<string, CarbonIconType> = {
  conners: Waveform, voxengo: Waveform, samplicity: Waveform, signaltonoize: Waveform,
  echothief: Waveform, lexicon: Waveform, djammincabs: VolumeUp, overdriven: VolumeUp,
  nam_github: MachineLearningModel, tone3000: MachineLearningModel,
  sfzinstruments: Music, musical_artifacts: Music, freepats: Music,
}

interface ContentSourceGridProps {
  sources: Array<{ name: string; displayName: string; description: string; license: string; count: number }>
  isLibraryLoading: boolean
  unitLabel: string
  onDownloadSource: (name: string) => void
  onDownloadAll: () => void
  isDownloading: boolean
  isStarting: boolean
  selectedSources: string[]
  onToggleSource: (name: string) => void
}

function ContentSourceGrid({
  sources, isLibraryLoading, unitLabel, onDownloadSource, onDownloadAll,
  isDownloading, isStarting, selectedSources, onToggleSource,
}: ContentSourceGridProps) {
  return (
    <div className="adm-source-grid__wrap">
      <div className="adm-source-grid__toolbar">
        <Tag type="cool-gray">{sources.length} sources</Tag>
        <div className="adm-source-grid__toolbar-actions">
          <Button kind="primary" size="sm" renderIcon={Download}
            disabled={isDownloading || isStarting}
            onClick={onDownloadAll}>
            {isStarting ? 'Starting…' : `Download all ${unitLabel}`}
          </Button>
          {selectedSources.length > 0 && selectedSources.length < sources.length ? (
            <Button kind="secondary" size="sm" renderIcon={Download}
              disabled={isDownloading || isStarting}
              onClick={() => onDownloadSource(selectedSources[0])}>
              Download selected ({selectedSources.length})
            </Button>
          ) : null}
        </div>
      </div>

      <div className="adm-source-grid">
        {sources.map((source) => {
          const Icon = SOURCE_TYPE_ICONS[source.name] ?? Waveform
          const isSelected = selectedSources.includes(source.name)
          return (
            <Tile key={source.name} className={`adm-source-tile${isSelected ? ' adm-source-tile--selected' : ''}`}>
              <div className="adm-source-tile__header">
                <Checkbox
                  id={`adm-source-${source.name}`}
                  labelText=""
                  checked={isSelected}
                  onChange={() => onToggleSource(source.name)}
                />
                <div className="adm-source-tile__icon-name">
                  <Icon size={18} aria-hidden="true" />
                  <span className="adm-source-tile__name">{source.displayName}</span>
                </div>
                <Tag type="blue" size="sm">{source.license}</Tag>
              </div>
              <p className="adm-source-tile__desc">{source.description}</p>
              <div className="adm-source-tile__footer">
                <span className="adm-source-tile__count">
                  {isLibraryLoading ? 'Checking…' : source.count > 0 ? `${source.count} ${unitLabel}` : `0 ${unitLabel}`}
                </span>
                <Button kind="ghost" size="sm"
                  disabled={isDownloading || isStarting}
                  onClick={() => onDownloadSource(source.name)}>
                  Download
                </Button>
              </div>
            </Tile>
          )
        })}
      </div>
    </div>
  )
}

// ─── Tab Content ──────────────────────────────────────────────────────────────

function PluginPacksTab({ nodeId }: { nodeId: string | null }) {
  const [packs, setPacks] = useState<PluginPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [packConfirm, setPackConfirm] = useState<{ action: 'disable' | 'uninstall'; pack: PluginPack } | null>(null)

  const loadPacks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(withNodeQuery('/api/plugin-packages/list', nodeId))
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json() as { packs?: PluginPack[] }
      setPacks(data.packs ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load plugin packs')
    } finally {
      setLoading(false)
    }
  }, [nodeId])

  useEffect(() => { void loadPacks() }, [loadPacks])

  const pollStatus = useCallback((packId: string) => {
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(withNodeQuery(`/api/plugin-packages/${packId}/status`, nodeId))
        const data = await res.json() as { status: PluginPack['status']; error_message?: string | null }
        setPacks((prev) => prev.map((p) => p.id === packId ? { ...p, status: data.status, error_message: data.error_message } : p))
        if (!['installing', 'uninstalling', 'disabling', 'enabling'].includes(data.status)) {
          window.clearInterval(interval)
        }
      } catch { window.clearInterval(interval) }
    }, 2000)
    window.setTimeout(() => window.clearInterval(interval), 300000)
  }, [nodeId])

  const doAction = useCallback(async (packId: string, action: string, pendingStatus: PluginPack['status']) => {
    await fetch(withNodeQuery(`/api/plugin-packages/${packId}/${action}`, nodeId), { method: 'POST' })
    setPacks((prev) => prev.map((p) => p.id === packId ? { ...p, status: pendingStatus } : p))
    pollStatus(packId)
  }, [nodeId, pollStatus])

  if (loading) return <div className="adm-tab-loading"><InlineLoading description="Loading plugin packs…" /></div>

  if (error) return (
    <InlineNotification kind="error" lowContrast hideCloseButton
      title="Plugin pack catalog unavailable" subtitle={error} />
  )

  const categories = [...new Set(packs.map((p) => p.category))].sort()

  return (
    <div className="adm-plugin-packs">
      <div className="adm-plugin-packs__header">
        <Tag type="cool-gray">{packs.length} packs</Tag>
        <Tag type="green">{packs.filter((p) => p.status === 'installed').length} installed</Tag>
        <Button kind="ghost" size="sm" renderIcon={Renew} iconDescription="Refresh" hasIconOnly onClick={() => void loadPacks()} />
      </div>

      {categories.map((cat) => (
        <div key={cat} className="adm-plugin-packs__category">
          <h3 className="adm-plugin-packs__category-title">{cat}</h3>
          <Accordion align="start">
            {packs.filter((p) => p.category === cat).map((pack) => {
              const tag = packStatusTag(pack.status)
              const transitional = ['installing', 'uninstalling', 'disabling', 'enabling'].includes(pack.status)
              return (
                <AccordionItem
                  key={pack.id}
                  title={(
                    <div className="adm-pack-title">
                      <span>{pack.name}</span>
                      <div className="adm-pack-title__tags">
                        <Tag type={tag.type}>{tag.label}</Tag>
                        <Tag type="purple">{pack.plugin_count} plugins</Tag>
                        <Tag type="blue">{pack.size_estimate}</Tag>
                      </div>
                    </div>
                  )}
                >
                  <div className="adm-pack-body">
                    <p className="adm-pack-body__desc">{pack.description}</p>
                    {pack.error_message ? <Tag type="red">{pack.error_message}</Tag> : null}
                    <div className="adm-pack-body__actions">
                      {transitional ? (
                        <InlineLoading description={`${tag.label}…`} />
                      ) : pack.status === 'disabled' ? (
                        <Button size="sm" kind="primary" renderIcon={View}
                          onClick={() => void doAction(pack.id, 'enable', 'enabling')}>
                          Enable
                        </Button>
                      ) : pack.status === 'installed' ? (
                        <>
                          <Button size="sm" kind="tertiary" renderIcon={ViewOff}
                            onClick={() => setPackConfirm({ action: 'disable', pack })}>
                            Disable
                          </Button>
                          {pack.can_uninstall !== false ? (
                            <Button size="sm" kind="danger--tertiary" renderIcon={Reset}
                              onClick={() => setPackConfirm({ action: 'uninstall', pack })}>
                              Uninstall
                            </Button>
                          ) : null}
                        </>
                      ) : pack.can_install !== false ? (
                        <Button size="sm" kind="primary" renderIcon={Download}
                          onClick={() => void doAction(pack.id, 'install', 'installing')}>
                          Install
                        </Button>
                      ) : (
                        <Tag type="warm-gray">Not available from package manager</Tag>
                      )}
                    </div>
                  </div>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      ))}

      {/* Confirm modal (inline — separate from outer modal) */}
      {packConfirm ? (
        <div className="adm-pack-confirm">
          <InlineNotification
            kind={packConfirm.action === 'uninstall' ? 'error' : 'warning'}
            lowContrast
            hideCloseButton
            title={packConfirm.action === 'disable' ? `Disable ${packConfirm.pack.name}?` : `Uninstall ${packConfirm.pack.name}?`}
            subtitle={packConfirm.action === 'disable'
              ? 'Pack will be disabled without removing files.'
              : 'Pack and its managed plugins will be removed from this node.'}
          />
          <div className="adm-pack-confirm__actions">
            <Button kind={packConfirm.action === 'uninstall' ? 'danger' : 'primary'} size="sm"
              onClick={() => {
                void doAction(
                  packConfirm.pack.id,
                  packConfirm.action === 'disable' ? 'disable' : 'uninstall',
                  packConfirm.action === 'disable' ? 'disabling' : 'uninstalling',
                )
                setPackConfirm(null)
              }}>
              Confirm
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setPackConfirm(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function IRDownloadTab({ type }: { type: 'nam' | 'cabinet-irs' | 'reverb-irs' }) {
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const downloadHook = useDownloadProgress()
  const { startDownload, isDownloading, isStarting } = downloadHook

  const librariesQuery = useQuery({
    queryKey: ['ir', 'libraries'],
    queryFn: irLibraryApi.getLibraries,
  })

  const sourceFilter = type === 'nam'
    ? ['nam_github', 'tone3000']
    : type === 'cabinet-irs'
      ? ['djammincabs', 'overdriven']
      : ['conners', 'voxengo', 'samplicity', 'signaltonoize', 'echothief', 'lexicon']

  const sources = LIBRARY_SOURCES
    .filter((s) => sourceFilter.includes(s.name))
    .map((source) => {
      const apiData = librariesQuery.data?.libraries?.find((l) => l.name === source.name)
      return { ...source, count: apiData?.count ?? 0, license: apiData?.license ?? source.license }
    })

  const unitLabel = type === 'nam' ? 'models' : 'IRs'

  const toggleSource = useCallback((name: string) => {
    setSelectedSources((prev) => prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name])
  }, [])

  const handleDownloadSource = useCallback((sourceName: string) => {
    startDownload({ sources: [sourceName], parallel: 4, skip_existing: true })
  }, [startDownload])

  const handleDownloadAll = useCallback(() => {
    startDownload({ sources: sourceFilter, parallel: 4, skip_existing: true })
  }, [startDownload, sourceFilter])

  return (
    <div className="adm-ir-tab">
      {type === 'nam' ? <Tone3000Section downloadHook={downloadHook} /> : null}

      <ContentSourceGrid
        sources={sources}
        isLibraryLoading={librariesQuery.isLoading}
        unitLabel={unitLabel}
        onDownloadSource={handleDownloadSource}
        onDownloadAll={handleDownloadAll}
        isDownloading={isDownloading}
        isStarting={isStarting}
        selectedSources={selectedSources}
        onToggleSource={toggleSource}
      />

      <DownloadProgressPanel hook={downloadHook} label={type === 'nam' ? 'NAM' : type === 'cabinet-irs' ? 'Cabinet IR' : 'Reverb IR'} />
    </div>
  )
}

function SoundFontTab() {
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const downloadHook = useSoundFontDownloadProgress()
  const { startDownload, isDownloading, isStarting } = downloadHook

  const librariesQuery = useQuery({
    queryKey: ['soundfonts', 'libraries'],
    queryFn: soundfontApi.getLibraries,
  })

  const sources = SOUNDFONT_SOURCES.map((source) => {
    const apiData = (librariesQuery.data as any)?.libraries?.find((l: any) => l.name === source.name)
    return { ...source, count: apiData?.count ?? 0, license: apiData?.license ?? source.license }
  })

  const toggleSource = useCallback((name: string) => {
    setSelectedSources((prev) => prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name])
  }, [])

  return (
    <div className="adm-sf-tab">
      <ContentSourceGrid
        sources={sources}
        isLibraryLoading={librariesQuery.isLoading}
        unitLabel="SoundFonts"
        onDownloadSource={(name) => startDownload({ sources: [name], parallel: 4, skip_existing: true })}
        onDownloadAll={() => startDownload({ parallel: 4, skip_existing: true })}
        isDownloading={isDownloading}
        isStarting={isStarting}
        selectedSources={selectedSources}
        onToggleSource={toggleSource}
      />

      <DownloadProgressPanel hook={downloadHook} label="SoundFont" />
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface ArtifactDownloadModalProps {
  open?: boolean
  onClose?: () => void
  initialTab?: TabId
  nodeId: string | null
  surface?: 'embedded' | 'modal'
}

export function ArtifactDownloadModal({
  open = true,
  onClose,
  initialTab = 'plugin-packs',
  nodeId,
  surface = 'embedded',
}: ArtifactDownloadModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  useEffect(() => {
    if (open) setActiveTab(initialTab)
  }, [open, initialTab])

  const tabContent = (
    <>
      <div className="adm-tabs" role="tablist" aria-label="Artifact download categories">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`adm-tab${isActive ? ' adm-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      <Layer className="adm-tab-content">
        {activeTab === 'plugin-packs' ? <PluginPacksTab nodeId={nodeId} /> : null}
        {activeTab === 'nam' ? <IRDownloadTab type="nam" /> : null}
        {activeTab === 'cabinet-irs' ? <IRDownloadTab type="cabinet-irs" /> : null}
        {activeTab === 'reverb-irs' ? <IRDownloadTab type="reverb-irs" /> : null}
        {activeTab === 'soundfonts' ? <SoundFontTab /> : null}
      </Layer>
    </>
  )

  if (surface === 'embedded') {
    return (
      <section className="adm-embedded" aria-label="Artifact discovery workspace">
        <div className="adm-embedded__header">
          <div className="adm-embedded__copy">
            <p className="adm-embedded__eyebrow">Artifacts discovery</p>
            <h2 className="adm-embedded__title">Download &amp; Discover</h2>
            <p className="adm-embedded__desc">
              Browse plugin packs, NAM libraries, impulse-response sources, and SoundFont catalogs without leaving the integrated artifacts workspace.
            </p>
          </div>
          {onClose ? (
            <Button kind="ghost" size="sm" onClick={onClose}>
              Return to library
            </Button>
          ) : null}
        </div>

        <div className="adm-embedded__frame">
          {tabContent}
        </div>
      </section>
    )
  }

  return (
    <ComposedModal
      open={open}
      onClose={onClose ?? (() => undefined)}
      size="lg"
      className="adm-modal"
    >
      <ModalHeader title="Download &amp; Discover" label="Audio Artifacts" />
      <ModalBody className="adm-modal__body" hasScrollingContent>
        {tabContent}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose ?? (() => undefined)}>Close</Button>
      </ModalFooter>
    </ComposedModal>
  )
}
