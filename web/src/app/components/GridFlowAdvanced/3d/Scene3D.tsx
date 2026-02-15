/**
 * Main 3D Scene for Signal Flow Graph
 * Robust baseline renderer for advanced grid visualization.
 */
import { useMemo, useEffect, useRef, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, PerspectiveCamera } from '@react-three/drei'
import { EffectComposer, Bloom, DepthOfField } from '@react-three/postprocessing'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useGraphStore } from '../../../stores/graphStore'
import { CustomNode } from './CustomNode'
import { CustomLink } from './CustomLink'
import { MidiParticles } from './MidiParticles'

interface Scene3DProps {
  onNodeClick?: (nodeId: string | null) => void
  onNodeHover?: (nodeId: string | null) => void
  onBackgroundClick?: () => void
}

function GraphScene({ onNodeClick, onNodeHover }: Omit<Scene3DProps, 'onBackgroundClick'>) {
  const { camera } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  const nodes = useGraphStore((state) => state.nodes)
  const links = useGraphStore((state) => state.links)
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId)
  const hoveredNodeId = useGraphStore((state) => state.hoveredNodeId)

  const bounds = useMemo(() => {
    if (nodes.length === 0) return null

    const box = new THREE.Box3()

    nodes.forEach((node) => {
      const pos = node.position
      if (!pos) return
      box.expandByPoint(new THREE.Vector3(pos.x, pos.y, pos.z))
    })

    if (box.isEmpty()) {
      box.expandByPoint(new THREE.Vector3(0, 0, 0))
    }

    const center = new THREE.Vector3()
    const size = new THREE.Vector3()

    box.getCenter(center)
    box.getSize(size)

    const maxDimension = Math.max(size.x, size.y, size.z)
    const radius = Math.max(10, maxDimension * 0.8)

    return { center, radius }
  }, [nodes])

  useEffect(() => {
    if (!bounds) return

    const { center, radius } = bounds
    const distance = Math.max(30, radius * 3.2)

    camera.position.set(center.x, center.y + radius * 0.15, center.z + distance)
    camera.lookAt(center)

    if (controlsRef.current) {
      controlsRef.current.target.set(center.x, center.y, center.z)
      controlsRef.current.update()
    }
  }, [bounds, camera])

  return (
    <>
      <color attach="background" args={['#02040a']} />
      <fog attach="fog" args={['#02040a', 45, 150]} />

      <Stars radius={380} depth={80} count={2800} factor={3} fade speed={0.2} />

      <ambientLight intensity={0.35} />
      <pointLight position={[35, 25, 45]} intensity={0.7} color="#7dd3fc" />
      <pointLight position={[-25, -20, -30]} intensity={0.45} color="#a78bfa" />

      <gridHelper args={[220, 44, '#1f2937', '#0b1220']} position={[0, -20, -3]} />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.065}
        minDistance={12}
        maxDistance={250}
        rotateSpeed={0.7}
        panSpeed={0.8}
      />

      {nodes.map((node) => {
        const position = new THREE.Vector3(
          node.position?.x ?? 0,
          node.position?.y ?? 0,
          node.position?.z ?? node.layer * -8
        )

        return (
          <group
            key={node.id}
            position={position}
            onClick={(event) => {
              event.stopPropagation()
              onNodeClick?.(node.id)
            }}
            onPointerEnter={(event) => {
              event.stopPropagation()
              onNodeHover?.(node.id)
            }}
            onPointerLeave={(event) => {
              event.stopPropagation()
              onNodeHover?.(null)
            }}
          >
            <CustomNode
              node={node}
              isSelected={selectedNodeId === node.id}
              isHovered={hoveredNodeId === node.id}
            />
            <MidiParticles nodeId={node.id} position={position} />
          </group>
        )
      })}

      {links.map((link, i) => {
        const sourceNode = nodes.find((n) => n.id === link.source)
        const targetNode = nodes.find((n) => n.id === link.target)

        if (!sourceNode || !targetNode) return null

        const sourcePos = new THREE.Vector3(
          sourceNode.position?.x ?? 0,
          sourceNode.position?.y ?? 0,
          sourceNode.position?.z ?? sourceNode.layer * -8
        )

        const targetPos = new THREE.Vector3(
          targetNode.position?.x ?? 0,
          targetNode.position?.y ?? 0,
          targetNode.position?.z ?? targetNode.layer * -8
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

      <EffectComposer>
        <Bloom intensity={1.15} luminanceThreshold={0.2} luminanceSmoothing={0.9} radius={0.8} />
        <DepthOfField focusDistance={0.01} focalLength={0.045} bokehScale={2.5} />
      </EffectComposer>
    </>
  )
}

export function Scene3D({ onNodeClick, onNodeHover, onBackgroundClick }: Scene3DProps) {
  return (
    <Canvas
      style={{ width: '100%', height: '100%', background: '#02040a' }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      onPointerMissed={() => {
        onBackgroundClick?.()
      }}
    >
      <PerspectiveCamera makeDefault position={[0, 0, 42]} fov={58} />

      <Suspense fallback={null}>
        <GraphScene onNodeClick={onNodeClick} onNodeHover={onNodeHover} />
      </Suspense>
    </Canvas>
  )
}
