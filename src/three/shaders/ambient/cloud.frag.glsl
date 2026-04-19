precision mediump float;

uniform float uTime;
uniform float uSeed;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

float h2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float n2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x),
    mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * n2(p);
    p = p * 2.0 + vec2(100.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  float dist = length(uv);
  float mask = pow(1.0 - smoothstep(0.0, 1.0, dist), 1.4);
  if (mask < 0.005) discard;

  float t = uTime * 0.04;
  vec2 q = uv * 2.5 + uSeed * 3.7;

  float nMain = fbm(q + vec2(t * 0.7, t * 0.5));
  float nDetail = fbm(q * 2.2 - vec2(t * 0.3, -t * 0.8) + 40.0) * 0.5 + 0.5;
  float voidN = fbm(q * 1.3 + 70.0);
  float voids = smoothstep(-0.2, 0.3, voidN);
  float knotN = fbm(q * 3.5 + 120.0 + uSeed * 2.0);
  float knots = pow(max(knotN - 0.1, 0.0), 2.2) * 0.6;

  float density = mask * (nMain * 0.6 + 0.4) * (0.65 + nDetail * 0.35) * voids;
  density += knots * mask;

  float edge = smoothstep(0.0, 0.35, mask) * (1.0 - smoothstep(0.65, 1.0, mask));
  density = density * (0.35 + edge * 0.65);

  float cVar = fbm(q * 1.8 + 200.0) * 0.2;
  vec3 col = uColor * (0.8 + cVar * 2.5);
  col = mix(col, uColor * 1.6, knots);

  float alpha = density * 0.8 * uOpacity;
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(col * (0.15 + density * 0.6), alpha);
}
