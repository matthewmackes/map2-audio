/**
 * GPU-driven particle system shaders for MIDI events
 * Efficient instanced particle rendering with trails
 */

export const particleVertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform sampler2D uPositions;
  uniform sampler2D uVelocities;
  
  attribute vec2 particleId;
  attribute float particleLife;
  attribute vec3 particleColor;
  
  varying vec3 vColor;
  varying float vLife;
  
  void main() {
    // Sample particle data from textures
    vec4 posData = texture2D(uPositions, particleId);
    vec4 velData = texture2D(uVelocities, particleId);
    
    vec3 pos = posData.xyz;
    float age = posData.w;
    
    // Life-based alpha
    vLife = max(0.0, 1.0 - age);
    vColor = particleColor;
    
    // Size based on life (shrink over time)
    float size = uSize * vLife;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = size * (300.0 / length(gl_Position.xyz));
  }
`

export const particleFragmentShader = `
  varying vec3 vColor;
  varying float vLife;
  
  void main() {
    // Circular particle shape with soft edges
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Soft circle with glow
    float alpha = smoothstep(0.5, 0.1, dist) * vLife;
    
    // Add core brightness
    float core = smoothstep(0.3, 0.0, dist);
    vec3 color = vColor * (1.0 + core * 2.0);
    
    gl_FragColor = vec4(color, alpha);
  }
`

// Trail particle shader for motion blur effect
export const trailVertexShader = `
  uniform float uTime;
  
  attribute vec3 position;
  attribute vec3 previousPosition;
  attribute vec3 nextPosition;
  attribute float side;
  attribute float width;
  attribute float alpha;
  attribute vec3 color;
  
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    vec3 tangent = normalize(nextPosition - previousPosition);
    vec3 normal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    vec3 offset = normal * width * side;
    
    vec3 finalPosition = position + offset;
    
    vColor = color;
    vAlpha = alpha;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPosition, 1.0);
  }
`

export const trailFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    // Glowing trail with emissive color
    vec3 emissive = vColor * 1.5;
    gl_FragColor = vec4(emissive, vAlpha);
  }
`

// MIDI burst emitter shader (for note-on events)
export const burstVertexShader = `
  uniform float uTime;
  uniform float uBurstTime;
  uniform vec3 uOrigin;
  uniform float uVelocity;
  
  attribute float burstAngle;
  attribute float burstSpeed;
  attribute vec3 burstColor;
  
  varying vec3 vColor;
  varying float vLife;
  
  void main() {
    float elapsed = uTime - uBurstTime;
    vLife = max(0.0, 1.0 - elapsed / 2.0); // 2 second lifetime
    
    // Radial burst pattern
    float radius = elapsed * burstSpeed * uVelocity;
    vec3 pos = uOrigin + vec3(
      cos(burstAngle) * radius,
      sin(burstAngle) * radius,
      sin(elapsed * 3.0) * 0.5 // Z oscillation
    );
    
    vColor = burstColor;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 8.0 * vLife;
  }
`

export const burstFragmentShader = `
  varying vec3 vColor;
  varying float vLife;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    float alpha = smoothstep(0.5, 0.0, dist) * vLife;
    
    // Bright core for impact
    vec3 color = vColor * (2.0 - vLife);
    
    gl_FragColor = vec4(color, alpha);
  }
`
