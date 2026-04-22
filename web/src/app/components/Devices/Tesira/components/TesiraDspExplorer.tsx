import React, { useEffect, useMemo, useState } from 'react'
import { Button, InlineNotification, Tag, TextInput, Tile } from '@carbon/react'
import { TesiraDspProbeDialog } from './TesiraDspProbeDialog'
import { TesiraDspBlockPanel } from './TesiraDspBlockPanel'
import { useProbeTesiraDsp, useTesiraDspBlocks } from '../hooks/useTesiraApi'
import { EmptyState } from '../../../shared/EmptyState'
import { LoadingState } from '../../../shared/LoadingState'
import './TesiraCarbonChrome.css'

interface TesiraDspExplorerProps {
  deviceId: string
}

export function TesiraDspExplorer({ deviceId }: TesiraDspExplorerProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [probeOpen, setProbeOpen] = useState(false)
  const [search, setSearch] = useState('')

  const dspBlocks = useTesiraDspBlocks(deviceId)
  const probeMutation = useProbeTesiraDsp(deviceId)

  const blocks = dspBlocks.data ?? []
  const filteredBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return blocks
    return blocks.filter((block) =>
      block.instance_tag.toLowerCase().includes(needle) ||
      block.block_type.toLowerCase().includes(needle) ||
      String(block.title || '').toLowerCase().includes(needle) ||
      String(block.category || '').toLowerCase().includes(needle),
    )
  }, [blocks, search])

  useEffect(() => {
    if (!selectedTag && filteredBlocks.length > 0) {
      setSelectedTag(filteredBlocks[0].instance_tag)
    }
    if (selectedTag && !filteredBlocks.some((block) => block.instance_tag === selectedTag)) {
      setSelectedTag(filteredBlocks[0]?.instance_tag ?? null)
    }
  }, [filteredBlocks, selectedTag])

  const probe = async (maxInstances: number = 32) => {
    await probeMutation.mutateAsync(maxInstances)
    setProbeOpen(false)
    await dspBlocks.refetch()
  }

  return (
    <div className="tesira-dsp-explorer">
      <Tile className="tesira-dsp-explorer__tile">
        <div className="tesira-dsp-explorer__header">
          <div>
            <p className="tesira-dashboard__eyebrow">DSP explorer</p>
            <h3 className="tesira-dashboard__title">Inspect live Tesira blocks</h3>
            <p className="tesira-dashboard__summary">
              Filter the discovered runtime block list, probe for additional families, and hand off a selected block into the parameter editor.
            </p>
          </div>
          <div className="tesira-dsp-explorer__tags">
            <Tag type="cool-gray" size="sm">{blocks.length} blocks</Tag>
            <Tag type="warm-gray" size="sm">{filteredBlocks.length} visible</Tag>
          </div>
        </div>

        <div className="tesira-dsp-explorer__toolbar">
          <TextInput
            id={`tesira-dsp-search-${deviceId}`}
            labelText="Filter blocks"
            placeholder="Level, mixer, router, category..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button size="sm" kind="secondary" onClick={() => setProbeOpen(true)}>
            Probe
          </Button>
          <Button
            size="sm"
            kind="ghost"
            onClick={() => {
              dspBlocks.refetch().catch(() => undefined)
            }}
          >
            Refresh
          </Button>
        </div>

        {dspBlocks.error ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Failed to load DSP block list"
            subtitle={(dspBlocks.error as Error).message || 'The DSP block inventory could not be read.'}
          />
        ) : null}

        {probeMutation.isError ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Probe failed"
            subtitle={(probeMutation.error as Error).message || 'The runtime probe did not complete.'}
          />
        ) : null}

        {probeMutation.data?.errors?.length ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Probe completed with warnings"
            subtitle={`Warnings returned: ${probeMutation.data.errors.length}. Showing discovered blocks.`}
          />
        ) : null}

        {dspBlocks.isLoading ? (
          <div className="tesira-dsp-explorer__loading">
            <LoadingState description="Loading DSP blocks" />
          </div>
        ) : (
          <div className="tesira-dsp-explorer__table-wrap">
            <table className="tesira-quick-console__table" aria-label="Tesira DSP blocks">
              <thead>
                <tr>
                  <th scope="col">Instance Tag</th>
                  <th scope="col">Type</th>
                  <th scope="col">Family</th>
                  <th scope="col">Channels</th>
                  <th scope="col">Params</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredBlocks.map((block) => (
                  <tr
                    key={block.instance_tag}
                    className={selectedTag === block.instance_tag ? 'tesira-dsp-explorer__row tesira-dsp-explorer__row--selected' : 'tesira-dsp-explorer__row'}
                    onClick={() => setSelectedTag(block.instance_tag)}
                  >
                    <td>{block.instance_tag}</td>
                    <td>{block.title ? `${block.title} (${block.block_type})` : block.block_type}</td>
                    <td>{block.category || 'processing'}</td>
                    <td>{block.channel_count}</td>
                    <td>{Object.keys(block.parameter_map || {}).length}</td>
                    <td>
                      <Tag type={block.is_probed ? 'blue' : 'cool-gray'} size="sm">
                        {block.is_probed ? 'Probed' : 'Declared'}
                      </Tag>
                    </td>
                  </tr>
                ))}
                {filteredBlocks.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        className="tesira-presets-tab__empty"
                        title="No DSP blocks match this filter"
                        description="Adjust the search text or probe again to discover more blocks."
                        compact
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      {selectedTag ? (
        <TesiraDspBlockPanel deviceId={deviceId} instanceTag={selectedTag} />
      ) : null}

      <TesiraDspProbeDialog
        open={probeOpen}
        busy={probeMutation.isPending}
        onClose={() => setProbeOpen(false)}
        onProbe={probe}
      />
    </div>
  )
}
