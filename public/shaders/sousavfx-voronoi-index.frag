// Phyllotaxis Voronoi shader — pass 1 (one-time index map).
//
// The 200 phyllotaxis sites never move, so the voronoi partition (which site is
// nearest to each pixel) is STATIC. This shader renders that partition once into
// an offscreen RGBA8 texture; the per-frame pass 2 shader (sousavfx-voronoi.frag)
// just samples this texture instead of looping over all 200 sites, which makes
// full-resolution (device-pixel) rendering cheap.
//
// Texture layout (RGBA8, 1:1 with the canvas):
//   R = nearest site index / 255.0   (exact for 0..255)
//   G = unused
//   B = cell silhouette smoothstep(0.02, 0.09, d2 - d1)  (static, 0..1)
//   A = unused
//
// We store the site INDEX, not its position: 8-bit is exact for 0..199, and
// pass 2 reconstructs the exact position from the index via the phyllotaxis
// formula (storing a quantized position would shift cell colors near the center
// where the ring color is angle-sensitive).
#ifdef GL_ES
precision highp float;
#endif

uniform vec2 resolution;

const int N = 200;

uniform vec2 u_sites[N];

void main(void) {
  // centered, aspect-corrected coordinates, same space as the sites (radius 0..1)
  vec2 p = (2.0 * gl_FragCoord.xy - resolution.xy) / resolution.y;

  // nearest and second-nearest site (voronoi), squared distances for speed
  float d1s = 1e20;
  float d2s = 1e20;
  int best = 0;
  for (int i = 0; i < N; i++) {
    vec2 d = p - u_sites[i];
    float ds = dot(d, d);
    if (ds < d1s) {
      d2s = d1s;
      d1s = ds;
      best = i;
    } else if (ds < d2s) {
      d2s = ds;
    }
  }
  float d1 = sqrt(d1s);
  float d2 = sqrt(d2s);

  gl_FragColor = vec4(float(best) / 255.0, 0.0, smoothstep(0.02, 0.09, d2 - d1), 1.0);
}
