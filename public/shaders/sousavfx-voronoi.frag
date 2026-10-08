// Phyllotaxis Voronoi shader — pass 2 (per-frame color pass).
//
// The static voronoi partition (which of the 200 phyllotaxis sites is nearest to
// each pixel) is precomputed ONCE into an index texture by
// `sousavfx-voronoi-index.frag`; this shader samples that texture for the nearest
// site's INDEX, reconstructs its exact position from the phyllotaxis formula
// (r = sqrt((i+.5)/N) on the golden-angle spiral), and evaluates the `ringCell`
// color there. Per-frame cost is one texture sample + a palette lookup instead
// of a 200-site loop, so the background can render at full device-pixel
// resolution cheaply.
//
// The canvas spans the FULL PAGE (absolute, behind the content) for the scroll
// parallax: `resolution` stays the VIEWPORT size in device pixels, so the
// spiral keeps its scale and its center at the initial viewport center, while
// `u_offset` (device px, = (1 - parallax) * scrollY * dpr) shifts the pattern's
// coordinate space as the page scrolls. The pattern therefore moves with the
// page at `parallax` times the scroll speed (slower than the text).
//
// Index texture (RGBA8, 1:1 with the canvas, one texel per canvas pixel):
//   R = nearest site index / 255.0
//   B = cell silhouette smoothstep(0.02, 0.09, d2 - d1)   (static)
// It is sampled in the SAME shifted coordinate space, so cell boundaries stay
// crisp (and the 1:1 mapping is preserved) at any scroll position.
//
// Each cell is colored ONLY by the color that the `sousavfx.frag` ring shader
// evaluates at its point, so the background looks like discretized LEDs wrapped
// around the ring pattern. Subtle page background.
//
// The ring's `divisions` and `rot` parameters are normally functions of `time`.
// The links-page control panel can freeze either of them at a value it
// supplies, via u_lock (0 = time equation, 1 = u_params). The panel's speed
// slider is applied to `time` itself in the render loop (public/js/vfx.js), so
// it needs no uniform here.
//
// `u_maskType` ports the `params.maskType` switch from the SousaVFX C++ that
// drives the hardware LED ring:
//   case 0: angle-based divisions (`angleshirez[i] * phaseMultAngle`) — the
//           original effect, which has a seam where the angle wraps;
//   case 1: index-from-center based (`indexFromCenter[i] * phaseMultIndex`) —
//           Jason Coon's seam-free variant.
// `divisions` plays the role of the phase multiplier in both cases (angular
// divisions in case 0, cycles from the centre to the rim in case 1), and the
// shared `rotationNormalized + radHiRez * curveNormalized` term that follows the
// switch in the C++ is `rot` here (the old `curve` term was removed). The C++
// case 2 (coordinate-based) is commented out upstream too, so it is not ported.
#ifdef GL_ES
precision highp float;
#endif

uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;  // viewport size in device px — pattern scale & center
uniform vec2 u_indexRes;  // index-map (canvas) size in device px — full page
uniform vec2 u_offset;    // device-px pattern shift: (0, (1 - parallax) * scrollY * dpr)

// Manual overrides from the links-page control panel: u_lock is 1 where a
// slider owns the parameter, and u_params carries (divisions, rot).
uniform vec2 u_lock;
uniform vec2 u_params;

// Mask mode, from the links-page toggle: 0 = angle-based (case 0 above),
// 1 = index-from-center based (case 1). Interpolated rather than branched so
// the modes blend without dynamic branching in the fragment shader.
uniform float u_maskType;

uniform sampler2D u_indexMap;

const int N = 200;
const float GOLDEN = 2.399963229728653;

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

// the `sousavfx.frag` ring pattern evaluated at one point. The mask is either
// angle based (pinwheel wedges, case 0) or index-from-center based (concentric
// rings, case 1, seam-free) — see u_maskType. Returns the cell value, plus the
// raw palette color and glow at that point so lit cells can radiate a halo.
struct Cell {
  vec3 color; // final cell color (palette blended into the page background)
  vec3 lit;   // raw palette color at the site, for the glow
  float glow; // division mask intensity 0..1 at the site
};

// indexFromCenter: the site's LED index measured from the centre, normalized to
// 0..1 (`indexFromCenter[i]` in the C++, i.e. position along the phyllotaxis
// spiral). Only used by mask case 1.
Cell ringCell(vec2 q, float indexFromCenter) {
  float rad = length(q);
  float ang = atan(q.y, q.x); // -PI .. PI

  // divisions start 46, head down to 5, sweep up to 89 and back, ~20 min
  float divisions = 47.0 - 42.0 * sin(time * 0.02536 + 0.0238);
  float rot = fract(time * -0.16);

  // a locked slider replaces the time-driven value (u_lock = 0 keeps it)
  divisions = mix(divisions, u_params.x, u_lock.x);
  rot = mix(rot, u_params.y, u_lock.y);

  // the switch: case 0 uses the site's angle, case 1 its index from the centre
  float totalPhase = mix(ang / 6.28318530718 * divisions, indexFromCenter * divisions, u_maskType);
  float phase = fract(totalPhase + rot);
  float glow = divisionMask(phase) * (1.0 - smoothstep(0.7, 1.15, rad));

  vec3 paletteCol = palette(fract(ang / 6.28318530718 * divisions + time * 0.008));
  vec3 base = vec3(0.082, 0.106, 0.149); // #151b26

  Cell c;
  c.color = mix(base, paletteCol, glow * 0.42);
  c.lit = paletteCol;
  c.glow = glow;
  return c;
}

void main(void) {
  // parallax: shift the whole pattern (and its index-map sampling) by u_offset.
  // At scroll 0 the offset is 0, so the spiral sits exactly where it always has;
  // scrolling slides the pattern by (1 - parallax) per pixel of scroll, i.e. the
  // background trails the text instead of scrolling at full speed.
  vec2 coord = gl_FragCoord.xy - u_offset;

  // centered, aspect-corrected coordinates, same space as the sites (radius 0..1)
  vec2 p = (2.0 * coord - resolution.xy) / resolution.y;

  // nearest site from the precomputed index map (1:1 texel mapping, so the
  // cell boundaries are exactly as crisp as the index map itself). The index is
  // exact in 8 bits; reconstruct the site position from the phyllotaxis formula
  // so it is exact too (no quantization, which would tint cells near the center
  // where the ring color is angle-sensitive).
  vec2 uv = coord / u_indexRes;
  vec4 idxTex = texture2D(u_indexMap, uv);
  int best = int(floor(idxTex.r * 255.0 + 0.5));
  float fi = float(best);
  float rad = sqrt((fi + 0.5) / float(N));
  float ang = fi * GOLDEN;
  vec2 bestPos = vec2(rad * cos(ang), rad * sin(ang));

  // the cell takes the color of its point on the current shader, only. The
  // `indexFromCenter` argument feeds mask case 1 (seam-free rings); the palette
  // stays angle-based in both modes, as only `totalPhase` is switched upstream.
  Cell cell = ringCell(bestPos, (fi + 0.5) / float(N));

  // halo: lit cells bloom with their own palette color, fading with distance
  // from the cell center (gaussian, sigma ~ cell spacing)
  float d1 = length(p - bestPos);
  float halo = cell.glow * exp(-(d1 * d1) / (2.0 * 0.14 * 0.14));
  vec3 col = cell.color + cell.lit * halo * 0.20;

  // faint cell silhouette from the gap to the second-nearest point (precomputed
  // into the index texture; the value is a smooth 0..1 so 8-bit storage is fine)
  col *= 0.88 + 0.12 * idxTex.b;

  gl_FragColor = vec4(col, 1.0);
}
