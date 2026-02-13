/**
 * Custom shader for animated flow along graph edges
 * Marching dashes with emissive glow inspired by 1980s Asteroids
 */

export const flowLinkVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const flowLinkFragmentShader = `
  uniform float uTime;
  uniform float uFlowSpeed;
  uniform float uFlowIntensity;
  uniform vec3 uColorStart;
  uniform vec3 uColorEnd;
  uniform float uActive;
  uniform float uPulseIntensity;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  
  // Noise function for organic flow distortion
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }
  
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  
  void main() {
    // Create marching dashes effect
    float dashPattern = step(0.5, fract((vUv.x - uTime * uFlowSpeed) * 8.0));
    
    // Add noise distortion for organic feel
    float noiseValue = noise(vUv * 4.0 + uTime * 0.3);
    float distortion = noiseValue * 0.15;
    
    // Gradient along the flow direction
    float gradient = mix(0.3, 1.0, vUv.x + distortion);
    
    // Pulsing thickness for alive feel
    float pulse = sin(uTime * 2.0 + vUv.x * 3.14159) * 0.2 + 0.8;
    float thickness = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    thickness *= pulse * uPulseIntensity;
    
    // Color mixing based on flow direction
    vec3 flowColor = mix(uColorStart, uColorEnd, vUv.x);
    
    // Combine effects
    float flowMask = dashPattern * gradient * thickness * uFlowIntensity;
    
    // Emissive glow for Asteroids aesthetic
    vec3 glow = flowColor * (1.0 + flowMask * 2.0);
    
    // Active vs inactive state
    float alpha = uActive * flowMask;
    
    // Dim for inactive
    if (uActive < 0.5) {
      glow *= 0.3;
      alpha = flowMask * 0.3;
    }
    
    gl_FragColor = vec4(glow, alpha);
  }
`

// Shader for layer connection portals
export const portalVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const portalFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  float noise(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }
  
  void main() {
    // Ripple effect from center
    vec2 center = vec2(0.5);
    float dist = length(vUv - center);
    float ripple = sin(dist * 20.0 - uTime * 3.0) * 0.5 + 0.5;
    
    // Edge glow
    float edgeGlow = 1.0 - smoothstep(0.4, 0.5, dist);
    
    // Fresnel effect for 3D depth
    vec3 viewDir = normalize(-vPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), 3.0);
    
    // Combine effects
    vec3 finalColor = uColor * (ripple * 0.5 + edgeGlow + fresnel);
    float alpha = (edgeGlow + fresnel * 0.5) * uOpacity;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`
