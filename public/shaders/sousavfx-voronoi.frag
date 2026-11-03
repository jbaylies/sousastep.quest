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
// n * golden angle, at distance sqrt(n / (u_count - 1)) from the center. The
// golden angle arrives split (hi, lo) for precision, as in the index shader.
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
// divisions in case 0, cycles per 200 sites out from the centre in case 1 —
// from the centre to the rim at the default 201 points), and the
// shared `rotationNormalized` term that follows the switch in the C++ is
// `u_rot` here. The C++ case 2 (coordinate-based) is commented out upstream
// too, so it is not ported.
//
// The palette position follows `totalPhase` too, like the C++'s
// `angleOffsets[i]` feeding divisionPalette(): around the ring in case 0, out
// from the centre in case 1. Unlike the C++ it leaves out the rotation term
// (so the colors stay put while the divisions sweep through them) and runs
// the other way round; u_palPhase plays the part of `gradientOffset`.
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
uniform vec2 u_golden;     // golden angle in turns, split (hi, lo)
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

  float rad = sqrt(n / (u_count - 1.0)); // distance from the center, 0..1
  float ang = fract(fract(n * u_golden.x) + n * u_golden.y); // turns, 0..1 like angleshirez / 360

  // indexFromCenter: `swapindex[i] * oneIndex` in the C++, where oneIndex is a
  // fixed 1/200 rather than 1/(count - 1). Like the angle, it depends only on
  // the site's index, so the pattern stays attached to the sites and zooms
  // with them as the point count changes (it matches 0..1 at 201 points).
  float indexFromCenter = n / 200.0;

  // the switch: case 0 uses the site's angle, case 1 its index from the centre
  float totalPhase = mix(ang, indexFromCenter, u_maskType) * u_divisions;
  float phase = fract(totalPhase + u_rot);
  float glow = divisionMask(phase) * (1.0 - smoothstep(0.7, 1.15, rad));

  // the palette follows the mask's phase (see the note at the top); +1/32
  // lands on texel centers (entry i at i/16)
  float palPos = fract(totalPhase + u_palPhase);
  vec3 lit = texture2D(u_palette, vec2(palPos + 0.03125, 0.5)).rgb;
  vec3 base = vec3(0.082, 0.106, 0.149); // #151b26

  // the cell takes the color of its site on the ring pattern, only; lit cells
  // also bloom with their own palette color around the site (baked halo)
  vec3 col = mix(base, lit, glow * 0.42) + lit * (glow * idxTex.a * 0.20);

  // faint cell silhouette from the gap to the second-nearest site
  col *= 0.88 + 0.12 * idxTex.b;

  gl_FragColor = vec4(col, 1.0);
}
