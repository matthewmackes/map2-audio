import { useState } from 'react'
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Tag,
  Tile,
} from '@carbon/react'
import {
  CaretDown,
  CaretUp,
  MachineLearningModel,
  Music,
  VolumeUp,
  Waveform,
} from '@carbon/icons-react'
import { useQuery } from '@tanstack/react-query'
import { irLibraryApi, soundfontApi } from '../../../map2/api'
import { useDownloadProgress } from '../../hooks/useDownloadProgress'
import { useSoundFontDownloadProgress } from '../../hooks/useSoundFontDownloadProgress'
import { LIBRARY_SOURCES, SOUNDFONT_SOURCES } from '../../types/library'
import { Tone3000Config } from './Tone3000Config'
import './LibrarySources.css'

const SOURCE_ICONS: Record<string, typeof Waveform> = {
  // Reverb IRs
  conners: Waveform,
  voxengo: Waveform,
  samplicity: Waveform,
  signaltonoize: Waveform,
  echothief: Waveform,
  lexicon: Waveform,
  // Cabinet IRs
  djammincabs: VolumeUp,
  overdriven: VolumeUp,
  // NAM Models
  nam_github: MachineLearningModel,
  tone3000: MachineLearningModel,
  // SoundFonts
  sfzinstruments: Music,
  musical_artifacts: Music,
  freepats: Music,
}

function renderAvailabilityLabel(count: number, isLoading: boolean, unitLabel: string) {
  if (count > 0) {
    return `${count} ${unitLabel}`
  }

  return isLoading ? 'Checking...' : `0 ${unitLabel}`
}

export function LibrarySources() {
  const [irExpanded, setIrExpanded] = useState(false)
  const [sfExpanded, setSfExpanded] = useState(false)
  const [downloadingSourceId, setDownloadingSourceId] = useState<string | null>(null)
  const { startDownload, isDownloading, isStarting, startError } = useDownloadProgress()
  const {
    startDownload: startSoundFontDownload,
    isDownloading: isSoundFontDownloading,
    startError: soundFontStartError,
  } = useSoundFontDownloadProgress()

  const allExpanded = irExpanded && sfExpanded

  const librariesQuery = useQuery({
    queryKey: ['ir', 'libraries'],
    queryFn: irLibraryApi.getLibraries,
  })

  const soundFontLibrariesQuery = useQuery({
    queryKey: ['soundfonts', 'libraries'],
    queryFn: soundfontApi.getLibraries,
  })

  const sourceGroups = LIBRARY_SOURCES.map((source) => {
    const apiData = librariesQuery.data?.libraries?.find((library) => library.name === source.name)

    return {
      ...source,
      count: apiData?.count ?? 0,
      license: apiData?.license ?? source.license,
    }
  })

  const soundFontSourceGroups = SOUNDFONT_SOURCES.map((source) => {
    const apiData = soundFontLibrariesQuery.data?.libraries?.find((library) => library.name === source.name)

    return {
      ...source,
      count: apiData?.count ?? 0,
      license: apiData?.license ?? source.license,
    }
  })

  const isSoundFontDownloadingAll = isSoundFontDownloading && downloadingSourceId === 'all'
  const isIrLibraryLoading = librariesQuery.isLoading || librariesQuery.isFetching
  const isSoundFontLibraryLoading = soundFontLibrariesQuery.isLoading || soundFontLibrariesQuery.isFetching

  const toggleAllSources = () => {
    const nextExpanded = !allExpanded
    setIrExpanded(nextExpanded)
    setSfExpanded(nextExpanded)
  }

  return (
    <section className="library-sources">
      <div className="library-sources__toggle-all">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={allExpanded ? CaretUp : CaretDown}
          iconDescription={allExpanded ? 'Collapse all source groups' : 'Expand all source groups'}
          onClick={toggleAllSources}
        >
          {allExpanded ? 'Hide all source groups' : 'Show all source groups'}
        </Button>
      </div>

      <Accordion align="start" className="library-sources__accordion">
        <AccordionItem
          className="library-sources__group"
          title="IR and NAM library sources"
          open={irExpanded}
          onHeadingClick={({ isOpen }) => setIrExpanded(!isOpen)}
        >
          <div className="library-sources__group-content">
            <div className="library-sources__group-toolbar">
              <Tag type="gray">{sourceGroups.length} sources</Tag>
              <Button
                kind="primary"
                size="sm"
                disabled={isStarting || isDownloading}
                onClick={() => {
                  startDownload({ parallel: 4, skip_existing: true })
                }}
              >
                Download all IR and NAM
              </Button>
              {isStarting ? <InlineLoading description="Starting download..." /> : null}
            </div>

            {startError ? (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Download failed"
                subtitle={startError instanceof Error ? startError.message : 'Unknown error'}
              />
            ) : null}

            <div className="library-sources__tone3000">
              <Tone3000Config />
            </div>

            <div className="library-sources__source-grid">
              {sourceGroups.map((source) => {
                const Icon = SOURCE_ICONS[source.name] ?? Waveform

                return (
                  <Tile key={source.name} className="library-sources__source-tile">
                    <div className="library-sources__source-header">
                      <div className="library-sources__source-title">
                        <Icon className="library-sources__source-icon" size={20} aria-hidden="true" />
                        <span>{source.displayName}</span>
                      </div>
                      <Tag type="blue">{source.license}</Tag>
                    </div>

                    <p className="library-sources__source-description">{source.description}</p>

                    <div className="library-sources__source-footer">
                      <span className="library-sources__source-count">
                        {renderAvailabilityLabel(source.count, isIrLibraryLoading, 'files available')}
                      </span>
                      <Button
                        kind="ghost"
                        size="sm"
                        disabled={isDownloading || isStarting}
                        onClick={() => {
                          startDownload({ sources: [source.name], parallel: 4, skip_existing: true })
                        }}
                      >
                        Download {source.displayName}
                      </Button>
                    </div>
                  </Tile>
                )
              })}
            </div>
          </div>
        </AccordionItem>

        <AccordionItem
          className="library-sources__group"
          title="SoundFont sources"
          open={sfExpanded}
          onHeadingClick={({ isOpen }) => setSfExpanded(!isOpen)}
        >
          <div className="library-sources__group-content">
            <div className="library-sources__group-toolbar">
              <Tag type="gray">{soundFontSourceGroups.length} sources</Tag>
              <Button
                kind="primary"
                size="sm"
                disabled={isSoundFontDownloading}
                onClick={() => {
                  setDownloadingSourceId('all')
                  startSoundFontDownload({ parallel: 4, skip_existing: true })
                }}
              >
                Download all SoundFonts
              </Button>
              {isSoundFontDownloadingAll ? <InlineLoading description="Starting SoundFont download..." /> : null}
            </div>

            {soundFontStartError ? (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="SoundFont download failed"
                subtitle={soundFontStartError instanceof Error ? soundFontStartError.message : 'Unknown error'}
              />
            ) : null}

            <div className="library-sources__source-grid">
              {soundFontSourceGroups.map((source) => {
                const Icon = SOURCE_ICONS[source.name] ?? Music
                const isDownloadingThisSource = isSoundFontDownloading && downloadingSourceId === source.name

                return (
                  <Tile key={source.name} className="library-sources__source-tile">
                    <div className="library-sources__source-header">
                      <div className="library-sources__source-title">
                        <Icon className="library-sources__source-icon" size={20} aria-hidden="true" />
                        <span>{source.displayName}</span>
                      </div>
                      <Tag type="blue">{source.license}</Tag>
                    </div>

                    <p className="library-sources__source-description">{source.description}</p>

                    <div className="library-sources__source-footer">
                      <span className="library-sources__source-count">
                        {renderAvailabilityLabel(source.count, isSoundFontLibraryLoading, 'SoundFonts')}
                      </span>
                      <Button
                        kind="ghost"
                        size="sm"
                        onClick={() => {
                          setDownloadingSourceId(source.name)
                          startSoundFontDownload({ sources: [source.name], parallel: 4, skip_existing: true })
                        }}
                      >
                        {isDownloadingThisSource ? 'Downloading...' : `Download ${source.displayName}`}
                      </Button>
                    </div>
                  </Tile>
                )
              })}
            </div>
          </div>
        </AccordionItem>
      </Accordion>
    </section>
  )
}
