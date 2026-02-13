/**
 * Main 3D Scene for Signal Flow Graph
 * Integrates ForceGraph3D with custom nodes, links, and particles
 */
import { useRef, useEffect, useCallback, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField } from '@react-three/postprocessing'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { useGraphStore } from '../../../stores/graphStore'
import { CustomNode } from './CustomNode'
import { CustomLink } from './CustomLink'
import { MidiParticles } from './MidiParticles'

interface Scene3DProps {
  onNodeClick?: (nodeId: string) => void
  onNodeHover?: (nodeId: string | null) => void
}

function ForceGraphScene({ onNodeClick, onNodeHover }: Scene3DProps) {
  const fgRef = useRef<any>(null)
  const { camera, gl } = useThree()
  
  const nodes = useGraphStore((state) => state.nodes)
  const links = useGraphStore((state) => state.links)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const hoveredNodeId = useGraphStore((state) => state.hoveredNodeId)
  const setCurrentLayer = useGraphStore((state) => state.setCurrentLayer)
  const currentLayer = useGraphStore((state) => state.currentLayer)
  
  // Configure force graph
  useEffect(() => {
    if (fgRef.current) {
      // Set 3D force parameters
      fgRef.current.d3Force('charge').strength(-200)
      fgRef.current.d3Force('link').distance(100)
      
      // Layer-based positioning
      fgRef.current.d3Force('collision', null)
      fgRef.current.numDimensions(3)
    }
  }, [])
  
  // Custom node renderer
  const nodeThreeObject = useCallback(
    (node: any) => {
      const graphNode = nodes.find((n) => n.id === node.id)
      if (!graphNode) return new THREE.Object3D()
      
      const group = new THREE.Group()
      
      // We'll use React components via drei, but need to return Three object for force-graph
      // Workaround: return empty group and render React components separately
      return group
    },
    [nodes]
  )
  
  // Custom link renderer
  const linkThreeObject = useCallback(
    (link: any) => {
      return new THREE.Object3D() // Handled by CustomLink component
    },
    []
  )
  
  // Handle node clicks
  const handleNodeClick = useCallback(
    (node: any) => {
      if (onNodeClick) onNodeClick(node.id)
      
      // Zoom to layer
      const graphNode = nodes.find((n) => n.id === node.id)
      if (graphNode && graphNode.layer !== currentLayer) {
        setCurrentLayer(graphNode.layer)
        
        // Animate camera to layer Z position
        const targetZ = graphNode.layer * -5
        // Camera animation would go here
      }
    },
    [nodes, currentLayer, setCurrentLayer, onNodeClick]
  )
  
  const handleNodeHover = useCallback(
    (node: any) => {
      if (onNodeHover) onNodeHover(node?.id || null)
    },
    [onNodeHover]
  )
  
  // Graph data for force-graph
  const graphData = {
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.label,
      layer: n.layer,
      fx: n.position?.x,
      fy: n.position?.y,
      fz: n.position?.z || n.layer * -5 // Z positioning by layer
    })),
    links: links.map((l) => ({
      source: l.source,
      target: l.target
    }))
  }
  
  return (
    <>
      {/* Ambient environment */}
      <Stars radius={300} depth={50} count={2000} factor={2} fade speed={0.5} />
      
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 10, 10]} intensity={0.3} />
      
      {/* Custom rendered nodes */}
      {nodes.map((node) => {
        const position = new THREE.Vector3(
          node.position?.x || 0,
          node.position?.y || 0,
          node.position?.z || node.layer * -5
        )
        
        return (
          <group key={node.id} position={position}>
            <CustomNode
              node={node}
              isSelected={selectedNodeId === node.id}
              isHovered={hoveredNodeId === node.id}
            />
            
            {/* MIDI particles */}
            <MidiParticles nodeId={node.id} position={position} />
          </group>
        )
      })}
      
      {/* Custom rendered links */}
      {links.map((link, i) => {
        const sourceNode = nodes.find((n) => n.id === link.source)
        const targetNode = nodes.find((n) => n.id === link.target)
        
        if (!sourceNode || !targetNode) return null
        
        const sourcePos = new THREE.Vector3(
          sourceNode.position?.x || 0,
          sourceNode.position?.y || 0,
          sourceNode.position?.z || sourceNode.layer * -5
        )
        
        const targetPos = new THREE.Vector3(
          targetNode.position?.x || 0,
          targetNode.position?.y || 0,
          targetNode.position?.z || targetNode.layer * -5
        )
        
        return (
          <CustomLink
            key={`${link.source}-${link.target}-${i}`}
            link={link}
            sourcePos={sourcePos}
            targetPos={targetPos}
          />
        )
      })}
      
      {/* Post-processing effects */}
      <EffectComposer>
        <Bloom
          intensity={1.5}
          luminanceThreshold={0.2}
          luminanceSmoothing={0.9}
          radius={0.8}
        />
        <DepthOfField
          focusDistance={0.01}
          focalLength={0.05}
          bokehScale={3}
        />
      </EffectComposer>
    </>
  )
}

export function Scene3D({ onNodeClick, onNodeHover }: Scene3DProps) {
  return (
    <Canvas
      style={{
        width: '100%',
        height: '100%',
        background: '#000000'
      }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2
      }}
    >
      <PerspectiveCamera makeDefault position={[0, 0, 50]} fov={60} />
      
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={200}
        target={[0, 0, 0]}
      />
      
      <Suspense fallback={null}>
        <ForceGraphScene onNodeClick={onNodeClick} onNodeHover={onNodeHover} />
      </Suspense>
      
      {/* Subtle camera drift when idle */}
      <CameraDrift />
    </Canvas>
  )
}

// Subtle camera drift for alive feel
function CameraDrift() {
  const { camera } = useThree()
  const timeRef = useRef(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      timeRef.current += 0.01
      
      // Very subtle rotation
      const x = Math.sin(timeRef.current * 0.1) * 0.5
      const y = Math.cos(timeRef.current * 0.1) * 0.5
      
      camera.position.x += x * 0.01
      camera.position.y += y * 0.01
    }, 50)
    
    return () => clearInterval(interval)
  }, [camera])
  
  return null
}
