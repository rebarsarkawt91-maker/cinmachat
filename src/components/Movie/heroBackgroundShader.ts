const vertexSource = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const fragmentSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uSize;
uniform float uTime;
uniform float uSeed;
uniform float uShape;
uniform float uLight;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;

const mat2 tilt = mat2(0.81, 0.59, -0.59, 0.81);

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise2(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 fade = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), fade.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0, 1.0)), fade.x),
    fade.y
  );
}

float cloud(vec2 p) {
  float value = 0.56 * noise2(p);
  p = tilt * p * 2.06 + 6.2;
  value += 0.27 * noise2(p);
  p = tilt * p * 2.03 + 4.1;
  value += 0.12 * noise2(p);
  p = tilt * p * 2.11 + 2.3;
  return value + 0.05 * noise2(p);
}

float starField(vec2 p, float time) {
  vec2 cells = p * 84.0;
  vec2 id = floor(cells);
  float random = hash21(id);
  vec2 origin = vec2(hash21(id + 40.0), hash21(id + 7.0)) * 0.6 + 0.2;
  float d = length(fract(cells) - origin);
  float point = 1.0 - smoothstep(0.025, 0.13, d);
  float twinkle = 0.65 + 0.35 * sin(time * (0.6 + random) + random * 80.0);
  return point * smoothstep(0.965, 1.0, random) * twinkle;
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float along = clamp(dot(p - a, ab) / max(dot(ab, ab), 0.001), 0.0, 1.0);
  return length(p - a - along * ab);
}

vec2 connectedNode(vec2 id, float time) {
  vec2 phase = vec2(hash21(id), hash21(id + 47.2)) * 6.283185;
  return id + 0.5 + 0.31 * sin(phase + vec2(1.3, 0.93) * time);
}

float connectedField(vec2 p, float time) {
  vec2 center = floor(p);
  float light = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = center + vec2(float(i), float(j));
      vec2 a = connectedNode(id, time);
      vec2 b = connectedNode(id + vec2(1.0, 0.0), time);
      vec2 c = connectedNode(id + vec2(0.0, 1.0), time);
      float links = (1.0 - smoothstep(0.93, 1.25, length(a - b))) * (1.0 - smoothstep(0.015, 0.032, segment(p, a, b)));
      links += (1.0 - smoothstep(0.93, 1.25, length(a - c))) * (1.0 - smoothstep(0.015, 0.032, segment(p, a, c)));
      float point = 1.0 - smoothstep(0.016, 0.057, length(p - a));
      light = max(light, links * 0.25 + 0.64 * point);
    }
  }
  return light;
}

float glitterField(vec2 p, float time) {
  float column = floor(p.x);
  float shift = hash21(vec2(column, 19.4));
  p.y += time * (1.0 + 2.2 * shift) + 59.4 * shift;
  vec2 id = floor(p);
  float seed = hash21(id);
  vec2 target = vec2(0.26 + 0.48 * hash21(id + 6.9), 0.50);
  float d = length((fract(p) - target) * vec2(1.0, 0.81 + 0.67 * seed));
  float sparkle = 0.43 + 0.57 * abs(sin(time * (1.8 + 3.9 * seed) + 54.0 * seed));
  return (1.0 - smoothstep(0.022, 0.115, d)) * smoothstep(0.60, 1.0, seed) * sparkle;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  // Keep texture details proportional on portrait phones and wide cinema screens.
  vec2 p = (uv - 0.5) * vec2(clamp(uSize.x / uSize.y, 0.7, 2.8), 1.0);
  float t = uTime * 0.10;
  float density = 0.0;
  float highlight = 0.0;
  float particles = 0.0;
  float palette = smoothstep(0.12, 0.90, uv.x);

  if (uShape < 1.5) {
    // Drift and turbulence are evaluated continuously, without a visible loop seam.
    vec2 q = p * vec2(3.2, 4.3) + vec2(uSeed, 0.0);
    vec2 flow = vec2(
      cloud(q * 0.85 + vec2(t * 0.43, -t * 0.37)),
      cloud(q * 0.85 + vec2(5.1 - t * 0.32, 2.4 + t * 0.45))
    );
    float mist = cloud(q + 3.7 * flow + vec2(0.29 * t, -0.66 * t));
    float filament = noise2(q * 5.7 + 8.3 * flow - vec2(t * 0.4, t * 1.2));
    density = smoothstep(0.24, 0.84, mist + (uShape < 0.5 ? 0.081 : 0.021));
    highlight = pow(clamp(density, 0.0, 1.0), 3.0) * (0.4 + 0.7 * filament);
    palette = clamp(palette * 0.84 + (flow.x - flow.y) * 0.62 + 0.09, 0.0, 1.0);
  } else if (uShape < 2.5) {
    // Translucent ribbons pull forward and fall away independently.
    float swell = 0.17 * sin(4.4 * p.x + t) + 0.085 * sin(8.1 * p.x - t * 0.57);
    float grain = cloud(p * vec2(5.0, 9.0) + vec2(uSeed + t * 0.52, -t * 0.27));
    float filament = sin(p.y * 37.0 + 6.0 * grain + 2.5 * sin(p.x * 4.0 - t));
    float r1 = exp(-16.0 * abs(p.y + swell - 0.17 + grain * 0.16));
    float r2 = exp(-19.0 * abs(p.y - swell + 0.16 - grain * 0.14));
    float r3 = exp(-25.0 * abs(p.y + 0.9 * swell + 0.29 + grain * 0.08));
    density = (0.72 * r1 + 0.82 * r2 + 0.38 * r3) * (0.44 + 0.40 * grain);
    highlight = pow(0.5 + 0.5 * filament, 7.0) * density * 0.68;
    palette = smoothstep(0.03, 0.97, uv.x + swell);
  } else if (uShape < 3.5) {
    // A dust lane and fine stars sit behind the glowing nebula edge.
    vec2 q = tilt * p * 4.1 + vec2(uSeed, uSeed * 0.11);
    float warp = cloud(q + vec2(t * 0.35, -t * 0.21));
    float mist = cloud(q + vec2(3.8, -2.9) * warp + vec2(-t * 0.13, t * 0.11));
    float lane = exp(-4.1 * abs(p.y - 0.23 * sin(3.8 * p.x + uSeed) + 0.65 * (warp - 0.5)));
    density = pow(mist, 2.1) * (0.47 + 1.7 * lane);
    highlight = pow(mist, 5.1) * (0.5 + 2.7 * lane);
    palette = clamp(mix(palette, warp, 0.46) + (mist - warp) * 0.85, 0.0, 1.0);
    particles = 0.77 * starField(p + vec2(uSeed, uSeed * 0.13), t);
  } else if (uShape < 4.5) {
    // Light circulates around a tilted, vertically compressed accretion disk.
    vec2 orbit = mat2(0.96, -0.28, 0.28, 0.96)
      * (p - vec2(0.28 * sin(uSeed), -0.07));
    orbit *= vec2(1.03, 2.4 + 0.35 * cos(uSeed));
    float radius = length(orbit);
    float angle = atan(orbit.y, orbit.x + 0.00001);
    float texture = cloud(vec2(cos(angle + t * 0.73), sin(angle + t * 0.73)) * 3.1
      + vec2(radius * 4.4 + uSeed, -radius * 2.7));
    float wrap = radius - 0.61 + 0.1 * texture + 0.027 * sin(4.0 * angle - t);
    float filament = sin(wrap * 56.0 - 2.5 * angle - 2.4 * t + 5.0 * texture);
    float disk = exp(-4.2 * abs(wrap)) * smoothstep(0.25, 0.64, radius);
    density = disk * (0.4 + 0.7 * texture);
    highlight = disk * (0.25 + 0.74 * pow(0.5 + 0.5 * filament, 9.0));
    palette = smoothstep(-0.73, 0.58, orbit.x + (texture - 0.5) * 1.8);
    particles = 0.44 * starField(p + vec2(uSeed, uSeed * 0.13), t);
  } else if (uShape < 5.5) {
    float bend = p.y + 0.12 * noise2(p * 3.9 + t * 0.25);
    float scan = cloud(vec2(p.x * 3.7 + uSeed, bend * 8.8 - t * 0.62));
    float fringe = noise2(vec2(p.x * 15.0 + t * 1.2, bend * 9.0 + uSeed));
    float horizon = exp(-7.4 * abs(bend + 0.09));
    density = (0.34 + horizon * 1.1) * scan * scan;
    highlight = pow(horizon, 4.1) * (0.2 + 0.42 * fringe);
    palette = clamp(palette + (scan - 0.48) * 0.8, 0.0, 1.0);
    particles = 0.58 * starField(p + vec2(uSeed, uSeed * 0.13), t);
  } else if (uShape < 6.5) {
    // Soft, directional light across the darker fabrics and smoke modes.
    vec2 q = p * vec2(4.7, 5.2) + vec2(uSeed, 0.0);
    float folds = cloud(q + vec2(t * 0.21, t * 0.15));
    float crest = sin(q.x * 3.0 + 3.5 * folds + t * 0.5);
    density = smoothstep(0.26, 0.85, folds) * (0.55 + crest * 0.22);
    highlight = pow(0.5 + 0.5 * crest, 8.0) * density * 0.36;
    palette = clamp(palette + 0.29 * crest, 0.0, 1.0);
  } else if (uShape < 7.5) {
    // The projection's cone is lit by drifting dust and the spill on the floor.
    vec2 lamp = vec2(-0.67, 0.27);
    float depth = max(0.0, p.x - lamp.x);
    float axis = lamp.y - depth * (0.14 + 0.026 * sin(t));
    float cone = (1.0 - smoothstep(0.018 + depth * 0.14, 0.045 + depth * 0.25, abs(p.y - axis)))
      * smoothstep(-0.018, 0.014, p.x - lamp.x);
    float dust = cloud(p * 6.4 + vec2(t * 0.5, -t * 0.16));
    float floorGlow = exp(-44.0 * abs(p.y + 0.34)) * exp(-1.15 * abs(p.x - 0.24));
    density = cone * exp(-1.65 * depth) * (0.20 + 0.52 * dust) + 0.28 * floorGlow;
    highlight = 0.41 * exp(-23.0 * length((p - lamp) * vec2(0.69, 1.5))) + 0.22 * floorGlow;
    particles = 0.11 * cone * starField(p + vec2(0.0, t * 0.018), t);
  } else if (uShape < 8.5) {
    vec2 grid = p * 10.0 + vec2(uSeed, uSeed * 0.13);
    float nodes = connectedField(grid, t * 0.72);
    density = 0.2 * cloud(p * 4.6 + vec2(t * 0.14, uSeed));
    highlight = nodes;
  } else if (uShape < 9.5) {
    // Moving surface ripples refract wide beams and leave caustics on the floor.
    float flow = cloud(p * vec2(4.4, 5.2) - vec2(0.29 * t, 0.23 * t));
    float rays = pow(0.5 + 0.5 * cos(16.0 * (p.x - p.y * 0.62)
      + 4.0 * flow + 0.51 * t), 3.4);
    float floorFog = 1.0 - smoothstep(0.0, 0.12, abs(p.y + 0.30));
    float caustics = pow(0.5 + 0.5 * sin(11.0 * p.x + 3.0 * flow + 2.0 * t)
      * sin(35.0 * p.y - 6.0 * flow - t), 5.0);
    density = 0.26 * flow + 0.52 * rays * (0.3 + uv.y * 0.7);
    highlight = 0.35 * caustics * floorFog + 0.12 * rays * uv.y;
    particles = 0.17 * starField(p + vec2(t * 0.013, -t * 0.023), t);
  } else if (uShape < 10.5) {
    // The nearer particles fall faster. The ground catches a faded reflection.
    vec2 area = p;
    bool reflection = p.y < -0.33;
    if (reflection) area.y = -0.66 - p.y;
    float near = glitterField(area * vec2(33.0, 48.0) + uSeed, 2.3 * t);
    float far = glitterField(area * vec2(62.0, 78.0) + 3.2, 1.45 * t);
    float curtain = pow(0.5 + 0.5 * sin(17.0 * p.x + t * 0.43), 4.0);
    float glow = exp(-7.0 * abs(p.y + 0.33));
    density = (0.14 + 0.36 * glow) * (0.22 + 0.68 * curtain);
    highlight = (0.77 * near + 0.54 * far) * (reflection ? 0.23 : 1.0);
  } else if (uShape < 11.5) {
    // Two tilted bands orbit the same core at different speeds.
    vec2 a = tilt * p;
    vec2 b = p * tilt;
    float orbitA = abs(length(a * vec2(1.0, 3.4)) - 0.58);
    float orbitB = abs(length(b * vec2(1.0, 2.8)) - 0.74);
    float bandA = exp(-19.0 * orbitA);
    float bandB = exp(-15.0 * orbitB);
    float flare = exp(-9.5 * length(p));
    float grain = cloud(5.9 * p + vec2(-t * 0.6, t * 0.84));
    density = (bandA + bandB) * (0.12 + 0.48 * grain);
    highlight = 0.43 * flare + 0.25 * (bandA + bandB) * grain;
    particles = 0.37 * starField(p + uSeed, t);
  } else {
    // Flowing points trace the moving ribbons above a dark floor.
    float trail = p.y + 0.18 * sin(3.8 * p.x + t) + 0.075 * sin(8.1 * p.x - 0.7 * t);
    float band = exp(-12.0 * abs(trail + 0.10));
    float second = exp(-23.0 * abs(trail - 0.08));
    density = 0.55 * band + 0.28 * second;
    highlight = (band + 0.47 * second) * glitterField(vec2(trail * 34.0, p.x * 44.0), 2.1 * t);
  }

  vec3 ink = mix(uPrimary, uSecondary, palette);
  vec3 col = vec3(0.016, 0.013, 0.026);
  col += uLight * (density * ink * 1.36 + highlight * uAccent * 0.82);
  col += uLight * particles * mix(uAccent, vec3(0.82, 0.91, 1.0), 0.56);
  float vignette = 1.0 - 0.47 * smoothstep(0.25, 0.76, length(uv - 0.5));
  float seatShade = mix(0.77, 1.0, smoothstep(0.0, 0.43, uv.y));
  gl_FragColor = vec4((1.0 - exp(-col * 1.6)) * vignette * seatShade, 1.0);
}
`;

export interface ShaderPreset {
  id: number;
  colors: readonly [string, string, string];
  shape: number;
  light: number;
}

function compile(gl: WebGLRenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function color(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Render a small, scaled background. Graphics capability is optional. */
export function createHeroBackgroundRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const dispose = () => {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
  };
  if (!vertex || !fragment || !program || !buffer) {
    dispose();
    return null;
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    dispose();
    return null;
  }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniforms = {
    size: gl.getUniformLocation(program, 'uSize'),
    time: gl.getUniformLocation(program, 'uTime'),
    seed: gl.getUniformLocation(program, 'uSeed'),
    shape: gl.getUniformLocation(program, 'uShape'),
    light: gl.getUniformLocation(program, 'uLight'),
    primary: gl.getUniformLocation(program, 'uPrimary'),
    secondary: gl.getUniformLocation(program, 'uSecondary'),
    accent: gl.getUniformLocation(program, 'uAccent'),
  };

  return {
    setPreset(preset: ShaderPreset) {
      const [primary, secondary, accent] = preset.colors.map(color);
      gl.uniform1f(uniforms.seed, preset.id * 1.89);
      gl.uniform1f(uniforms.shape, preset.shape);
      gl.uniform1f(uniforms.light, preset.light);
      gl.uniform3f(uniforms.primary, ...primary);
      gl.uniform3f(uniforms.secondary, ...secondary);
      gl.uniform3f(uniforms.accent, ...accent);
    },
    draw(seconds: number) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.size, canvas.width, canvas.height);
      gl.uniform1f(uniforms.time, seconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose,
  };
}
