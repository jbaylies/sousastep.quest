// Phyllotaxis Voronoi shader — pass 1 (index map, rebuilt only on change).
//
// The phyllotaxis sites only move when the spiral itself changes (point count
// or phi's discriminant), so the voronoi partition (which site is nearest to
// each pixel) is cached in an offscreen RGBA8 texture. The per-frame pass 2
// shader (sousavfx-voronoi.frag) samples it instead of searching the sites.
//
// The sites follow buildCoordinateMaps() in SousaVFX/coordinate_maps.h: site n
// (0 .. u_count - 1, 0 being the center) sits at angle n * golden angle and at
// distance sqrt(n) / sqrt(u_count - 1) from the center, so the outermost site
// is at radius 1. The golden angle comes from phi = (1 + sqrt(D)) / 2, where D
// is the discriminant of x^2 - x - 1 (5 for the real golden ratio); vfx.js
// passes u_golden = 1 - 1/phi in turns, plus its cos/sin for stepping.
//
// Because a site's distance from the center only grows with its index, the
// search starts at the site whose radius matches this pixel's and walks
// outward and inward from there, stopping each way once the sites' radii are
// farther from the pixel's radius than the current second-nearest site. That
// is exact, and it skips most of the sites: outside the spiral (most of a
// tall page) only a handful of outer sites are ever checked.
//
// `resolution` is the VIEWPORT size in device pixels and sets the pattern's
// scale (radius 1 = half the viewport height) and center. The map covers every
// pattern position the scroll parallax can bring on screen (see vfx.js), with
// texel (0, 0) at pattern coordinate u_origin and u_texelSize pattern pixels
// per texel (1, unless the map had to shrink to fit the GPU's texture limit).
//
// Texture layout (RGBA8):
//   R, G = nearest site index, low and high byte   (exact for 0..65535)
//   B    = cell silhouette smoothstep(edge0, edge1, d2 - d1)
//   A    = halo falloff exp(-d1^2 / (2 sigma^2)) around the nearest site
// The silhouette and halo widths scale with the cell spacing (u_cellScale),
// so they look the same at any point count.
#ifdef GL_ES
precision highp float;
#endif

uniform vec2 resolution;   // viewport size in device px — pattern scale & center
uniform vec2 u_origin;     // pattern coordinate (device px) of texel (0, 0)
uniform float u_texelSize; // pattern px per texel
uniform float u_count;     // number of sites (NUM_FIB_POINTS)
uniform float u_golden;    // golden angle in turns
uniform vec2 u_goldenRot;  // (cos, sin) of the golden angle
uniform float u_cellScale; // cell spacing relative to 201 sites

// must cover the largest point count the controls allow
const int MAX_POINTS = 2048;

void main(void) {
  vec2 coord = u_origin + gl_FragCoord.xy * u_texelSize;
  // centered, aspect-corrected coordinates, same space as the sites (radius 0..1)
  vec2 p = (2.0 * coord - resolution.xy) / resolution.y;
  float r = length(p);

  float last = u_count - 1.0;
  float invLast = 1.0 / last;
  float edge1 = 0.09 * u_cellScale;

  // first site to check: the one whose radius sqrt(n / last) matches r
  float n0 = clamp(floor(r * r * last + 0.5), 0.0, last);
  float a0 = 6.28318530718 * fract(n0 * u_golden);
  // `up` walks n0, n0 + 1, ... (rotating by +golden), `dn` walks n0 - 1, ...
  float nUp = n0;
  float nDn = n0 - 1.0;
  vec2 up = vec2(cos(a0), sin(a0));
  vec2 dn = vec2(up.x * u_goldenRot.x + up.y * u_goldenRot.y, up.y * u_goldenRot.x - up.x * u_goldenRot.y);
  bool upDone = false;
  bool dnDone = nDn < 0.0;

  // nearest and second-nearest site, squared distances for speed. `limit` is
  // the squared search radius: the second-nearest distance, or less once the
  // silhouette is already saturated (d2 - d1 > edge1).
  float d1s = 1e20;
  float d2s = 1e20;
  float limit = 1e20;
  float best = 0.0;

  for (int k = 0; k < MAX_POINTS; k++) {
    if (upDone && dnDone) break;

    if (!upDone) {
      float rad = sqrt(nUp * invLast);
      float dr = rad - r;
      if (nUp > last || (dr > 0.0 && dr * dr >= limit)) {
        upDone = true;
      } else {
        vec2 d = p - rad * up;
        float ds = dot(d, d);
        if (ds < d1s) {
          d2s = d1s;
          d1s = ds;
          best = nUp;
        } else if (ds < d2s) {
          d2s = ds;
        }
        nUp += 1.0;
        up = vec2(up.x * u_goldenRot.x - up.y * u_goldenRot.y, up.y * u_goldenRot.x + up.x * u_goldenRot.y);
      }
    }

    if (!dnDone) {
      float rad = sqrt(nDn * invLast);
      float dr = r - rad;
      if (nDn < 0.0 || (dr > 0.0 && dr * dr >= limit)) {
        dnDone = true;
      } else {
        vec2 d = p - rad * dn;
        float ds = dot(d, d);
        if (ds < d1s) {
          d2s = d1s;
          d1s = ds;
          best = nDn;
        } else if (ds < d2s) {
          d2s = ds;
        }
        nDn -= 1.0;
        dn = vec2(dn.x * u_goldenRot.x + dn.y * u_goldenRot.y, dn.y * u_goldenRot.x - dn.x * u_goldenRot.y);
      }
    }

    float reach = sqrt(d1s) + edge1;
    limit = min(d2s, reach * reach);
  }

  float d1 = sqrt(d1s);
  float d2 = sqrt(d2s);
  float sigma = 0.14 * u_cellScale;
  float hi = floor(best / 256.0);
  gl_FragColor = vec4(
    (best - hi * 256.0) / 255.0,
    hi / 255.0,
    smoothstep(0.02 * u_cellScale, edge1, d2 - d1),
    exp(-(d1 * d1) / (2.0 * sigma * sigma))
  );
}
