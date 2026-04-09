import React, { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextInput, Tile } from '@carbon/react'
import '../../shared/ReactFlowTheme.css'
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { LandscapePrompt } from '@/app/components/shared/LandscapePrompt'
import {
  useCompileActiveTesiraDesign,
  useCompileAllTesiraDesigns,
  useCompileTesiraDesign,
  useCompileUncompiledTesiraDesigns,
  useCreateTesiraDesign,
  useDeleteTesiraDesign,
  useRecompileTesiraDesign,
  useTesiraDesign,
  useTesiraDesignDiagnostics,
  useTesiraDesignLibrary,
  useTesiraDesigns,
  useUpdateTesiraDesign,
  useValidateTesiraDesign,
} from '../hooks/useTesiraApi'
import './TesiraCarbonChrome.css'

interface TesiraDesignCanvasProps {
  deviceId: string
}

function graphFingerprint(graph: { nodes?: unknown[]; edges?: unknown[]; groups?: unknown[] } | null | undefined) {
  return JSON.stringify({
    nodes: graph?.nodes ?? [],
    edges: graph?.edges ?? [],
    groups: graph?.groups ?? [],
  })
}

function toFlowNode(node: any, index: number): Node {
  return {
    id: node.id,
    data: {
      label: node.label || node.block_type || node.id,
      block_type: node.block_type,
      instance_tag: node.instance_tag,
      io: node.io || { inputs: [], outputs: [] },
      config: node.config || {},
    },
    position: node.position || { x: 80 + index * 24, y: 80 + index * 24 },
    type: 'default',
  }
}

function toFlowEdge(edge: any, index: number): Edge {
  return {
    id: edge.id || `e_${index}_${edge.source}_${edge.target}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source_port,
    targetHandle: edge.target_port,
    animated: false,
    type: 'smoothstep',
  }
}

function compileStatusTag(status: string | null | undefined) {
  const value = status || 'UNCOMPILED'
  const normalized = value.toLowerCase()
  if (normalized.includes('compiled') || normalized.includes('success')) {
    return <Tag type="green" size="sm">{value}</Tag>
  }
  if (normalized.includes('fail') || normalized.includes('error')) {
    return <Tag type="red" size="sm">{value}</Tag>
  }
  return <Tag type="warm-gray" size="sm">{value}</Tag>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function TesiraDesignCanvas({ deviceId }: TesiraDesignCanvasProps) {
  const { data: designs, isLoading: designsLoading } = useTesiraDesigns(deviceId)
  const [libraryProfile, setLibraryProfile] = useState<string>('forte_ci_v1')
  const { data: library } = useTesiraDesignLibrary(deviceId, libraryProfile)
  const createDesign = useCreateTesiraDesign()
  const updateDesign = useUpdateTesiraDesign()
  const deleteDesign = useDeleteTesiraDesign()
  const validateDesign = useValidateTesiraDesign()
  const compileDesign = useCompileTesiraDesign()
  const recompileDesign = useRecompileTesiraDesign()
  const compileActive = useCompileActiveTesiraDesign()
  const compileAll = useCompileAllTesiraDesigns()
  const compileUncompiled = useCompileUncompiledTesiraDesigns()

  const [selectedDesignId, setSelectedDesignId] = useState<string>('')
  const [newDesignName, setNewDesignName] = useState<string>('New Tesira Design')
  const [blockType, setBlockType] = useState<string>('')
  const [optimizeCompile, setOptimizeCompile] = useState<boolean>(true)
  const [compileSummary, setCompileSummary] = useState<string>('')

  const selectedDesignQuery = useTesiraDesign(deviceId, selectedDesignId)
  const diagnosticsQuery = useTesiraDesignDiagnostics(deviceId, selectedDesignId)
  const selectedDesign = selectedDesignQuery.data?.design
  const selectedDesignGraphFingerprint = useMemo(
    () => graphFingerprint(selectedDesign?.graph),
    [selectedDesign?.graph],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [graphDirty, setGraphDirty] = useState(false)
  const hydratedDesignIdRef = React.useRef<string | null>(null)
  const hydratedGraphFingerprintRef = React.useRef<string>('')

  useEffect(() => {
    if (!selectedDesign) {
      setNodes([])
      setEdges([])
      setGraphDirty(false)
      hydratedDesignIdRef.current = null
      hydratedGraphFingerprintRef.current = ''
      return
    }

    if (
      graphDirty
      && hydratedDesignIdRef.current === selectedDesign.design_id
      && hydratedGraphFingerprintRef.current === selectedDesignGraphFingerprint
    ) {
      return
    }

    if (graphDirty && hydratedDesignIdRef.current === selectedDesign.design_id) {
      return
    }

    const graph = selectedDesign.graph || { nodes: [], edges: [] }
    const flowNodes = (graph.nodes || []).map((node: any, index: number) => toFlowNode(node, index))
    const flowEdges = (graph.edges || []).map((edge: any, index: number) => toFlowEdge(edge, index))
    setNodes(flowNodes)
    setEdges(flowEdges)
    setGraphDirty(false)
    hydratedDesignIdRef.current = selectedDesign.design_id
    hydratedGraphFingerprintRef.current = selectedDesignGraphFingerprint
  }, [graphDirty, selectedDesign, selectedDesignGraphFingerprint, setEdges, setNodes])

  useEffect(() => {
    if (!selectedDesignId && designs?.designs?.length) {
      setSelectedDesignId(designs.designs[0].design_id)
    }
  }, [designs, selectedDesignId])

  const onConnect = (params: Edge | Connection) => {
    setGraphDirty(true)
    setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds))
  }

  const handleNodesStateChange = (changes: Parameters<typeof onNodesChange>[0]) => {
    if (changes.length > 0) {
      setGraphDirty(true)
    }
    onNodesChange(changes)
  }

  const handleEdgesStateChange = (changes: Parameters<typeof onEdgesChange>[0]) => {
    if (changes.length > 0) {
      setGraphDirty(true)
    }
    onEdgesChange(changes)
  }

  const blockOptions = useMemo(() => library?.blocks ?? [], [library])

  const selectedBlock = useMemo(
    () => blockOptions.find((block) => block.block_type === blockType) ?? null,
    [blockOptions, blockType],
  )

  const graphPayload = useMemo(() => {
    const graphNodes = nodes.map((node) => ({
      id: node.id,
      label: String(node.data?.label || node.id),
      block_type: String((node.data as any)?.block_type || 'CustomBlock'),
      instance_tag: (node.data as any)?.instance_tag,
      position: node.position,
      io: (node.data as any)?.io || { inputs: [], outputs: [] },
      config: (node.data as any)?.config || {},
    }))

    const graphEdges = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_port: edge.sourceHandle || null,
      target_port: edge.targetHandle || null,
    }))

    return {
      nodes: graphNodes,
      edges: graphEdges,
      groups: selectedDesign?.graph?.groups || [],
    }
  }, [nodes, edges, selectedDesign])

  const handleCreateDesign = async () => {
    const created = await createDesign.mutateAsync({
      deviceId,
      name: newDesignName.trim() || 'New Tesira Design',
      graph: { nodes: [], edges: [], groups: [] },
    })
    setSelectedDesignId(created.design.design_id)
  }

  const handleSaveDesign = async () => {
    if (!selectedDesignId) return
    await updateDesign.mutateAsync({
      deviceId,
      designId: selectedDesignId,
      graph: graphPayload,
    })
    setGraphDirty(false)
    hydratedDesignIdRef.current = selectedDesignId
    hydratedGraphFingerprintRef.current = graphFingerprint(graphPayload)
  }

  const handleValidate = async () => {
    if (!selectedDesignId) return
    await validateDesign.mutateAsync({
      deviceId,
      designId: selectedDesignId,
      graph: graphPayload,
    })
  }

  const handleCompileDesign = async () => {
    if (!selectedDesignId) return
    const result = await compileDesign.mutateAsync({
      deviceId,
      designId: selectedDesignId,
      optimize: optimizeCompile,
      recompile: false,
    })
    setCompileSummary(`Compile ${result.status.toLowerCase()} · rev ${result.compile_revision}`)
  }

  const handleRecompileDesign = async () => {
    if (!selectedDesignId) return
    const result = await recompileDesign.mutateAsync({
      deviceId,
      designId: selectedDesignId,
      optimize: optimizeCompile,
    })
    setCompileSummary(`Recompile ${result.status.toLowerCase()} · rev ${result.compile_revision}`)
  }

  const handleCompileActive = async () => {
    const result = await compileActive.mutateAsync({
      deviceId,
      optimize: optimizeCompile,
      recompile: false,
    })
    setCompileSummary(`Compile active processed ${result.count} design(s)`)
  }

  const handleCompileAll = async () => {
    const result = await compileAll.mutateAsync({
      deviceId,
      optimize: optimizeCompile,
      recompile: false,
      includeTemplates: false,
    })
    setCompileSummary(`Compile all processed ${result.count} design(s)`)
  }

  const handleCompileUncompiled = async () => {
    const result = await compileUncompiled.mutateAsync({
      deviceId,
      optimize: optimizeCompile,
      recompile: false,
      includeTemplates: false,
    })
    setCompileSummary(`Compile uncompiled processed ${result.count} design(s)`)
  }

  const handleDeleteDesign = async () => {
    if (!selectedDesignId) return
    await deleteDesign.mutateAsync({
      deviceId,
      designId: selectedDesignId,
    })
    const remaining = (designs?.designs || []).filter((design) => design.design_id !== selectedDesignId)
    setSelectedDesignId(remaining[0]?.design_id || '')
  }

  const addBlock = () => {
    if (!selectedBlock) return
    const nodeId = `node_${Math.random().toString(36).slice(2, 10)}`
    const nextIndex = nodes.length
    const newNode: Node = {
      id: nodeId,
      type: 'default',
      position: { x: 120 + nextIndex * 36, y: 120 + nextIndex * 18 },
      data: {
        label: selectedBlock.title,
        block_type: selectedBlock.block_type,
        instance_tag: `${selectedBlock.block_type}${nextIndex + 1}`,
        io: selectedBlock.io || { inputs: [], outputs: [] },
      },
    }
    setGraphDirty(true)
    setNodes((previous) => [...previous, newNode])
  }

  const designErrors = [
    createDesign.error,
    updateDesign.error,
    deleteDesign.error,
    compileDesign.error,
    recompileDesign.error,
    compileActive.error,
    compileAll.error,
    compileUncompiled.error,
    diagnosticsQuery.error,
    selectedDesignQuery.error,
  ].filter(Boolean)

  return (
    <div className="tesira-design-canvas">
      <LandscapePrompt componentId={`tesira-design-${deviceId}`} />

      <Tile className="tesira-design-canvas__sidebar">
        <div className="tesira-design-canvas__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Design workspaces</p>
            <h3 className="tesira-dashboard__title">Tesira graph editor</h3>
            <p className="tesira-dashboard__summary">
              Build or revise MAP2-compatible Tesira design workspaces, then validate and compile them before deployment.
            </p>
          </div>
          <div className="tesira-design-canvas__status">
            {compileStatusTag(selectedDesign?.compile_status)}
            <Tag type="cool-gray" size="sm">{`Rev ${selectedDesign?.compile_revision ?? 0}`}</Tag>
          </div>
        </div>

        <div className="tesira-design-canvas__section">
          <p className="tesira-dashboard__stat-label">Saved workspaces</p>
          {designsLoading ? (
            <div className="tesira-design-canvas__loading">
              <InlineLoading description="Loading design workspaces" />
            </div>
          ) : (
            <div className="tesira-design-canvas__workspace-list" role="list" aria-label="Tesira design workspaces">
              {(designs?.designs || []).map((design) => (
                <button
                  key={design.design_id}
                  type="button"
                  className={
                    design.design_id === selectedDesignId
                      ? 'tesira-design-canvas__workspace-button tesira-design-canvas__workspace-button--selected'
                      : 'tesira-design-canvas__workspace-button'
                  }
                  onClick={() => setSelectedDesignId(design.design_id)}
                >
                  <span className="tesira-design-canvas__workspace-name">{design.name}</span>
                  <span className="tesira-design-canvas__workspace-meta">{design.design_id}</span>
                </button>
              ))}
              {!designsLoading && (designs?.designs || []).length === 0 ? (
                <p className="tesira-presets-tab__empty">No designs yet.</p>
              ) : null}
            </div>
          )}
        </div>

        <div className="tesira-design-canvas__section">
          <p className="tesira-dashboard__stat-label">Create workspace</p>
          <div className="tesira-design-canvas__form-grid">
            <TextInput
              id={`tesira-design-name-${deviceId}`}
              labelText="New design name"
              value={newDesignName}
              onChange={(event) => setNewDesignName(event.target.value)}
            />
            <Button kind="primary" size="sm" disabled={createDesign.isPending} onClick={() => void handleCreateDesign()}>
              {createDesign.isPending ? 'Creating…' : 'Create design'}
            </Button>
          </div>
        </div>

        <div className="tesira-design-canvas__section">
          <p className="tesira-dashboard__stat-label">Library and graph tools</p>
          <div className="tesira-design-canvas__form-grid">
            <Select
              id={`tesira-design-profile-${deviceId}`}
              size="sm"
              labelText="Profile"
              value={libraryProfile}
              onChange={(event) => setLibraryProfile(String(event.target.value))}
            >
              {(library?.available_profiles || [libraryProfile]).map((profile) => (
                <SelectItem key={profile} value={profile} text={profile} />
              ))}
            </Select>
            <Select
              id={`tesira-design-block-${deviceId}`}
              size="sm"
              labelText="Block"
              value={blockType}
              onChange={(event) => setBlockType(String(event.target.value))}
            >
              <SelectItem
                value=""
                text={blockOptions.length > 0 ? 'Select a block' : 'No library blocks available'}
              />
              {blockOptions.map((block) => (
                <SelectItem
                  key={block.block_type}
                  value={block.block_type}
                  text={`${block.title} (${block.block_type})`}
                />
              ))}
            </Select>
          </div>
          <div className="tesira-design-canvas__actions">
            <Button kind="secondary" size="sm" disabled={!selectedBlock} onClick={addBlock}>
              Add block
            </Button>
          </div>
        </div>

        <div className="tesira-design-canvas__section">
          <p className="tesira-dashboard__stat-label">Workspace actions</p>
          <div className="tesira-design-canvas__actions">
            <Button kind="primary" size="sm" disabled={!selectedDesignId || updateDesign.isPending} onClick={() => void handleSaveDesign()}>
              Save
            </Button>
            <Button kind="secondary" size="sm" disabled={!selectedDesignId || validateDesign.isPending} onClick={() => void handleValidate()}>
              Validate
            </Button>
            <Button kind="danger--tertiary" size="sm" disabled={!selectedDesignId || deleteDesign.isPending} onClick={() => void handleDeleteDesign()}>
              Delete
            </Button>
          </div>
        </div>

        <div className="tesira-design-canvas__section">
          <p className="tesira-dashboard__stat-label">Compile controls</p>
          <Checkbox
            id={`tesira-design-optimize-${deviceId}`}
            labelText="Optimize compile output"
            checked={optimizeCompile}
            onChange={(_, { checked }) => setOptimizeCompile(Boolean(checked))}
          />
          <div className="tesira-design-canvas__actions">
            <Button kind="secondary" size="sm" disabled={!selectedDesignId || compileDesign.isPending} onClick={() => void handleCompileDesign()}>
              Compile
            </Button>
            <Button kind="ghost" size="sm" disabled={!selectedDesignId || recompileDesign.isPending} onClick={() => void handleRecompileDesign()}>
              Recompile
            </Button>
            <Button kind="ghost" size="sm" disabled={compileActive.isPending} onClick={() => void handleCompileActive()}>
              Compile active
            </Button>
            <Button kind="ghost" size="sm" disabled={compileAll.isPending} onClick={() => void handleCompileAll()}>
              Compile all
            </Button>
            <Button kind="ghost" size="sm" disabled={compileUncompiled.isPending} onClick={() => void handleCompileUncompiled()}>
              Compile uncompiled
            </Button>
          </div>
        </div>
      </Tile>

      <Tile className="tesira-design-canvas__canvas-panel">
        <div className="tesira-design-canvas__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Canvas</p>
            <h3 className="tesira-dashboard__title">{selectedDesign?.name || 'Canvas'}</h3>
            <p className="tesira-dashboard__summary">
              Drag nodes and connect edges to define the signal-chain graph before validating and compiling the selected workspace.
            </p>
          </div>
          <div className="tesira-design-canvas__status">
            {selectedDesign?.design_id ? <Tag type="blue" size="sm">{selectedDesign.design_id}</Tag> : null}
            <Tag type="cool-gray" size="sm">{`${nodes.length} nodes`}</Tag>
            <Tag type="cool-gray" size="sm">{`${edges.length} edges`}</Tag>
          </div>
        </div>

        <div className="tesira-design-canvas__notice-stack">
          {validateDesign.data ? (
            <InlineNotification
              kind={validateDesign.data.validation.ok ? 'success' : 'error'}
              lowContrast
              hideCloseButton
              title={validateDesign.data.validation.ok ? 'Validation passed' : 'Validation failed'}
              subtitle={
                validateDesign.data.validation.ok
                  ? `${validateDesign.data.validation.counts.nodes} nodes validated.`
                  : `${validateDesign.data.validation.errors.length} validation errors returned.`
              }
            />
          ) : null}
          {validateDesign.data?.validation.warnings?.length ? (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Validation warning"
              subtitle={validateDesign.data.validation.warnings[0]}
            />
          ) : null}
          {compileSummary ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Compile summary"
              subtitle={compileSummary}
            />
          ) : null}
          {diagnosticsQuery.data ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Diagnostics"
              subtitle={`Status ${diagnosticsQuery.data.compile_status}, rev ${diagnosticsQuery.data.compile_revision}`}
            />
          ) : null}
          {designErrors.map((error, index) => (
            <InlineNotification
              key={`design-error-${index}`}
              kind="error"
              lowContrast
              hideCloseButton
              title="Design action failed"
              subtitle={errorMessage(error)}
            />
          ))}
        </div>

        <div className="tesira-design-canvas__canvas-shell">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesStateChange}
            onEdgesChange={handleEdgesStateChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </div>
      </Tile>
    </div>
  )
}
