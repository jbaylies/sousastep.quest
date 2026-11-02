// Phyllotaxis Voronoi shader — pass 2 (per-frame color pass).
//
// The voronoi partition (which phyllotaxis site is nearest to each pixel) is
// cached in an index texture by `sousavfx-voronoi-index.frag`, which also bakes
// in each pixel's cell silhouette and halo falloff. This shader samples it for
// the nearest site's INDEX and evaluates the `ringCell` color of that site.
// Per-frame cost is two texture samples and a little arithmetic per pixel, so
// the background renders at full device-pixel resolution cheaply.
//
// The canvas is fixed to the viewport; `u_mapOffset` (device px) maps a
// viewport pixel to its index-map position for the current scroll, which is
// how the scroll parallax works (see vfx.js), and `u_mapInvSize` turns that
// into texture coordinates. Only the visible part of the page is ever shaded.
//
// Index texture (RGBA8):
//   R, G = nearest site index, low and high byte
//   B    = cell silhouette (static)
//   A    = halo falloff around the site (static)
//
// Each cell is colored ONLY by the ring pattern evaluated at its site, so the
// background looks like discretized LEDs wrapped around the ring pattern. The
// site's angle and index-from-center come from the same formula as
// buildCoordinateMaps() in SousaVFX/coordinate_maps.h: site n sits at
// n * u_golden turns, at distance sqrt(n / (u_count - 1)) from the center.
//
// The per-frame values (divisions, rotation, palette phase) are worked out in
// vfx.js, which integrates them over time so the speed slider changes their
// rate smoothly instead of jumping them.
//
// `u_maskType` ports the `params.maskType` switch from the SousaVFX C++ that
// drives the hardware LED ring (pinwheel_mask.h):
//   case 0: angle-based divisions (`angleshirez[i] * phaseMultAngle`) — the
//           original effect, which has a seam where the angle wraps;
//   case 1: index-from-center based (`indexFromCenter[i] * phaseMultIndex`) —
//           Jason Coon's seam-free variant.
// `u_divisions` plays the role of the phase multiplier in both cases (angular
// divisions in case 0, cycles from the centre to the rim in case 1), and the
// shared `rotationNormalized` term that follows the switch in the C++ is
// `u_rot` here. The C++ case 2 (coordinate-based) is commented out upstream
// too, so it is not ported.
//
// The palette is a 16-entry texture built by vfx.js from OKLCH stops, the way
// palette_blend.h builds currentPalette. Linear filtering with REPEAT wrap
// blends neighbouring entries (and entry 15 back into entry 0) like FastLED's
// ColorFromPalette.
#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_mapOffset;  // device px from a viewport pixel to its index-map position
uniform vec2 u_mapInvSize; // index-map texels per device px / map size
uniform sampler2D u_indexMap;
uniform sampler2D u_palette;

uniform float u_count;     // number of sites (NUM_FIB_POINTS)
uniform float u_golden;    // golden angle in turns
uniform float u_divisions;
uniform float u_rot;       // rotation, in division lengths (0..1)
uniform float u_palPhase;  // palette scroll (0..1)

// Mask mode, from the links-page toggle: 0 = angle-based (case 0 above),
// 1 = index-from-center based (case 1). Interpolated rather than branched.
uniform float u_maskType;

// Triangular fade through the lit part of a division (divisionWidth = 126/253)
float smootherstep(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

float divisionMask(float p) {
  const float width = 0.498;
  const float peak = width * 0.5;
  float tri = p < peak ? p / peak : (1.0 - (p - peak) / (width - peak));
  tri = clamp(tri, 0.0, 1.0);
  return smootherstep(tri);
}

void main(void) {
  vec4 idxTex = texture2D(u_indexMap, (gl_FragCoord.xy + u_mapOffset) * u_mapInvSize);
  float n = floor(idxTex.r * 255.0 + 0.5) + 256.0 * floor(idxTex.g * 255.0 + 0.5);

  // indexFromCenter: the site's index normalized to 0..1 (`swapindex[i] *
  // oneIndex` in the C++), which is also its squared distance from the center
  float indexFromCenter = n / (u_count - 1.0);
  float rad = sqrt(indexFromCenter);
  float ang = fract(n * u_golden); // turns, 0..1 like angleshirez / 360

  // the switch: case 0 uses the site's angle, case 1 its index from the centre
  float totalPhase = mix(ang, indexFromCenter, u_maskType) * u_divisions;
  float phase = fract(totalPhase + u_rot);
  float glow = divisionMask(phase) * (1.0 - smoothstep(0.7, 1.15, rad));

  // the palette stays angle-based in both modes, as only `totalPhase` is
  // switched upstream; +1/32 lands on texel centers (entry i at i/16)
  float palPos = fract(ang * u_divisions + u_palPhase);
  vec3 lit = texture2D(u_palette, vec2(palPos + 0.03125, 0.5)).rgb;
  vec3 base = vec3(0.082, 0.106, 0.149); // #151b26

  // the cell takes the color of its site on the ring pattern, only; lit cells
  // also bloom with their own palette color around the site (baked halo)
  vec3 col = mix(base, lit, glow * 0.42) + lit * (glow * idxTex.a * 0.20);

  // faint cell silhouette from the gap to the second-nearest site
  col *= 0.88 + 0.12 * idxTex.b;

  gl_FragColor = vec4(col, 1.0);
}
