import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
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

interface TesiraDesignCanvasProps {
  deviceId: string
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

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    if (!selectedDesign) {
      setNodes([])
      setEdges([])
      return
    }

    const graph = selectedDesign.graph || { nodes: [], edges: [] }
    const flowNodes = (graph.nodes || []).map((node: any, index: number) => toFlowNode(node, index))
    const flowEdges = (graph.edges || []).map((edge: any, index: number) => toFlowEdge(edge, index))
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [selectedDesign, setNodes, setEdges])

  useEffect(() => {
    if (!selectedDesignId && designs?.designs?.length) {
      setSelectedDesignId(designs.designs[0].design_id)
    }
  }, [designs, selectedDesignId])

  const onConnect = (params: Edge | Connection) => {
    setEdges((eds) => addEdge({ ...params, type: 'smoothstep' }, eds))
  }

  const blockOptions = useMemo(() => library?.blocks ?? [], [library])

  const selectedBlock = useMemo(
    () => blockOptions.find((b) => b.block_type === blockType) ?? null,
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
    const remaining = (designs?.designs || []).filter((d) => d.design_id !== selectedDesignId)
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
    setNodes((prev) => [...prev, newNode])
  }

  return (
    <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={700}>Design Workspaces</Typography>
        <List dense sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {(designs?.designs || []).map((design) => (
            <ListItemButton
              key={design.design_id}
              selected={design.design_id === selectedDesignId}
              onClick={() => setSelectedDesignId(design.design_id)}
            >
              <ListItemText primary={design.name} secondary={design.design_id} />
            </ListItemButton>
          ))}
          {!designsLoading && (designs?.designs || []).length === 0 && (
            <ListItemText sx={{ px: 1.5, py: 1 }} primary="No designs yet" />
          )}
        </List>

        <TextField
          size="small"
          label="New design name"
          value={newDesignName}
          onChange={(event) => setNewDesignName(event.target.value)}
        />
        <Button variant="outlined" onClick={handleCreateDesign} disabled={createDesign.isPending}>
          {createDesign.isPending ? 'Creating…' : 'Create Design'}
        </Button>

        <Divider />

        <FormControl size="small" fullWidth>
          <InputLabel id="tesira-design-profile-label">Profile</InputLabel>
          <Select
            labelId="tesira-design-profile-label"
            value={libraryProfile}
            label="Profile"
            onChange={(event) => setLibraryProfile(String(event.target.value))}
          >
            {(library?.available_profiles || [libraryProfile]).map((profile) => (
              <MenuItem key={profile} value={profile}>
                {profile}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" fullWidth>
          <InputLabel id="tesira-design-block-label">Block</InputLabel>
          <Select
            labelId="tesira-design-block-label"
            value={blockType}
            label="Block"
            onChange={(event) => setBlockType(String(event.target.value))}
          >
            {blockOptions.map((block) => (
              <MenuItem key={block.block_type} value={block.block_type}>
                {block.title} ({block.block_type})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button variant="outlined" onClick={addBlock} disabled={!selectedBlock}>
          Add Block
        </Button>

        <Divider />

        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={handleSaveDesign} disabled={!selectedDesignId || updateDesign.isPending}>
            Save
          </Button>
          <Button variant="outlined" onClick={handleValidate} disabled={!selectedDesignId || validateDesign.isPending}>
            Validate
          </Button>
          <Button color="error" variant="text" onClick={handleDeleteDesign} disabled={!selectedDesignId || deleteDesign.isPending}>
            Delete
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            onClick={handleCompileDesign}
            disabled={!selectedDesignId || compileDesign.isPending}
          >
            Compile
          </Button>
          <Button
            variant="outlined"
            onClick={handleRecompileDesign}
            disabled={!selectedDesignId || recompileDesign.isPending}
          >
            Recompile
          </Button>
          <Button
            variant="text"
            onClick={() => setOptimizeCompile((prev) => !prev)}
          >
            Optimize: {optimizeCompile ? 'On' : 'Off'}
          </Button>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="text" onClick={handleCompileActive} disabled={compileActive.isPending}>
            Compile Active
          </Button>
          <Button variant="text" onClick={handleCompileAll} disabled={compileAll.isPending}>
            Compile All
          </Button>
          <Button variant="text" onClick={handleCompileUncompiled} disabled={compileUncompiled.isPending}>
            Compile Uncompiled
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary">
          Status: {selectedDesign?.compile_status || 'UNCOMPILED'} · Revision: {selectedDesign?.compile_revision ?? 0}
        </Typography>

        {validateDesign.data && (
          <Alert severity={validateDesign.data.validation.ok ? 'success' : 'error'}>
            {validateDesign.data.validation.ok
              ? `Validation passed (${validateDesign.data.validation.counts.nodes} nodes)`
              : `Validation failed (${validateDesign.data.validation.errors.length} errors)`}
          </Alert>
        )}

        {!!validateDesign.data?.validation.warnings?.length && (
          <Alert severity="warning">
            {validateDesign.data.validation.warnings[0]}
          </Alert>
        )}

        {compileSummary && <Alert severity="info">{compileSummary}</Alert>}

        {diagnosticsQuery.data && (
          <Alert severity="info">
            Diagnostics: status {diagnosticsQuery.data.compile_status}, rev {diagnosticsQuery.data.compile_revision}
          </Alert>
        )}

        {createDesign.error && <Alert severity="error">{createDesign.error.message}</Alert>}
        {updateDesign.error && <Alert severity="error">{updateDesign.error.message}</Alert>}
        {deleteDesign.error && <Alert severity="error">{deleteDesign.error.message}</Alert>}
        {compileDesign.error && <Alert severity="error">{compileDesign.error.message}</Alert>}
        {recompileDesign.error && <Alert severity="error">{recompileDesign.error.message}</Alert>}
        {compileActive.error && <Alert severity="error">{compileActive.error.message}</Alert>}
        {compileAll.error && <Alert severity="error">{compileAll.error.message}</Alert>}
        {compileUncompiled.error && <Alert severity="error">{compileUncompiled.error.message}</Alert>}
        {diagnosticsQuery.error && <Alert severity="error">{diagnosticsQuery.error.message}</Alert>}
        {selectedDesignQuery.error && <Alert severity="error">{selectedDesignQuery.error.message}</Alert>}
      </Paper>

      <Paper variant="outlined" sx={{ minHeight: 620 }}>
        <Box sx={{ px: 2, pt: 1.25, pb: 0.5 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {selectedDesign?.name || 'Canvas'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Drag nodes and connect edges to build the signal chain graph.
          </Typography>
        </Box>
        <Box sx={{ height: 560 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </Box>
      </Paper>
    </Box>
  )
}
