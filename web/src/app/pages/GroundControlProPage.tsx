import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Accordion,
  AccordionItem,
  Button,
  CodeSnippet,
  Column,
  ComposedModal,
  DataTable,
  FileUploaderDropContainer,
  FileUploaderItem,
  Grid,
  InlineLoading,
  InlineNotification,
  Layer,
  ModalBody,
  ModalFooter,
  ModalHeader,
  NumberInput,
  ProgressBar,
  Select,
  SelectItem,
  StructuredListBody,
  StructuredListCell,
  StructuredListRow,
  StructuredListWrapper,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
  Toggle,
} from '@carbon/react'
import { ArrowRight, Code, Download, Save, Send, Upload } from '@carbon/icons-react'

import { EmptyState } from '../components/shared/EmptyState'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import { DeviceContextBanner } from '../components/DeviceContext'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import groundControlProApi, {
  type GroundControlArtifact,
  type GroundControlDiffResponse,
  type GroundControlFieldMapResponse,
  type GroundControlJobResponse,
  type GroundControlModel,
  type GroundControlPortsResponse,
  type GroundControlSessionResponse,
  type GroundControlValidationReport,
} from '../../map2/groundControlProApi'
import './GroundControlProPage.css'

const PRESET_AREA_OFFSET = 166

function cloneModel(model: GroundControlModel): GroundControlModel {
  return JSON.parse(JSON.stringify(model)) as GroundControlModel
}

function validationIsClean(validation: GroundControlValidationReport | null): boolean {
  if (!validation) return false
  return (
    validation.errors.length === 0
    && validation.exact_size_ok
    && validation.preamble_ok
    && validation.terminator_ok
    && validation.offsets_ok
    && validation.field_ranges_ok
    && validation.unknown_bytes_preserved
    && validation.round_trip_identity
  )
}

function confidenceTagType(confidence: string): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  if (confidence === 'confirmed') return 'green'
  if (confidence === 'unknown_reserved') return 'red'
  return 'warm-gray'
}

function boolToByte(value: boolean): number {
  return value ? 1 : 0
}

function downloadBlob(content: BlobPart, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function renderConfidenceTag(confidence: string) {
  return (
    <Tag type={confidenceTagType(confidence)} size="sm">
      {confidence}
    </Tag>
  )
}

type EditablePresetArrayKey =
  | 'device_program_banks_raw'
  | 'pedal_definitions'
  | 'pedal_device_assignments'
  | 'gcx_loop_states'
  | 'gcx_toggles'
  | 'instant_access_state'

export function GroundControlProPage() {
  const [ports, setPorts] = useState<GroundControlPortsResponse | null>(null)
  const [fieldMap, setFieldMap] = useState<GroundControlFieldMapResponse | null>(null)
  const [session, setSession] = useState<GroundControlSessionResponse | null>(null)
  const [draftModel, setDraftModel] = useState<GroundControlModel | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'error' | 'info' | 'success' | 'warning'; title: string; subtitle: string } | null>(null)
  const [tabIndex, setTabIndex] = useState(0)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const [presetSearch, setPresetSearch] = useState('')
  const deferredPresetSearch = useDeferredValue(presetSearch)
  const [latestValidation, setLatestValidation] = useState<GroundControlValidationReport | null>(null)
  const [latestCompiledArtifact, setLatestCompiledArtifact] = useState<GroundControlArtifact | null>(null)
  const [latestJob, setLatestJob] = useState<GroundControlJobResponse | null>(null)
  const [latestDiff, setLatestDiff] = useState<GroundControlDiffResponse | null>(null)
  const [sourceArtifactPreview, setSourceArtifactPreview] = useState<string>('')
  const [compiledArtifactPreview, setCompiledArtifactPreview] = useState<string>('')
  const [pushModalOpen, setPushModalOpen] = useState(false)
  const [inputPortIndex, setInputPortIndex] = useState<number | undefined>(undefined)
  const [outputPortIndex, setOutputPortIndex] = useState<number | undefined>(undefined)

  const { location: deviceLocation } = useDeviceLocation('ground-control-pro')

  useEffect(() => {
    let cancelled = false

    async function loadPorts(showErrorNotice: boolean) {
      try {
        const nextPorts = await groundControlProApi.getPorts()
        if (cancelled) return
        setPorts(nextPorts)
        if (nextPorts.recommended_input_index !== undefined && nextPorts.recommended_input_index !== null) {
          setInputPortIndex((current) => current ?? nextPorts.recommended_input_index ?? undefined)
        }
        if (nextPorts.recommended_output_index !== undefined && nextPorts.recommended_output_index !== null) {
          setOutputPortIndex((current) => current ?? nextPorts.recommended_output_index ?? undefined)
        }
      } catch (error) {
        if (!showErrorNotice || cancelled) return
        setNotice({
          kind: 'error',
          title: 'Failed to load Ground Control Pro metadata',
          subtitle: error instanceof Error ? error.message : String(error),
        })
      }
    }

    async function loadFieldMap() {
      try {
        const nextFieldMap = await groundControlProApi.getFieldMap()
        if (cancelled) return
        setFieldMap(nextFieldMap)
      } catch (error) {
        if (cancelled) return
        setNotice({
          kind: 'error',
          title: 'Failed to load Ground Control Pro metadata',
          subtitle: error instanceof Error ? error.message : String(error),
        })
      }
    }

    void (async () => {
      await Promise.all([
        loadPorts(true),
        loadFieldMap(),
      ])
    })()

    const pollHandle = window.setInterval(() => {
      void loadPorts(false)
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(pollHandle)
    }
  }, [])

  useEffect(() => {
    if (!session?.summary.source_artifact_id) return
    void (async () => {
      try {
        const artifact = await groundControlProApi.getArtifact(session.summary.source_artifact_id)
        if (artifact.content_preview) {
          const bytes = Uint8Array.from(atob(artifact.content_preview), (value) => value.charCodeAt(0))
          setSourceArtifactPreview(Array.from(bytes.slice(0, 256)).map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' '))
        }
      } catch {
        setSourceArtifactPreview('')
      }
    })()
  }, [session?.summary.source_artifact_id])

  useEffect(() => {
    if (!latestCompiledArtifact?.artifact_id) return
    void (async () => {
      try {
        const artifact = await groundControlProApi.getArtifact(latestCompiledArtifact.artifact_id)
        if (artifact.content_preview) {
          const bytes = Uint8Array.from(atob(artifact.content_preview), (value) => value.charCodeAt(0))
          setCompiledArtifactPreview(Array.from(bytes.slice(0, 256)).map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join(' '))
        }
      } catch {
        setCompiledArtifactPreview('')
      }
    })()
  }, [latestCompiledArtifact?.artifact_id])

  const filteredPresets = useMemo(() => {
    if (!draftModel) return []
    const needle = deferredPresetSearch.trim().toUpperCase()
    if (!needle) return draftModel.presets
    return draftModel.presets.filter((preset) => preset.name.toUpperCase().includes(needle))
  }, [deferredPresetSearch, draftModel])

  const selectedPreset = draftModel?.presets[selectedPresetIndex] ?? null
  const daemonStatus = ports?.daemon_status ?? null
  const daemonTagType: 'green' | 'blue' | 'red' | 'warm-gray' = daemonStatus?.state === 'connected'
    ? 'green'
    : daemonStatus?.state === 'repushing'
      ? 'blue'
      : daemonStatus?.state === 'error'
        ? 'red'
        : 'warm-gray'
  const pushReady = Boolean(
    session
    && draftModel
    && latestCompiledArtifact
    && validationIsClean(latestValidation)
    && session.summary.backup_artifact_id,
  )

  const handleAddFiles = async (
    _event: React.SyntheticEvent<HTMLElement>,
    content: { addedFiles: Array<File & { invalidFileType?: boolean }> },
  ) => {
    const file = content.addedFiles[0]
    if (!file) return
    setSelectedFile(file)
    setLoading(true)
    setNotice(null)
    try {
      const imported = await groundControlProApi.importDump(file)
      setSession(imported)
      setDraftModel(cloneModel(imported.model))
      setLatestValidation(imported.validation)
      setLatestCompiledArtifact(null)
      setLatestDiff(null)
      setSelectedPresetIndex(0)
      setNotice({
        kind: 'success',
        title: 'Dump imported',
        subtitle: `${file.name} parsed as ${imported.profile_id} with ${imported.summary.preset_count} presets.`,
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Import failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleCompile() {
    if (!session || !draftModel) return
    setLoading(true)
    try {
      const result = await groundControlProApi.compileSession(session.session_id, draftModel)
      setLatestValidation(result.validation)
      setLatestCompiledArtifact(result.artifact)
      const nextSession = await groundControlProApi.getSession(session.session_id)
      setSession(nextSession)
      setDraftModel(cloneModel(nextSession.model))
      setNotice({
        kind: 'success',
        title: 'Compilation complete',
        subtitle: result.validation.errors.length === 0 ? 'Validation passed and compiled artifact archived.' : 'Compilation finished with validation findings.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Compile failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleBackup() {
    setLoading(true)
    try {
      const job = await groundControlProApi.backup({
        input_port_index: inputPortIndex,
        create_session: true,
        timeout_seconds: 30,
      })
      setLatestJob(job)
      const resultSession = job.result.session as GroundControlSessionResponse | undefined
      if (resultSession) {
        setSession(resultSession)
        setDraftModel(cloneModel(resultSession.model))
        setLatestValidation(resultSession.validation)
      }
      setNotice({
        kind: 'success',
        title: 'Backup captured',
        subtitle: 'The captured backup has been validated and archived.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Backup failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleExportJson() {
    if (!session || !draftModel) return
    try {
      const result = await groundControlProApi.exportJson(session.session_id, draftModel)
      downloadBlob(JSON.stringify(result.json, null, 2), 'ground-control-pro.json', 'application/json')
      setNotice({
        kind: 'success',
        title: 'JSON exported',
        subtitle: 'Structured session model exported for review.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'JSON export failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function handleExportYaml() {
    if (!session || !draftModel) return
    try {
      const result = await groundControlProApi.exportYaml(session.session_id, draftModel)
      downloadBlob(result.yaml, 'ground-control-pro.yml', 'text/yaml')
      setNotice({
        kind: 'success',
        title: 'YAML exported',
        subtitle: 'Structured session model exported as YAML.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'YAML export failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function handlePush() {
    if (!session || !draftModel) return
    setPushModalOpen(false)
    setLoading(true)
    try {
      const job = await groundControlProApi.push({
        session_id: session.session_id,
        model: draftModel,
        output_port_index: outputPortIndex,
        inter_message_delay_ms: 0,
        force: false,
      })
      setLatestJob(job)
      setNotice({
        kind: 'success',
        title: 'Transmit complete',
        subtitle: 'The compiled payload was validated, archived, and transmitted.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Transmit failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    if (!latestCompiledArtifact) return
    setLoading(true)
    try {
      const job = await groundControlProApi.redumpVerify({
        compiled_artifact_id: latestCompiledArtifact.artifact_id,
        input_port_index: inputPortIndex,
        timeout_seconds: 30,
      })
      setLatestJob(job)
      const diff = job.result.diff as GroundControlDiffResponse | undefined
      if (diff) setLatestDiff(diff)
      setNotice({
        kind: 'success',
        title: 'Verification capture complete',
        subtitle: job.result.match ? 'Re-dump matches the compiled bytes.' : 'Re-dump differs from the compiled bytes; inspect the diff table.',
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Verification failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleDiff() {
    if (!session?.summary.source_artifact_id || !latestCompiledArtifact?.artifact_id) return
    try {
      const diff = await groundControlProApi.diff({
        left_artifact_id: session.summary.source_artifact_id,
        right_artifact_id: latestCompiledArtifact.artifact_id,
      })
      setLatestDiff(diff)
      setNotice({
        kind: 'info',
        title: 'Diff generated',
        subtitle: `${diff.changed_count} byte changes mapped against the field descriptors.`,
      })
    } catch (error) {
      setNotice({
        kind: 'error',
        title: 'Diff failed',
        subtitle: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function updateDevice(index: number, patch: Partial<GroundControlModel['global_config']['devices'][number]>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.devices[index] = { ...next.global_config.devices[index], ...patch }
      return next
    })
  }

  function updateMidiSettings(patch: Partial<GroundControlModel['global_config']['midi']>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.midi = { ...next.global_config.midi, ...patch }
      return next
    })
  }

  function updatePedal(index: number, patch: Partial<GroundControlModel['global_config']['pedals'][number]>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.pedals[index] = { ...next.global_config.pedals[index], ...patch }
      return next
    })
  }

  function updateUtility(patch: Partial<GroundControlModel['global_config']['utility']>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.utility = { ...next.global_config.utility, ...patch }
      return next
    })
  }

  function updateGCX(patch: Partial<GroundControlModel['global_config']['gcx']>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.gcx = { ...next.global_config.gcx, ...patch }
      return next
    })
  }

  function updateGCXSwitchType(index: number, value: number) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.gcx.switch_types[index] = value
      return next
    })
  }

  function updateInstantAccess(index: number, patch: Partial<GroundControlModel['global_config']['instant_access'][number]>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.global_config.instant_access[index] = { ...next.global_config.instant_access[index], ...patch }
      return next
    })
  }

  function updatePreset(index: number, patch: Partial<GroundControlModel['presets'][number]>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.presets[index] = { ...next.presets[index], ...patch }
      return next
    })
  }

  function updatePresetDeviceProgramChange(presetIndex: number, changeIndex: number, patch: Partial<GroundControlModel['presets'][number]['device_program_changes'][number]>) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      next.presets[presetIndex].device_program_changes[changeIndex] = {
        ...next.presets[presetIndex].device_program_changes[changeIndex],
        ...patch,
      }
      return next
    })
  }

  function updatePresetArrayValue(presetIndex: number, key: EditablePresetArrayKey, valueIndex: number, value: number) {
    setDraftModel((current) => {
      if (!current) return current
      const next = cloneModel(current)
      const target = next.presets[presetIndex][key] as number[]
      target[valueIndex] = value
      return next
    })
  }

  const presetRows = filteredPresets.map((preset) => ({
    id: String(preset.index),
    index: preset.index,
    name: preset.name || `Preset ${preset.index}`,
    changed: latestValidation?.changed_offsets.some((offset) => offset >= (PRESET_AREA_OFFSET + (preset.index * 82)) && offset < (PRESET_AREA_OFFSET + ((preset.index + 1) * 82))) ? 'Changed' : 'Baseline',
  }))

  useSetShellWindow({
    title: 'Ground Control Pro',
    subtitle: 'Forensic-grade SysEx import, validation, editing, backup, and transmit workflow for Voodoo Lab Ground Control Pro.',
    kicker: 'Platform / Ground Control Pro',
    actions: [
      { id: 'backup', label: 'Backup', icon: Download, onClick: () => { void handleBackup() } },
      { id: 'compile', label: 'Compile', icon: Save, onClick: () => { void handleCompile() }, disabled: !session || !draftModel },
      { id: 'push', label: 'Push', icon: Send, onClick: () => setPushModalOpen(true), disabled: !pushReady },
    ],
  }, [handleBackup, handleCompile, session, draftModel, pushReady])

  return (
    <section className="ground-control-pro-page">
      <Layer className="ground-control-pro-page__surface">
        <div className="ground-control-pro-page__content">
          <DeviceContextBanner deviceName="Ground Control Pro" deviceKey="ground-control-pro" />

          {notice ? (
            <InlineNotification
              kind={notice.kind}
              lowContrast
              hideCloseButton
              title={notice.title}
              subtitle={notice.subtitle}
            />
          ) : null}

          {daemonStatus?.notification ? (
            <InlineNotification
              kind={daemonStatus.notification.severity === 'warning' ? 'warning' : daemonStatus.notification.severity === 'error' ? 'error' : 'info'}
              lowContrast
              hideCloseButton
              title={daemonStatus.notification.title}
              subtitle={daemonStatus.notification.subtitle}
            />
          ) : null}

          {loading ? <InlineLoading description="Processing Ground Control Pro request" status="active" /> : null}

          <Tile className="ground-control-pro-page__hero-tile">
            <Grid condensed fullWidth>
              <Column lg={10} md={4} sm={4}>
                <div className="ground-control-pro-page__hero-copy">
                  <p className="ground-control-pro-page__eyebrow">Labs MIDI workflow</p>
                  <h2>Bulk dump only, byte-accurate by default</h2>
                  <p>
                    This route treats the Ground Control Pro as a full-memory SysEx device first. Unknown-reserved bytes are preserved exactly,
                    round-trip validation is mandatory, and transmit stays gated until a fresh backup exists.
                  </p>
                  <div className="ground-control-pro-page__tag-row">
                    <Tag type="green">Carbon-first</Tag>
                    <Tag type="warm-gray">Full-memory SysEx</Tag>
                    <Tag type="cool-gray">{fieldMap?.unknown_byte_count ?? 0} unknown bytes</Tag>
                    {daemonStatus ? <Tag type={daemonTagType}>{daemonStatus.state.replace('_', ' ')}</Tag> : null}
                    {deviceLocation ? <Tag type="blue">On {deviceLocation.hostname}</Tag> : <Tag type="warm-gray">Hardware not detected</Tag>}
                  </div>
                </div>
              </Column>
              <Column lg={6} md={4} sm={4}>
                <div className="ground-control-pro-page__hero-actions">
                  <FileUploaderDropContainer
                    accept={['.syx']}
                    labelText="Drop a Ground Control Pro .syx dump here or click to browse"
                    multiple={false}
                    onAddFiles={handleAddFiles}
                  />
                  {selectedFile ? <FileUploaderItem name={selectedFile.name} status="edit" uuid={`gcp-${selectedFile.name}`} /> : null}
                  <div className="ground-control-pro-page__port-grid">
                    <Select
                      id="ground-control-pro-midi-in"
                      labelText="MIDI In"
                      value={inputPortIndex !== undefined ? String(inputPortIndex) : ''}
                      onChange={(event) => setInputPortIndex(event.target.value === '' ? undefined : Number(event.target.value))}
                    >
                      <SelectItem value="" text="Select MIDI input" />
                      {(ports?.inputs ?? []).map((port) => (
                        <SelectItem key={port.index} value={String(port.index)} text={`${port.index}: ${port.name}`} />
                      ))}
                    </Select>
                    <Select
                      id="ground-control-pro-midi-out"
                      labelText="MIDI Out"
                      value={outputPortIndex !== undefined ? String(outputPortIndex) : ''}
                      onChange={(event) => setOutputPortIndex(event.target.value === '' ? undefined : Number(event.target.value))}
                    >
                      <SelectItem value="" text="Select MIDI output" />
                      {(ports?.outputs ?? []).map((port) => (
                        <SelectItem key={port.index} value={String(port.index)} text={`${port.index}: ${port.name}`} />
                      ))}
                    </Select>
                  </div>
                  {latestJob ? (
                    <ProgressBar
                      label="Latest job"
                      value={Math.round(latestJob.progress * 100)}
                      helperText={`${latestJob.job_type} · ${latestJob.status}`}
                    />
                  ) : null}
                </div>
              </Column>
            </Grid>
          </Tile>

          <Tabs selectedIndex={tabIndex} onChange={({ selectedIndex }) => setTabIndex(selectedIndex)}>
            <TabList aria-label="Ground Control Pro workspace tabs" contained>
              <Tab>Overview</Tab>
              <Tab>Configuration</Tab>
              <Tab>Presets</Tab>
              <Tab>Validation &amp; Transfer</Tab>
              <Tab>Forensics</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <div className="ground-control-pro-page__panel-grid">
                  <Tile>
                    <h3>Session Summary</h3>
                    <StructuredListWrapper aria-label="Ground Control Pro session summary">
                      <StructuredListBody>
                        <StructuredListRow>
                          <StructuredListCell>Profile</StructuredListCell>
                          <StructuredListCell>{session?.profile_id ?? 'No session loaded'}</StructuredListCell>
                        </StructuredListRow>
                        <StructuredListRow>
                          <StructuredListCell>Source</StructuredListCell>
                          <StructuredListCell>{session?.source_name ?? 'n/a'}</StructuredListCell>
                        </StructuredListRow>
                        <StructuredListRow>
                          <StructuredListCell>Preset count</StructuredListCell>
                          <StructuredListCell>{session?.summary.preset_count ?? 0}</StructuredListCell>
                        </StructuredListRow>
                        <StructuredListRow>
                          <StructuredListCell>Unknown bytes</StructuredListCell>
                          <StructuredListCell>{fieldMap?.unknown_byte_count ?? 0}</StructuredListCell>
                        </StructuredListRow>
                        <StructuredListRow>
                          <StructuredListCell>Backup freshness</StructuredListCell>
                          <StructuredListCell>{session?.summary.backup_artifact_id ? 'Fresh backup recorded' : 'No fresh backup yet'}</StructuredListCell>
                        </StructuredListRow>
                      </StructuredListBody>
                    </StructuredListWrapper>
                  </Tile>
                  <Tile>
                    <h3>Validation Posture</h3>
                    {latestValidation ? (
                      <div className="ground-control-pro-page__validation-stack">
                        <div className="ground-control-pro-page__tag-row">
                          <Tag type={latestValidation.exact_size_ok ? 'green' : 'red'}>Size</Tag>
                          <Tag type={latestValidation.preamble_ok ? 'green' : 'red'}>Preamble</Tag>
                          <Tag type={latestValidation.terminator_ok ? 'green' : 'red'}>Terminator</Tag>
                          <Tag type={latestValidation.unknown_bytes_preserved ? 'green' : 'red'}>Unknown bytes</Tag>
                          <Tag type={latestValidation.round_trip_identity ? 'green' : 'red'}>Round trip</Tag>
                        </div>
                        {latestValidation.errors.length > 0 ? (
                          <InlineNotification
                            kind="error"
                            lowContrast
                            hideCloseButton
                            title="Validation findings"
                            subtitle={latestValidation.errors.join(' | ')}
                          />
                        ) : (
                          <InlineNotification
                            kind="success"
                            lowContrast
                            hideCloseButton
                            title="Validation clean"
                            subtitle="This session currently passes the structural and preservation checks."
                          />
                        )}
                      </div>
                    ) : (
                      <EmptyState
                        title="No validation report yet"
                        description="Run validation to generate a structural and preservation report."
                        compact
                        align="left"
                      />
                    )}
                  </Tile>
                </div>
              </TabPanel>
              <TabPanel>
                {draftModel ? (
                  <div className="ground-control-pro-page__configuration-grid">
                    <Tile>
                      <div className="ground-control-pro-page__section-header">
                        <h3>Devices 1-8</h3>
                        <div className="ground-control-pro-page__tag-row">{renderConfidenceTag('inferred')}</div>
                      </div>
                      <div className="ground-control-pro-page__device-grid">
                        {draftModel.global_config.devices.map((device, index) => (
                          <Tile key={`device-${index}`} className="ground-control-pro-page__nested-tile">
                            <div className="ground-control-pro-page__section-header">
                              <h4>Device {index + 1}</h4>
                              {renderConfidenceTag(device.confidence)}
                            </div>
                            <TextInput
                              id={`gcp-device-name-${index}`}
                              labelText="Name"
                              value={device.name}
                              maxLength={8}
                              onChange={(event) => updateDevice(index, { name: event.target.value.toUpperCase() })}
                            />
                            <NumberInput
                              id={`gcp-device-channel-${index}`}
                              label="MIDI Channel"
                              value={device.midi_channel}
                              min={0}
                              max={16}
                              onChange={(_, { value }) => updateDevice(index, { midi_channel: Number(value) || 0 })}
                            />
                            <Select
                              id={`gcp-device-program-offset-${index}`}
                              labelText="Program Offset Mode"
                              value={String(device.program_offset_mode)}
                              onChange={(event) => updateDevice(index, { program_offset_mode: Number(event.target.value) })}
                            >
                              <SelectItem value="0" text="0..127" />
                              <SelectItem value="1" text="1..128" />
                            </Select>
                          </Tile>
                        ))}
                      </div>
                    </Tile>

                    <Tile>
                      <div className="ground-control-pro-page__section-header">
                        <h3>MIDI, GCX, Utility, Instant Access</h3>
                        <div className="ground-control-pro-page__tag-row">
                          {renderConfidenceTag(draftModel.global_config.midi.confidence)}
                          {renderConfidenceTag(draftModel.global_config.gcx.confidence)}
                        </div>
                      </div>
                      <div className="ground-control-pro-page__config-form-grid">
                        <Toggle
                          id="gcp-global-program"
                          labelText="Global Program"
                          toggled={draftModel.global_config.midi.global_program}
                          onToggle={(value) => updateMidiSettings({ global_program: value })}
                        />
                        <Toggle
                          id="gcp-respond-to-pc"
                          labelText="Respond to Program Change"
                          toggled={draftModel.global_config.midi.respond_to_program_change}
                          onToggle={(value) => updateMidiSettings({ respond_to_program_change: value })}
                        />
                        <NumberInput
                          id="gcp-program-change-receive-channel"
                          label="Program Change Receive Channel"
                          value={draftModel.global_config.midi.program_change_receive_channel}
                          min={0}
                          max={16}
                          onChange={(_, { value }) => updateMidiSettings({ program_change_receive_channel: Number(value) || 0 })}
                        />
                        <Select
                          id="gcp-link-mode"
                          labelText="Link Mode"
                          value={String(draftModel.global_config.midi.link_mode)}
                          onChange={(event) => updateMidiSettings({ link_mode: Number(event.target.value) })}
                        >
                          <SelectItem value="0" text="None" />
                          <SelectItem value="1" text="Master" />
                          <SelectItem value="2" text="Slave" />
                        </Select>
                        <NumberInput
                          id="gcp-directory-speed"
                          label="Directory Speed"
                          value={draftModel.global_config.utility.directory_speed}
                          min={0}
                          max={4}
                          onChange={(_, { value }) => updateUtility({ directory_speed: Number(value) || 0 })}
                        />
                        <Select
                          id="gcp-program-access-mode"
                          labelText="Program Access Mode"
                          value={String(draftModel.global_config.utility.program_access_mode)}
                          onChange={(event) => updateUtility({ program_access_mode: Number(event.target.value) })}
                        >
                          <SelectItem value="0" text="Preset" />
                          <SelectItem value="1" text="Bank" />
                        </Select>
                        <Toggle
                          id="gcp-vca-exists"
                          labelText="VCA Present"
                          toggled={Boolean(draftModel.global_config.gcx.vca_exists)}
                          onToggle={(value) => updateGCX({ vca_exists: boolToByte(value) })}
                        />
                        <NumberInput
                          id="gcp-num-gcx"
                          label="GCX Expanders"
                          value={draftModel.global_config.gcx.num_gcx}
                          min={0}
                          max={4}
                          onChange={(_, { value }) => updateGCX({ num_gcx: Number(value) || 0 })}
                        />
                      </div>
                      <div className="ground-control-pro-page__device-grid">
                        {draftModel.global_config.pedals.map((pedal, index) => (
                          <Tile key={`config-pedal-${index}`} className="ground-control-pro-page__nested-tile">
                            <div className="ground-control-pro-page__section-header">
                              <h4>Pedal {index + 1}</h4>
                              {renderConfidenceTag(pedal.confidence)}
                            </div>
                            <Toggle
                              id={`gcp-pedal-exists-${index}`}
                              labelText="Pedal Present"
                              toggled={Boolean(pedal.exists)}
                              onToggle={(value) => updatePedal(index, { exists: boolToByte(value) })}
                            />
                          </Tile>
                        ))}
                      </div>
                      <div className="ground-control-pro-page__section-header">
                        <h4>GCX Switch Types</h4>
                        {renderConfidenceTag(draftModel.global_config.gcx.confidence)}
                      </div>
                      <div className="ground-control-pro-page__instant-access-grid">
                        {draftModel.global_config.gcx.switch_types.map((value, index) => (
                          <NumberInput
                            key={`gcp-gcx-switch-type-${index}`}
                            id={`gcp-gcx-switch-type-${index}`}
                            label={`GCX ${Math.floor(index / 8) + 1} Switch ${index % 8 + 1}`}
                            value={value}
                            min={0}
                            max={127}
                            onChange={(_, payload) => updateGCXSwitchType(index, Number(payload.value) || 0)}
                          />
                        ))}
                      </div>
                      <div className="ground-control-pro-page__instant-access-grid">
                        {draftModel.global_config.instant_access.map((definition, index) => (
                          <Tile key={`ia-${index}`} className="ground-control-pro-page__nested-tile">
                            <div className="ground-control-pro-page__section-header">
                              <h4>Instant Access {index + 1}</h4>
                              {renderConfidenceTag(definition.confidence)}
                            </div>
                            <NumberInput
                              id={`gcp-ia-function-${index}`}
                              label="Function"
                              value={definition.function}
                              min={0}
                              max={127}
                              onChange={(_, { value }) => setDraftModel((current) => {
                                if (!current) return current
                                const next = cloneModel(current)
                                next.global_config.instant_access[index].function = Number(value) || 0
                                return next
                              })}
                            />
                            <NumberInput
                              id={`gcp-ia-detail-${index}`}
                              label="Detail"
                              value={definition.detail}
                              min={0}
                              max={127}
                              onChange={(_, { value }) => updateInstantAccess(index, { detail: Number(value) || 0 })}
                            />
                            <Toggle
                              id={`gcp-ia-transmit-cc-${index}`}
                              labelText="Transmit CC"
                              toggled={Boolean(definition.transmit_cc)}
                              onToggle={(value) => updateInstantAccess(index, { transmit_cc: boolToByte(value) })}
                            />
                            <Select
                              id={`gcp-ia-switch-type-${index}`}
                              labelText="Switch Type"
                              value={String(definition.switch_type)}
                              onChange={(event) => updateInstantAccess(index, { switch_type: Number(event.target.value) })}
                            >
                              <SelectItem value="0" text="Momentary" />
                              <SelectItem value="1" text="Latching" />
                            </Select>
                          </Tile>
                        ))}
                      </div>
                      <Tile className="ground-control-pro-page__nested-tile">
                        <div className="ground-control-pro-page__section-header">
                          <h4>Unknown / Reserved</h4>
                          {renderConfidenceTag('unknown_reserved')}
                        </div>
                        <StructuredListWrapper aria-label="Ground Control Pro reserved bytes">
                          <StructuredListBody>
                            {draftModel.global_config.devices.map((device, index) => (
                              <StructuredListRow key={`reserved-device-${index}`}>
                                <StructuredListCell>{`Device ${index + 1} definition_raw`}</StructuredListCell>
                                <StructuredListCell>{device.definition_raw}</StructuredListCell>
                              </StructuredListRow>
                            ))}
                            <StructuredListRow>
                              <StructuredListCell>Extended memory raw</StructuredListCell>
                              <StructuredListCell>{draftModel.global_config.utility.extended_memory_raw}</StructuredListCell>
                            </StructuredListRow>
                          </StructuredListBody>
                        </StructuredListWrapper>
                      </Tile>
                    </Tile>
                  </div>
                ) : (
                  <InlineNotification kind="info" lowContrast hideCloseButton title="No session loaded" subtitle="Import a .syx dump or capture a backup to edit the structured configuration." />
                )}
              </TabPanel>
              <TabPanel>
                {draftModel ? (
                  <div className="ground-control-pro-page__presets-layout">
                    <Tile>
                      <div className="ground-control-pro-page__section-header">
                        <h3>Preset Index</h3>
                        <TextInput
                          id="gcp-preset-search"
                          labelText="Search presets"
                          value={presetSearch}
                          onChange={(event) => setPresetSearch(event.target.value)}
                        />
                      </div>
                      <DataTable
                        rows={presetRows}
                        headers={[
                          { key: 'index', header: 'Preset' },
                          { key: 'name', header: 'Name' },
                          { key: 'changed', header: 'Status' },
                        ]}
                      >
                        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
                          <TableContainer {...getTableContainerProps()} title="Presets" className="ground-control-pro-page__table-container">
                            <Table {...getTableProps()}>
                              <TableHead>
                                <TableRow>
                                  {headers.map((header) => {
                                    const { key, ...headerProps } = getHeaderProps({ header })
                                    return (
                                      <TableHeader key={key} {...headerProps}>
                                        {header.header}
                                      </TableHeader>
                                    )
                                  })}
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {rows.map((row) => {
                                  const { key, ...rowProps } = getRowProps({ row })
                                  return (
                                    <TableRow
                                      key={key}
                                      {...rowProps}
                                      onClick={() => setSelectedPresetIndex(Number(row.id))}
                                      className={Number(row.id) === selectedPresetIndex ? 'ground-control-pro-page__selected-row' : ''}
                                    >
                                      {row.cells.map((cell) => (
                                        <TableCell key={cell.id}>{cell.value as React.ReactNode}</TableCell>
                                      ))}
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </DataTable>
                    </Tile>
                    <Tile>
                      {selectedPreset ? (
                        <>
                          <div className="ground-control-pro-page__section-header">
                            <h3>Preset {selectedPreset.index}</h3>
                            {renderConfidenceTag(selectedPreset.confidence)}
                          </div>
                          <TextInput
                            id="gcp-selected-preset-name"
                            labelText="Preset Name"
                            value={selectedPreset.name}
                            maxLength={10}
                            onChange={(event) => updatePreset(selectedPreset.index, { name: event.target.value.toUpperCase() })}
                          />
                          <div className="ground-control-pro-page__device-program-grid">
                            {selectedPreset.device_program_changes.map((change, index) => (
                              <Tile key={`preset-change-${index}`} className="ground-control-pro-page__nested-tile">
                                <div className="ground-control-pro-page__section-header">
                                  <h4>Device {index + 1}</h4>
                                  {renderConfidenceTag(change.confidence)}
                                </div>
                                <Toggle
                                  id={`gcp-preset-enabled-${index}`}
                                  labelText="Enabled"
                                  toggled={Boolean(change.enabled)}
                                  onToggle={(value) => updatePresetDeviceProgramChange(selectedPreset.index, index, { enabled: boolToByte(value) })}
                                />
                                <NumberInput
                                  id={`gcp-preset-program-${index}`}
                                  label="Program"
                                  value={change.program}
                                  min={0}
                                  max={127}
                                  onChange={(_, { value }) => updatePresetDeviceProgramChange(selectedPreset.index, index, { program: Number(value) || 0 })}
                                />
                              </Tile>
                            ))}
                          </div>
                          <div className="ground-control-pro-page__section-header">
                            <h4>Pedals</h4>
                            {renderConfidenceTag(selectedPreset.confidence)}
                          </div>
                          <div className="ground-control-pro-page__device-grid">
                            {selectedPreset.pedal_definitions.map((value, index) => (
                              <Tile key={`preset-pedal-${index}`} className="ground-control-pro-page__nested-tile">
                                <NumberInput
                                  id={`gcp-preset-pedal-definition-${index}`}
                                  label={`Pedal ${index + 1} Definition`}
                                  value={value}
                                  min={0}
                                  max={127}
                                  onChange={(_, { value: nextValue }) => updatePresetArrayValue(selectedPreset.index, 'pedal_definitions', index, Number(nextValue) || 0)}
                                />
                                <NumberInput
                                  id={`gcp-preset-pedal-device-assignment-${index}`}
                                  label={`Pedal ${index + 1} Device Assignment`}
                                  value={selectedPreset.pedal_device_assignments[index]}
                                  min={0}
                                  max={127}
                                  onChange={(_, { value: nextValue }) => updatePresetArrayValue(selectedPreset.index, 'pedal_device_assignments', index, Number(nextValue) || 0)}
                                />
                              </Tile>
                            ))}
                          </div>
                          <div className="ground-control-pro-page__section-header">
                            <h4>GCX Loop States</h4>
                            {renderConfidenceTag(selectedPreset.confidence)}
                          </div>
                          <div className="ground-control-pro-page__instant-access-grid">
                            {selectedPreset.gcx_loop_states.map((value, index) => (
                              <Toggle
                                key={`gcp-preset-gcx-loop-${index}`}
                                id={`gcp-preset-gcx-loop-${index}`}
                                labelText={`GCX ${Math.floor(index / 8) + 1} Loop ${index % 8 + 1}`}
                                toggled={Boolean(value)}
                                onToggle={(enabled) => updatePresetArrayValue(selectedPreset.index, 'gcx_loop_states', index, boolToByte(enabled))}
                              />
                            ))}
                          </div>
                          <div className="ground-control-pro-page__section-header">
                            <h4>GCX Toggles &amp; Instant Access State</h4>
                            {renderConfidenceTag(selectedPreset.confidence)}
                          </div>
                          <div className="ground-control-pro-page__device-grid">
                            {selectedPreset.gcx_toggles.map((value, index) => (
                              <Toggle
                                key={`gcp-preset-gcx-toggle-${index}`}
                                id={`gcp-preset-gcx-toggle-${index}`}
                                labelText={`GCX ${index + 1} Toggle`}
                                toggled={Boolean(value)}
                                onToggle={(enabled) => updatePresetArrayValue(selectedPreset.index, 'gcx_toggles', index, boolToByte(enabled))}
                              />
                            ))}
                            {selectedPreset.instant_access_state.map((value, index) => (
                              <Toggle
                                key={`gcp-preset-ia-state-${index}`}
                                id={`gcp-preset-ia-state-${index}`}
                                labelText={`IA ${index + 1} State`}
                                toggled={Boolean(value)}
                                onToggle={(enabled) => updatePresetArrayValue(selectedPreset.index, 'instant_access_state', index, boolToByte(enabled))}
                              />
                            ))}
                          </div>
                          <Tile className="ground-control-pro-page__nested-tile">
                            <div className="ground-control-pro-page__section-header">
                              <h4>Reserved Bank Bytes</h4>
                              {renderConfidenceTag('unknown_reserved')}
                            </div>
                            <div className="ground-control-pro-page__device-grid">
                              {selectedPreset.device_program_banks_raw.map((value, index) => (
                                <TextInput
                                  key={`gcp-preset-bank-raw-${index}`}
                                  id={`gcp-preset-bank-raw-${index}`}
                                  labelText={`Device ${index + 1} Bank Raw`}
                                  readOnly
                                  value={String(value)}
                                />
                              ))}
                            </div>
                          </Tile>
                        </>
                      ) : (
                        <p>Select a preset to edit.</p>
                      )}
                    </Tile>
                  </div>
                ) : (
                  <InlineNotification kind="info" lowContrast hideCloseButton title="No session loaded" subtitle="Load a dump to inspect the 200-preset table and the per-preset device program changes." />
                )}
              </TabPanel>
              <TabPanel>
                <div className="ground-control-pro-page__panel-grid">
                  <Tile>
                    <div className="ground-control-pro-page__section-header">
                      <h3>Compile &amp; Export</h3>
                      <div className="ground-control-pro-page__header-actions">
                        <Button kind="secondary" renderIcon={Save} onClick={() => void handleCompile()} disabled={!session || !draftModel}>
                          Compile
                        </Button>
                        <Button kind="secondary" renderIcon={Download} onClick={() => void handleExportJson()} disabled={!session || !draftModel}>
                          Export JSON
                        </Button>
                        <Button kind="secondary" renderIcon={Download} onClick={() => void handleExportYaml()} disabled={!session || !draftModel}>
                          Export YAML
                        </Button>
                      </div>
                    </div>
                    {latestValidation ? (
                      <StructuredListWrapper aria-label="Ground Control Pro validation summary">
                        <StructuredListBody>
                          <StructuredListRow>
                            <StructuredListCell>Round-trip identity</StructuredListCell>
                            <StructuredListCell>{latestValidation.round_trip_identity ? 'Pass' : 'Fail'}</StructuredListCell>
                          </StructuredListRow>
                          <StructuredListRow>
                            <StructuredListCell>Unknown bytes preserved</StructuredListCell>
                            <StructuredListCell>{latestValidation.unknown_bytes_preserved ? 'Pass' : 'Fail'}</StructuredListCell>
                          </StructuredListRow>
                          <StructuredListRow>
                            <StructuredListCell>Changed offsets</StructuredListCell>
                            <StructuredListCell>{latestValidation.changed_offsets.length}</StructuredListCell>
                          </StructuredListRow>
                        </StructuredListBody>
                      </StructuredListWrapper>
                    ) : (
                      <EmptyState
                        title="No compile report yet"
                        description="Compile the current session to generate a transfer-ready report."
                        compact
                        align="left"
                      />
                    )}
                  </Tile>
                  <Tile>
                    <div className="ground-control-pro-page__section-header">
                      <h3>Transfer</h3>
                      <div className="ground-control-pro-page__tag-row">
                        <Tag type={pushReady ? 'green' : 'red'}>{pushReady ? 'Push enabled' : 'Push gated'}</Tag>
                      </div>
                    </div>
                    <p className="ground-control-pro-page__copy-block">
                      Backup first, place the Ground Control Pro into <strong>RECEIVE MEM</strong>, then transmit the compiled payload. Use re-dump verification immediately after a write.
                    </p>
                    <div className="ground-control-pro-page__header-actions">
                      <Button kind="secondary" renderIcon={Upload} onClick={() => void handleBackup()}>
                        Capture Backup
                      </Button>
                      <Button kind="secondary" renderIcon={ArrowRight} onClick={() => void handleDiff()} disabled={!session?.summary.source_artifact_id || !latestCompiledArtifact}>
                        Diff Source vs Compiled
                      </Button>
                      <Button kind="secondary" renderIcon={Code} onClick={() => void handleVerify()} disabled={!latestCompiledArtifact}>
                        Re-dump Verify
                      </Button>
                    </div>
                    {latestJob ? (
                      <InlineNotification
                        kind={latestJob.status === 'failed' ? 'error' : latestJob.status === 'completed' ? 'success' : 'info'}
                        lowContrast
                        hideCloseButton
                        title={`Latest ${latestJob.job_type}`}
                        subtitle={latestJob.error || `${latestJob.status} · ${Math.round(latestJob.progress * 100)}%`}
                      />
                    ) : null}
                  </Tile>
                  <Tile>
                    <h3>Archived Artifacts</h3>
                    <TableContainer title="Artifacts">
                      <Table size="sm">
                        <TableHead>
                          <TableRow>
                            <TableHeader>Kind</TableHeader>
                            <TableHeader>Created</TableHeader>
                            <TableHeader>Size</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {(session?.artifacts ?? []).slice(-8).reverse().map((artifact) => (
                            <TableRow key={artifact.artifact_id}>
                              <TableCell>{artifact.kind}</TableCell>
                              <TableCell>{artifact.created_at}</TableCell>
                              <TableCell>{artifact.size_bytes}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Tile>
                </div>
              </TabPanel>
              <TabPanel>
                <div className="ground-control-pro-page__panel-grid">
                  <Tile>
                    <h3>Raw Hex Preview</h3>
                    <CodeSnippet type="multi" className="ground-control-pro-page__code-block">
                      {sourceArtifactPreview || 'Import a dump to see the source SysEx preview.'}
                    </CodeSnippet>
                    {compiledArtifactPreview ? (
                      <CodeSnippet type="multi" className="ground-control-pro-page__code-block">
                        {compiledArtifactPreview}
                      </CodeSnippet>
                    ) : null}
                  </Tile>
                  <Tile>
                    <h3>Byte Diff</h3>
                    {latestDiff ? (
                      <TableContainer title={`${latestDiff.left_label} → ${latestDiff.right_label}`}>
                        <Table size="sm">
                          <TableHead>
                            <TableRow>
                              <TableHeader>Offset</TableHeader>
                              <TableHeader>Before</TableHeader>
                              <TableHeader>After</TableHeader>
                              <TableHeader>Labels</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {latestDiff.changes.slice(0, 64).map((change) => (
                              <TableRow key={`${change.offset}`}>
                                <TableCell>{change.offset}</TableCell>
                                <TableCell>{change.left}</TableCell>
                                <TableCell>{change.right}</TableCell>
                                <TableCell>{change.labels.join(', ') || 'unknown'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <p>Generate a diff after compilation to inspect changed offsets.</p>
                    )}
                  </Tile>
                  <Tile>
                    <h3>Field Map &amp; Evidence</h3>
                    <Accordion align="start">
                      <AccordionItem title={`Source Documents (${fieldMap?.source_documents.length ?? 0})`}>
                        <ul className="ground-control-pro-page__source-list">
                          {(fieldMap?.source_documents ?? []).map((source) => (
                            <li key={source.url ?? source.title}>
                              <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                              {source.notes ? <p>{source.notes}</p> : null}
                            </li>
                          ))}
                        </ul>
                      </AccordionItem>
                      <AccordionItem title={`Field Templates (${fieldMap?.templates.length ?? 0})`}>
                        <CodeSnippet type="multi" className="ground-control-pro-page__code-block">
                          {JSON.stringify(fieldMap?.templates.slice(0, 24) ?? [], null, 2)}
                        </CodeSnippet>
                      </AccordionItem>
                    </Accordion>
                  </Tile>
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Layer>

      <ComposedModal open={pushModalOpen} onClose={() => setPushModalOpen(false)} size="sm">
        <ModalHeader title="Push compiled SysEx" label="Ground Control Pro" />
        <ModalBody>
          <p>Place the Ground Control Pro in <strong>RECEIVE MEM</strong> before continuing.</p>
          <p>The push action is still gated on a clean compile report and a fresh backup artifact.</p>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setPushModalOpen(false)}>
            Cancel
          </Button>
          <Button kind="primary" disabled={!pushReady} onClick={() => void handlePush()}>
            Transmit now
          </Button>
        </ModalFooter>
      </ComposedModal>
    </section>
  )
}

export default GroundControlProPage
