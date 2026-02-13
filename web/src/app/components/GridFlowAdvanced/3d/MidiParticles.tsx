/**
 * MIDI-reactive particle system
 * GPU-accelerated particle bursts and trails
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  particleVertexShader,
  particleFragmentShader,
  burstVertexShader,
  burstFragmentShader
} from '../shaders/ParticleShader'
import { useGraphStore, type MidiEvent } from '../../../stores/graphStore'

interface MidiParticlesProps {
  nodeId: string
  position: THREE.Vector3
}

const MAX_PARTICLES = 1000
const BURST_PARTICLE_COUNT = 50

export function MidiParticles({ nodeId, position }: MidiParticlesProps) {
  const particlesRef = useRef<THREE.Points>(null)
  const burstRef = useRef<THREE.Points>(null)
  const midiEvents = useGraphStore((state) => state.midiEvents.get(nodeId) || [])
  
  // Particle system for continuous trails
  const { geometry: particleGeometry, material: particleMaterial } = useMemo(() => {
    const positions = new Float32Array(MAX_PARTICLES * 3)
    const colors = new Float32Array(MAX_PARTICLES * 3)
    const life = new Float32Array(MAX_PARTICLES)
    
    for (let i = 0; i < MAX_PARTICLES; i++) {
      positions[i * 3] = 0
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = 0
      
      colors[i * 3] = 0
      colors[i * 3 + 1] = 0.8
      colors[i * 3 + 2] = 1.0
      
      life[i] = 0
    }
    
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('life', new THREE.BufferAttribute(life, 1))
    
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true
    })
    
    return { geometry: geo, material: mat }
  }, [])
  
  // Burst particles for note-on events
  const { geometry: burstGeometry, material: burstMaterial, uniforms } = useMemo(() => {
    const angles = new Float32Array(BURST_PARTICLE_COUNT)
    const speeds = new Float32Array(BURST_PARTICLE_COUNT)
    const colors = new Float32Array(BURST_PARTICLE_COUNT * 3)
    
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      angles[i] = (i / BURST_PARTICLE_COUNT) * Math.PI * 2
      speeds[i] = 0.5 + Math.random() * 1.5
      
      // Velocity-based color (warm to cool)
      const t = speeds[i] / 2.0
      colors[i * 3] = 1.0 - t * 0.5
      colors[i * 3 + 1] = 0.5 + t * 0.3
      colors[i * 3 + 2] = 0.2 + t * 0.8
    }
    
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('burstAngle', new THREE.BufferAttribute(angles, 1))
    geo.setAttribute('burstSpeed', new THREE.BufferAttribute(speeds, 1))
    geo.setAttribute('burstColor', new THREE.BufferAttribute(colors, 3))
    
    const unis = {
      uTime: { value: 0 },
      uBurstTime: { value: 0 },
      uOrigin: { value: position },
      uVelocity: { value: 1.0 }
    }
    
    const mat = new THREE.ShaderMaterial({
      vertexShader: burstVertexShader,
      fragmentShader: burstFragmentShader,
      uniforms: unis,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    
    return { geometry: geo, material: mat, uniforms: unis }
  }, [position])
  
  // Handle MIDI events
  useEffect(() => {
    const latestEvent = midiEvents[midiEvents.length - 1]
    if (!latestEvent) return
    
    if (latestEvent.type === 'note-on' && latestEvent.velocity) {
      // Trigger burst
      uniforms.uBurstTime.value = Date.now() / 1000
      uniforms.uVelocity.value = latestEvent.velocity / 127
      uniforms.uOrigin.value = position
    }
  }, [midiEvents, uniforms, position])
  
  // Animate particles
  useFrame((state) => {
    if (burstMaterial) {
      burstMaterial.uniforms.uTime.value = state.clock.elapsedTime
    }
    
    // Update particle positions for trail effect
    if (particlesRef.current && midiEvents.length > 0) {
      const positions = particleGeometry.attributes.position.array as Float32Array
      const colors = particleGeometry.attributes.color.array as Float32Array
      const life = particleGeometry.attributes.life.array as Float32Array
      
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (life[i] > 0) {
          // Update existing particle
          life[i] -= 0.016 // Decay
          
          // Move particle
          positions[i * 3] += (Math.random() - 0.5) * 0.05
          positions[i * 3 + 1] += (Math.random() - 0.5) * 0.05
          positions[i * 3 + 2] += 0.02
        } else if (Math.random() < 0.1 && midiEvents.length > 0) {
          // Spawn new particle
          life[i] = 1.0
          positions[i * 3] = position.x
          positions[i * 3 + 1] = position.y
          positions[i * 3 + 2] = position.z
          
          // Color based on last MIDI event
          const lastEvent = midiEvents[midiEvents.length - 1]
          if (lastEvent.velocity) {
            const vel = lastEvent.velocity / 127
            colors[i * 3] = 1.0 - vel * 0.5
            colors[i * 3 + 1] = 0.5 + vel * 0.5
            colors[i * 3 + 2] = 0.8
          }
        }
      }
      
      particleGeometry.attributes.position.needsUpdate = true
      particleGeometry.attributes.life.needsUpdate = true
    }
  })
  
  if (midiEvents.length === 0) return null
  
  return (
    <group position={position}>
      {/* Continuous particle trail */}
      <points ref={particlesRef} geometry={particleGeometry} material={particleMaterial} />
      
      {/* Burst particles for note-on */}
      <points ref={burstRef} geometry={burstGeometry} material={burstMaterial} />
    </group>
  )
}
