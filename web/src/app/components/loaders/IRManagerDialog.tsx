import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { Renew, VolumeUp, Waveform } from '@carbon/icons-react'
import { irApi } from '../../../map2/api'
import type { IRsResponse, IRStatus } from '../../../map2/types'
import { getPluginIdentityKeyFromParts } from '../../../map2/utils/pluginIdentity'
import { AssetUploadButton } from './AssetUploadButton'
import { useToasts } from '../Toasts'
import './ModelManagerDialogs.css'

export type IRType = 'cabinet' | 'reverb'

const IR_PLUGIN_URIS: Record<IRType, string> = {
  cabinet: 'map2://juce/convolution/cabinet',
  reverb: 'map2://juce/convolution/reverb',
}

interface IRTypeConfig {
  title: string
  description: string
  searchPlaceholder: string
  emptyMessage: string
  loadingMessage: string
  defaultLabel: string
  icon: typeof VolumeUp
  listQueryFn: () => Promise<IRsResponse>
  loadFn: (name: string, instanceId?: number, pluginPosition?: number) => Promise<unknown>
  uploadFn: (file: File) => Promise<unknown>
  queryKey: string
  loadedKey: keyof IRStatus
}

const IR_CONFIGS: Record<IRType, IRTypeConfig> = {
  cabinet: {
    title: 'Cabinet impulse responses',
    description: 'Load speaker cabinet IRs for authentic amp-in-the-room tone.',
    searchPlaceholder: 'Search cabinets',
    emptyMessage: 'No cabinet IRs found. Upload WAV files to get started.',
    loadingMessage: 'Loading cabinet IRs',
    defaultLabel: 'Cabinet IR',
    icon: VolumeUp,
    listQueryFn: irApi.listCabinets,
    loadFn: (name, instanceId, pluginPosition) => (
      typeof instanceId === 'number' && instanceId > 0
        ? irApi.loadCabinetToInstance(name, instanceId)
        : typeof pluginPosition === 'number' && pluginPosition >= 0
          ? irApi.loadCabinetAtPosition(name, pluginPosition)
        : irApi.loadCabinet(name)
    ),
    uploadFn: irApi.uploadCabinet,
    queryKey: 'cabinets',
    loadedKey: 'loaded_cabinet',
  },
  reverb: {
    title: 'Reverb impulse responses',
    description: 'Load reverb IRs for realistic room and space simulation.',
    searchPlaceholder: 'Search reverbs',
    emptyMessage: 'No reverb IRs found. Upload WAV files to get started.',
    loadingMessage: 'Loading reverb IRs',
    defaultLabel: 'Reverb IR',
    icon: Waveform,
    listQueryFn: irApi.listReverbs,
    loadFn: (name, instanceId, pluginPosition) => (
      typeof instanceId === 'number' && instanceId > 0
        ? irApi.loadReverbToInstance(name, instanceId)
        : typeof pluginPosition === 'number' && pluginPosition >= 0
          ? irApi.loadReverbAtPosition(name, pluginPosition)
        : irApi.loadReverb(name)
    ),
    uploadFn: irApi.uploadReverb,
    queryKey: 'reverbs',
    loadedKey: 'loaded_reverb',
  },
}

interface Props {
  type: IRType
  open: boolean
  onClose: () => void
  onLoad?: (irName: string) => void
  instanceId?: number
  pluginPosition?: number
}

function formatMeta(duration?: number, size?: number, sampleRate?: number, fallback?: string): string {
  const base = duration
    ? `${(duration * 1000).toFixed(0)} ms`
    : size
      ? `${(size / 1024).toFixed(0)} KB`
      : fallback || '-'

  return sampleRate ? `${base} @ ${(sampleRate / 1000).toFixed(1)} kHz` : base
}

export function IRManagerDialog({ type, open, onClose, onLoad, instanceId, pluginPosition }: Props) {
  const config = IR_CONFIGS[type]
  const Icon = config.icon

  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined
  const statusScopeKey = getPluginIdentityKeyFromParts(IR_PLUGIN_URIS[type], resolvedPluginPosition, instanceId)

  const irsQuery = useQuery<IRsResponse>({
    queryKey: ['ir', config.queryKey],
    queryFn: config.listQueryFn,
    enabled: open,
  })

  const statusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status', type, statusScopeKey],
    queryFn: () => irApi.getTypeStatus(type, {
      instanceId,
      pluginPosition: resolvedPluginPosition,
    }),
    enabled: open,
  })

  const loadMutation = useMutation({
    mutationFn: (name: string) => config.loadFn(name, instanceId, resolvedPluginPosition),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      pushToast(`Loaded ${type} IR: ${name}`, 'success')
      onLoad?.(name)
    },
    onError: () => pushToast(`Failed to load ${type} IR`, 'error'),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true)
      return config.uploadFn(file)
    },
    onSuccess: async (data: { filename?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      const uploadedName = data.filename
      pushToast(`Uploaded: ${uploadedName || 'IR file'}`, 'success')
      if (uploadedName) {
        try {
          await loadMutation.mutateAsync(uploadedName)
        } catch {
          // loadMutation surfaces its own error toast
        }
      }
    },
    onError: () => pushToast(`Failed to upload ${type} IR`, 'error'),
    onSettled: () => setUploading(false),
  })

  const irs = irsQuery.data?.irs ?? []
  const loadedIR = useMemo(() => {
    const status = statusQuery.data
    if (!status) {
      return undefined
    }
    const preferredValue = status[config.loadedKey]
    if (typeof preferredValue === 'string' && preferredValue.length > 0) {
      return preferredValue
    }
    const activeKey = config.loadedKey === 'loaded_cabinet' ? 'active_cabinet' : 'active_reverb'
    const fallbackValue = (status as IRStatus & { active_cabinet?: string; active_reverb?: string })[activeKey]
    return typeof fallbackValue === 'string' && fallbackValue.length > 0 ? fallbackValue : undefined
  }, [config.loadedKey, statusQuery.data])
  const normalizedSearch = search.trim().toLowerCase()
  const filteredIRs = irs.filter((ir) => ir.name.toLowerCase().includes(normalizedSearch))

  const handleRefresh = () => {
    void irsQuery.refetch()
    void statusQuery.refetch()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading={config.title}
      modalLabel="Asset library"
      primaryButtonText="Close"
      secondaryButtonText="Refresh"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      onSecondarySubmit={handleRefresh}
      selectorPrimaryFocus="#ir-manager-search"
    >
      <div className="model-manager-dialog">
        <div className="model-manager-dialog__header">
          <div className="model-manager-dialog__title-row">
            <Icon size={20} aria-hidden="true" />
            <p>{config.description}</p>
          </div>
          <div className="model-manager-dialog__toolbar">
            <Search
              id="ir-manager-search"
              labelText="Search"
              placeholder={config.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              size="md"
            />
            <AssetUploadButton
              kind="ghost"
              size="md"
              ariaLabel={`Upload ${type} IR file`}
              label={uploading ? 'Uploading...' : 'Upload WAV'}
              accept={['.wav']}
              onChange={handleFileChange}
              disabled={uploading}
            />
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              iconDescription="Refresh IR list"
              renderIcon={Renew}
              onClick={handleRefresh}
              disabled={irsQuery.isFetching}
            />
          </div>
        </div>
        {loadedIR && (
          <Tag type="green" title="Active IR" size="md">
            Active: {loadedIR}
          </Tag>
        )}

        {irsQuery.isLoading ? (
          <InlineLoading description={config.loadingMessage} status="active" />
        ) : irsQuery.isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Unable to load IR list"
            subtitle={`The ${type} IR query failed. Refresh and try again.`}
          />
        ) : filteredIRs.length === 0 ? (
          <p className="model-manager-dialog__empty">{config.emptyMessage}</p>
        ) : (
          <TableContainer className="model-manager-dialog__table-wrap">
            <Table size="sm" useZebraStyles={false}>
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Details</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredIRs.map((ir) => {
                  const isActive = ir.name === loadedIR
                  const isLoading = loadMutation.isPending && loadMutation.variables === ir.name

                  return (
                    <TableRow key={ir.name}>
                      <TableCell>{ir.name}</TableCell>
                      <TableCell>{formatMeta(ir.duration, ir.size, ir.sample_rate, config.defaultLabel)}</TableCell>
                      <TableCell>
                        {isActive ? (
                          <Tag type="green" size="sm">
                            Active
                          </Tag>
                        ) : (
                          <Tag type="cool-gray" size="sm">
                            Available
                          </Tag>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          kind="tertiary"
                          size="sm"
                          disabled={isActive || loadMutation.isPending}
                          onClick={() => loadMutation.mutate(ir.name)}
                        >
                          {isLoading ? 'Loading...' : 'Load'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <p className="model-manager-dialog__support-note">Supported format: WAV files (44.1 kHz or 48 kHz).</p>
      </div>
    </Modal>
  )
}

export function CabinetIRManagerDialog({
  open,
  onClose,
  onLoadCabinetIR,
  instanceId,
  pluginPosition,
}: {
  open: boolean
  onClose: () => void
  onLoadCabinetIR?: (irName: string) => void
  instanceId?: number
  pluginPosition?: number
}) {
  return (
    <IRManagerDialog
      type="cabinet"
      open={open}
      onClose={onClose}
      onLoad={onLoadCabinetIR}
      instanceId={instanceId}
      pluginPosition={pluginPosition}
    />
  )
}

export function ReverbIRManagerDialog({
  open,
  onClose,
  onLoadReverbIR,
  instanceId,
  pluginPosition,
}: {
  open: boolean
  onClose: () => void
  onLoadReverbIR?: (irName: string) => void
  instanceId?: number
  pluginPosition?: number
}) {
  return (
    <IRManagerDialog
      type="reverb"
      open={open}
      onClose={onClose}
      onLoad={onLoadReverbIR}
      instanceId={instanceId}
      pluginPosition={pluginPosition}
    />
  )
}
