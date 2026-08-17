// SousaVFX pinwheel shader — a faithful GLSL port of the pattern in
// SousaVFX/SousaVFX.ino, using maskType case 1 (indexFromCenter): each
// "LED" (pixel) gets a phase = indexFromCenter * divisions (concentric
// rings instead of angular wedges — no seam), plus rotation and a radius
// curve term. Every division fades in/out triangularly, the rotation sweeps
// one division per cycle (the moire period), and the color travels along the
// same radial phase like angleOffsets[] in the firmware. Colors come from
// the es_ocean_breeze_036_gp palette. Subtle page background via shadify.
#ifdef GL_ES
precision highp float;
#endif

uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;

// es_ocean_breeze_036_gp (SousaVFX/palettes.h), stops 0/89/153/255
vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 255.0;
  vec3 c0 = vec3(1.0, 6.0, 7.0) / 255.0;
  vec3 c1 = vec3(1.0, 99.0, 111.0) / 255.0;
  vec3 c2 = vec3(144.0, 209.0, 255.0) / 255.0;
  vec3 c3 = vec3(0.0, 73.0, 82.0) / 255.0;
  if (t < 89.0) return mix(c0, c1, t / 89.0);
  if (t < 153.0) return mix(c1, c2, (t - 89.0) / 64.0);
  return mix(c2, c3, (t - 153.0) / 102.0);
}

// Triangular fade through the lit part of a division
// (divisionWidth = 126/253 from the SousaVFX defaults)
float divisionMask(float p) {
  const float width = 0.498;
  const float peak = width * 0.5;
  float tri = p < peak ? p / peak : (1.0 - (p - peak) / (width - peak));
  return clamp(tri, 0.0, 1.0);
}

void main(void) {
  // Centered, aspect-corrected coordinates; radius 1.0 spans the viewport height.
  vec2 p = (2.0 * gl_FragCoord.xy - resolution.xy) / resolution.y;
  float rad = length(p);

  // --- SousaVFX params, animated slowly for a subtle background ---
  // divisions start 46, head down to 5, sweep up to 89 and back, ~20 min
  float divisions = 47.0 - 42.0 * sin(time * 0.005236 + 0.0238);
  // rotation sweeps one "division length" per ~75 s, like the controller does
  float rot = fract(time * 0.012);
  // division curve twists the division borders with radius
  float curve = 0.2 + 0.25 * sin(time * 0.02);

  // indexFromCenter, normalized: 0 at the bell's center, 1 at the edge
  float idx = clamp(rad, 0.0, 1.0);

  // maskType 1 phase: divisions slice the radius into concentric rings;
  // rotation shifts the rings outward, the curve distorts their spacing
  float phase = fract(idx * divisions + rot + curve * idx);

  // palette index travels on the same radial phase (angleOffsets[i] in case 1), plus a slow drift
  float col = fract(idx * divisions + time * 0.008);
  vec3 color = palette(col);

  // triangular division fade, then fade out toward the edge of the disc
  float glow = divisionMask(phase) * (1.0 - smoothstep(0.7, 1.15, rad));

  // subtle: blend the palette into the page background, pulled well down
  vec3 base = vec3(0.082, 0.106, 0.149); // #151b26
  vec3 outC = mix(base, color, glow * 0.42);

  gl_FragColor = vec4(outC, 1.0);
}