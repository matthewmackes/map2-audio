import { useRef, useState } from 'react'
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
import { Renew, Upload, VolumeUp, Waveform } from '@carbon/icons-react'
import { irApi } from '../../../map2/api'
import type { IRsResponse, IRStatus } from '../../../map2/types'
import { useToasts } from '../Toasts'
import './ModelManagerDialogs.css'

export type IRType = 'cabinet' | 'reverb'

interface IRTypeConfig {
  title: string
  description: string
  searchPlaceholder: string
  emptyMessage: string
  loadingMessage: string
  defaultLabel: string
  icon: typeof VolumeUp
  listQueryFn: () => Promise<IRsResponse>
  loadFn: (name: string) => Promise<unknown>
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
    loadFn: irApi.loadCabinet,
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
    loadFn: irApi.loadReverb,
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
}

function formatMeta(duration?: number, size?: number, sampleRate?: number, fallback?: string): string {
  const base = duration
    ? `${(duration * 1000).toFixed(0)} ms`
    : size
      ? `${(size / 1024).toFixed(0)} KB`
      : fallback || '-'

  return sampleRate ? `${base} @ ${(sampleRate / 1000).toFixed(1)} kHz` : base
}

export function IRManagerDialog({ type, open, onClose, onLoad }: Props) {
  const config = IR_CONFIGS[type]
  const Icon = config.icon

  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const irsQuery = useQuery<IRsResponse>({
    queryKey: ['ir', config.queryKey],
    queryFn: config.listQueryFn,
    enabled: open,
  })

  const statusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status'],
    queryFn: () => irApi.getStatus(),
    enabled: open,
  })

  const loadMutation = useMutation({
    mutationFn: config.loadFn,
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
    onSuccess: (data: { filename?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      pushToast(`Uploaded: ${data.filename || 'IR file'}`, 'success')
    },
    onError: () => pushToast(`Failed to upload ${type} IR`, 'error'),
    onSettled: () => setUploading(false),
  })

  const irs = irsQuery.data?.irs ?? []
  const loadedIR = statusQuery.data?.[config.loadedKey] as string | undefined
  const normalizedSearch = search.trim().toLowerCase()
  const filteredIRs = irs.filter((ir) => ir.name.toLowerCase().includes(normalizedSearch))

  const handleRefresh = () => {
    void irsQuery.refetch()
    void statusQuery.refetch()
  }

  const handleUpload = () => {
    fileInputRef.current?.click()
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
            <Button
              kind="ghost"
              size="md"
              renderIcon={Upload}
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload WAV'}
            </Button>
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

        <input
          ref={fileInputRef}
          type="file"
          accept=".wav"
          onChange={handleFileChange}
          className="model-manager-dialog__hidden-file-input"
        />

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
}: {
  open: boolean
  onClose: () => void
  onLoadCabinetIR?: (irName: string) => void
}) {
  return <IRManagerDialog type="cabinet" open={open} onClose={onClose} onLoad={onLoadCabinetIR} />
}

export function ReverbIRManagerDialog({
  open,
  onClose,
  onLoadReverbIR,
}: {
  open: boolean
  onClose: () => void
  onLoadReverbIR?: (irName: string) => void
}) {
  return <IRManagerDialog type="reverb" open={open} onClose={onClose} onLoad={onLoadReverbIR} />
}
