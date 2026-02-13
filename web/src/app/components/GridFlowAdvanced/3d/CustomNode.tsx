/**
 * Custom 3D node component for plugins with Asteroids-style glow
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphNode } from '../../../stores/graphStore'

interface CustomNodeProps {
  node: GraphNode
  isSelected: boolean
  isHovered: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  amplifier: '#ff6b35',
  distortion: '#ff006e',
  modulation: '#00d9ff',
  delay: '#00ff9f',
  reverb: '#a239ca',
  dynamics: '#ffbe0b',
  filter: '#06ffa5',
  utility: '#7209b7',
  default: '#007acc'
}

export function CustomNode({ node, isSelected, isHovered }: CustomNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  
  const color = useMemo(() => {
    if (node.color) return node.color
    return CATEGORY_COLORS[node.category || 'default'] || CATEGORY_COLORS.default
  }, [node.category, node.color])
  
  const size = useMemo(() => {
    if (node.type === 'input' || node.type === 'output') return 0.4
    if (node.type === 'layer-portal') return 0.6
    return 0.5
  }, [node.type])
  
  // Breathing animation
  useFrame((state) => {
    if (meshRef.current) {
      const breathe = Math.sin(state.clock.elapsedTime * 1.5) * 0.05 + 1.0
      meshRef.current.scale.setScalar(breathe * (isSelected ? 1.2 : 1.0))
      
      // Rotation for visual interest
      meshRef.current.rotation.z += 0.002
    }
    
    if (glowRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * 2.0) * 0.3 + 0.7
      const glowMaterial = glowRef.current.material as THREE.MeshBasicMaterial
      glowMaterial.opacity = (isHovered ? 0.4 : 0.2) * pulse
    }
  })
  
  const geometry = useMemo(() => {
    if (node.type === 'layer-portal') {
      return new THREE.RingGeometry(size * 0.7, size, 32)
    }
    return new THREE.BoxGeometry(size, size, size * 0.3)
  }, [node.type, size])
  
  return (
    <group>
      {/* Outer glow */}
      <mesh ref={glowRef} geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Main node geometry */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={node.bypassed ? 0.2 : 0.6}
          metalness={0.8}
          roughness={0.2}
          transparent
          opacity={node.bypassed ? 0.4 : 1.0}
        />
        
        {/* Edge wireframe for Asteroids look */}
        <lineSegments>
          <edgesGeometry args={[geometry]} />
          <lineBasicMaterial color={color} opacity={0.8} transparent />
        </lineSegments>
      </mesh>
      
      {/* Selection indicator */}
      {isSelected && (
        <mesh scale={[1.3, 1.3, 1.3]}>
          <ringGeometry args={[size * 0.9, size * 1.0, 32]} />
          <meshBasicMaterial
            color="#ffffff"
            side={THREE.DoubleSide}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
      
      {/* Label */}
      <Text
        position={[0, size * 0.8, 0]}
        fontSize={0.15}
        color="#d4d4d4"
        anchorX="center"
        anchorY="middle"
        font="/fonts/RobotoMono-Regular.ttf"
        outlineWidth={0.01}
        outlineColor="#000000"
      >
        {node.label}
      </Text>
      
      {/* Layer indicator */}
      {node.layer !== 0 && (
        <Text
          position={[0, -size * 0.8, 0]}
          fontSize={0.1}
          color="#666666"
          anchorX="center"
          anchorY="middle"
        >
          L{node.layer}
        </Text>
      )}
    </group>
  )
}
