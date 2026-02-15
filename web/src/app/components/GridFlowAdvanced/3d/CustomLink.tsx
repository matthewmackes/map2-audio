/**
 * Custom animated link component with shader-based flow
 */
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import {
  flowLinkVertexShader,
  flowLinkFragmentShader
} from '../shaders/FlowLinkShader'
import type { GraphLink } from '../../../stores/graphStore'

interface CustomLinkProps {
  link: GraphLink
  sourcePos: THREE.Vector3
  targetPos: THREE.Vector3
}

export function CustomLink({ link, sourcePos, targetPos }: CustomLinkProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  
  // Create curved path for visual interest
  const curve = useMemo(() => {
    const midPoint = new THREE.Vector3()
      .addVectors(sourcePos, targetPos)
      .multiplyScalar(0.5)
    
    // Add curvature based on distance
    const distance = sourcePos.distanceTo(targetPos)
    const offset = distance * 0.2
    midPoint.z += offset
    
    return new THREE.QuadraticBezierCurve3(sourcePos, midPoint, targetPos)
  }, [sourcePos, targetPos])
  
  const points = useMemo(() => curve.getPoints(50), [curve])
  
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFlowSpeed: { value: link.flowIntensity * 0.5 },
      uFlowIntensity: { value: link.flowIntensity },
      uColorStart: {
        value: new THREE.Color(link.type === 'midi' ? '#ffbe0b' : '#007acc')
      },
      uColorEnd: {
        value: new THREE.Color(link.type === 'midi' ? '#ff006e' : '#00d9ff')
      },
      uActive: { value: link.active ? 1.0 : 0.0 },
      uPulseIntensity: { value: 1.0 }
    }),
    [link.type, link.active, link.flowIntensity]
  )
  
  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      materialRef.current.uniforms.uFlowIntensity.value = link.flowIntensity
      materialRef.current.uniforms.uPulseIntensity.value =
        1.0 + Math.sin(state.clock.elapsedTime * 3.0) * 0.2
    }
  })
  
  // Use TubeGeometry for shader application
  const tubeGeometry = useMemo(() => {
    return new THREE.TubeGeometry(curve, 50, link.type === 'midi' ? 0.08 : 0.06, 10, false)
  }, [curve, link.type])
  
  return (
    <>
      {/* Main shader-based tube */}
      <mesh geometry={tubeGeometry}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={flowLinkVertexShader}
          fragmentShader={flowLinkFragmentShader}
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      
      {/* Core line for fallback/definition */}
      <Line
        points={points}
        color={link.active ? (link.type === 'midi' ? '#ffbe0b' : '#007acc') : '#333333'}
        lineWidth={link.type === 'midi' ? 2 : 1}
        transparent
        opacity={link.active ? 0.3 : 0.1}
      />
    </>
  )
}
