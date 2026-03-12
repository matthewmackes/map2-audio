import { useState } from 'react'
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from '@carbon/react'
import {
  CheckmarkFilled,
  Copy,
  MachineLearningModel,
  Music,
  Renew,
  VolumeUp,
  Waveform,
} from '@carbon/icons-react'
import type { CarbonIconType } from '@carbon/icons-react'
import { useQuery } from '@tanstack/react-query'
import { foldersApi } from '../../map2/api'
import { DownloadManager } from '../components/library/DownloadManager'
import { InstalledBrowser } from '../components/library/InstalledBrowser'
import { LibrarySources } from '../components/library/LibrarySources'
import { UploadButton } from '../components/upload'
import { useCluster } from '../contexts/ClusterContext'
import { useDownloadProgress } from '../hooks/useDownloadProgress'
import './LibraryPage.css'

interface PathInfo {
  label: string
  path: string
  displayPath: string
  description: string
}

interface AssetOverviewRow {
  key: string
  assetType: string
  description: string
  formats: string
  usedBy: string
  usageNote: string
  icon: CarbonIconType
}

const ASSET_OVERVIEW_ROWS: AssetOverviewRow[] = [
  {
    key: 'cabinet-irs',
    assetType: 'Cabinet IRs',
    description: 'Guitar and bass cabinet impulse responses',
    formats: '.wav, .flac (44.1-96 kHz)',
    usedBy: 'ConvolutionProcessor',
    usageNote: 'Zero-latency IR',
    icon: VolumeUp,
  },
  {
    key: 'nam-models',
    assetType: 'NAM models',
    description: 'Neural Amp Modeler captures',
    formats: '.nam (JSON model files)',
    usedBy: 'NAMProcessor',
    usageNote: 'ML inference',
    icon: MachineLearningModel,
  },
  {
    key: 'reverb-irs',
    assetType: 'Reverb IRs',
    description: 'Room, hall, plate, and space impulses',
    formats: '.wav, .flac (stereo or mono)',
    usedBy: 'ConvolutionProcessor',
    usageNote: 'Space simulation',
    icon: Waveform,
  },
  {
    key: 'soundfonts',
    assetType: 'SoundFonts',
    description: 'Sampled instrument libraries',
    formats: '.sf2, .sfz (GM/GS compatible)',
    usedBy: 'Sfizz / FluidSynth',
    usageNote: 'MIDI instruments',
    icon: Music,
  },
]

export function LibraryPage() {
  const { activeNodeId, nodes, localNodeId, isClusterMode } = useCluster()
  const [pathsExpanded, setPathsExpanded] = useState(false)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const { status, isDownloading } = useDownloadProgress()

  const selectedNodeId = activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId
  const selectedNode = nodes.find((node) => node.nodeId === selectedNodeId)
  const remoteSelected = Boolean(selectedNodeId && selectedNodeId !== localNodeId)
  const displayNodeName = selectedNode?.isLocal ? `${selectedNode.hostname} (Local)` : selectedNode?.hostname ?? 'Local'
  const pathNodeId = activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId ? activeNodeId : null

  const pathsQuery = useQuery({
    queryKey: ['folders', 'display-paths', selectedNodeId],
    queryFn: () => foldersApi.getDisplayPaths(pathNodeId),
    staleTime: 60000,
  })

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(null), 2000)
    } catch (err) {
      console.error('Failed to copy path:', err)
    }
  }

  const paths: PathInfo[] = pathsQuery.data
    ? [
        {
          label: 'NAM models',
          path: pathsQuery.data.nam_models,
          displayPath: pathsQuery.data.nam_models_display,
          description: 'Neural amp model captures for NAM processing',
        },
        {
          label: 'Cabinet IRs',
          path: pathsQuery.data.ir_cabinets,
          displayPath: pathsQuery.data.ir_cabinets_display,
          description: 'Guitar and bass cabinet impulse responses',
        },
        {
          label: 'Reverb IRs',
          path: pathsQuery.data.ir_reverbs,
          displayPath: pathsQuery.data.ir_reverbs_display,
          description: 'Reverb impulse responses (.wav, .flac)',
        },
        {
          label: 'User uploads',
          path: pathsQuery.data.ir_user_uploads,
          displayPath: pathsQuery.data.ir_user_uploads?.replace(/^\/home\/[^/]+/, '~') || '',
          description: 'Custom imported impulse responses',
        },
      ]
    : []

  return (
    <div className="library-page">
      <div className="library-page__header">
        <div>
          <h1 className="library-page__title">Library</h1>
          <p className="library-page__subtitle">
            {remoteSelected
              ? `Download and manage IRs, NAM models, and SoundFonts on ${displayNodeName}`
              : 'Download and manage IRs, NAM models, and SoundFonts'}
          </p>
        </div>
        <UploadButton label="Upload assets" />
      </div>

      {isClusterMode ? (
        <Tile className="library-page__cluster-scope">
          <div className="library-page__cluster-scope-header">
            <span className="library-page__cluster-scope-label">Cluster library scope</span>
            <strong className="library-page__cluster-scope-node">
              {activeNodeId === 'all' ? 'All nodes comparison scope' : displayNodeName}
            </strong>
          </div>
          <p className="library-page__cluster-scope-description">
            {activeNodeId === 'all'
              ? 'Library browsing stays anchored to the local node when all nodes is selected. Availability badges and deploy actions still compare the full cluster.'
              : remoteSelected
                ? 'You are browsing a remote node through the cluster proxy. Availability badges show where each IR or NAM model already exists, and deploy can fill missing nodes.'
                : 'Availability badges show cluster coverage for IRs and NAM models. Expand an item to deploy it to missing nodes.'}
          </p>
          <div className="library-page__cluster-tags">
            {nodes.map((node) => (
              <Tag key={node.nodeId} type={selectedNodeId === node.nodeId ? 'green' : 'gray'}>
                {node.hostname}
              </Tag>
            ))}
          </div>
        </Tile>
      ) : null}

      <Tile className="library-page__overview">
        <h2 className="library-page__overview-title">Sound asset library</h2>
        <p className="library-page__overview-copy">
          High-quality impulse responses, neural amp models, and instrument samples are available for native DSP
          modules including ConvolutionProcessor and NAMProcessor.
        </p>

        <TableContainer className="library-page__table-container">
          <Table size="sm" className="library-page__asset-table">
            <TableHead>
              <TableRow>
                <TableHeader>Asset type</TableHeader>
                <TableHeader>Description</TableHeader>
                <TableHeader>Formats</TableHeader>
                <TableHeader className="library-page__table-cell--right">Used by</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {ASSET_OVERVIEW_ROWS.map((row) => {
                const Icon = row.icon

                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <span className="library-page__asset-type">
                        <Icon size={16} aria-hidden="true" />
                        {row.assetType}
                      </span>
                    </TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell>{row.formats}</TableCell>
                    <TableCell className="library-page__table-cell--right">
                      <span className="library-page__used-by-primary">{row.usedBy}</span>
                      <span className="library-page__used-by-secondary">{row.usageNote}</span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Accordion align="start" className="library-page__paths-accordion">
          <AccordionItem
            title="File locations"
            open={pathsExpanded}
            onHeadingClick={({ isOpen }) => setPathsExpanded(!isOpen)}
          >
            <div className="library-page__paths-header">
              <p className="library-page__paths-copy">
                Place files in these directories to use them in MAP2. Directories are detected automatically.
              </p>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Renew}
                onClick={() => {
                  void pathsQuery.refetch()
                }}
              >
                Refresh file locations
              </Button>
            </div>

            {pathsQuery.isLoading ? <InlineLoading description="Loading file locations..." /> : null}

            {pathsQuery.error ? (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Error loading file locations"
                subtitle="The backend did not return the current directory paths."
              />
            ) : null}

            {pathsQuery.isSuccess ? (
              <div className="library-page__path-list">
                {paths.map((pathInfo) => (
                  <div key={pathInfo.label} className="library-page__path-item">
                    <div className="library-page__path-details">
                      <div className="library-page__path-label-row">
                        <span className="library-page__path-label">{pathInfo.label}</span>
                        <span className="library-page__path-description">{pathInfo.description}</span>
                      </div>
                      <code className="library-page__path-code" title={pathInfo.path}>
                        {pathInfo.displayPath || pathInfo.path}
                      </code>
                    </div>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={copiedPath === pathInfo.path ? CheckmarkFilled : Copy}
                      iconDescription={`Copy path for ${pathInfo.label}`}
                      onClick={() => {
                        void handleCopyPath(pathInfo.path)
                      }}
                    >
                      {copiedPath === pathInfo.path ? 'Copied' : `Copy path for ${pathInfo.label}`}
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="library-page__paths-tip">Tip: These directories are also accessible through SMB share settings.</p>
          </AccordionItem>
        </Accordion>
      </Tile>

      <InstalledBrowser nodeId={activeNodeId} />

      {isDownloading || status?.stats ? <DownloadManager /> : null}

      <LibrarySources />
    </div>
  )
}
