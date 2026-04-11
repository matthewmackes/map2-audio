import { useRef, Suspense } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import type { Mesh } from 'three'

// ─── Brand-mark artwork (matches Map2BrandMark exactly) ───────────────────────
const BRAND_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">',
  '<rect x="12" y="12" width="168" height="168" rx="34" fill="#4589FF"/>',
  '<rect x="15" y="15" width="162" height="162" rx="31" fill="none"',
  ' stroke="#A6C8FF" stroke-opacity=".45" stroke-width="2"/>',
  '<rect x="28" y="28" width="136" height="136" rx="24" fill="#13171B"/>',
  '<rect x="83" y="28" width="26" height="136" rx="13" fill="#4589FF"/>',
  '<rect x="28" y="83" width="136" height="26" rx="13" fill="#4589FF"/>',
  '<rect x="34" y="34" width="43" height="43" rx="8" fill="#1A1E23"/>',
  '<rect x="115" y="34" width="43" height="43" rx="8" fill="#1A1E23"/>',
  '<rect x="34" y="115" width="43" height="43" rx="8" fill="#1A1E23"/>',
  '<rect x="115" y="115" width="43" height="43" rx="8" fill="#1A1E23"/>',
  '</svg>',
].join('')

const BRAND_TEXTURE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BRAND_SVG)}`

// ─── Spinning cube mesh (inside Canvas) ──────────────────────────────────────
function SpinningCubeMesh() {
  const meshRef = useRef<Mesh>(null)
  const texture = useLoader(TextureLoader, BRAND_TEXTURE_URL)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.6
      meshRef.current.rotation.y += delta * 0.96
    }
  })

  return (
    <mesh ref={meshRef}>
      {/* 2 × 2 × 2 cube — same geometry as reference code */}
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  )
}

// Solid-colour fallback rendered while the texture promise resolves
function CubeMeshFallback() {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.6
      meshRef.current.rotation.y += delta * 0.96
    }
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#4589FF" />
    </mesh>
  )
}

// ─── Public launcher button component ────────────────────────────────────────
interface SpinningCubeLauncherProps {
  isActive: boolean
  buttonRef: React.RefObject<HTMLButtonElement | null>
  onClick: () => void
}

export function SpinningCubeLauncher({
  isActive,
  buttonRef,
  onClick,
}: SpinningCubeLauncherProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`shell-launcher__cube-btn${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={isActive ? 'Close platform menu' : 'Open platform menu'}
      aria-haspopup="menu"
      aria-expanded={isActive}
      aria-controls="shell-launcher-panel"
    >
      {/*
        aria-hidden so screen readers don't try to traverse the WebGL canvas.
        All accessible information is on the <button> element itself.
      */}
      <span className="shell-launcher__cube-scene" aria-hidden="true">
        <Canvas
          camera={{ position: [0, 0, 3.8] }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
        >
          {/* Key lights to make all six faces readable */}
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1.5} />
          <directionalLight position={[-5, -3, -5]} intensity={0.3} />
          <Suspense fallback={<CubeMeshFallback />}>
            <SpinningCubeMesh />
          </Suspense>
        </Canvas>
      </span>
    </button>
  )
}
