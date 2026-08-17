// Phyllotaxis Voronoi shader — 200 points on a golden-angle (Fibonacci) spiral
// form the cells of a voronoi over the viewport. Each cell is colored ONLY by
// the color that the `sousavfx.frag` ring shader evaluates at its point, so the
// background looks like discretized LEDs wrapped around the ring pattern.
// Subtle page background for shadify.
//
// The sites are computed once on the CPU (see public/js/script.js) and passed
// in as u_sites so the fragment shader never evaluates cos/sin per pixel.
#ifdef GL_ES
precision highp float;
#endif

uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;

const int N = 200;

uniform vec2 u_sites[N];

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
float divisionMask(float p) {
  const float width = 0.498;
  const float peak = width * 0.5;
  float tri = p < peak ? p / peak : (1.0 - (p - peak) / (width - peak));
  return clamp(tri, 0.0, 1.0);
}

// the `sousavfx.frag` ring pattern evaluated at one point (maskType 0, angle
// based — pinwheel wedges). Returns the cell value, plus the raw palette color
// and glow at that point so lit cells can radiate a halo.
struct Cell {
  vec3 color; // final cell color (palette blended into the page background)
  vec3 lit;   // raw palette color at the site, for the glow
  float glow; // division mask intensity 0..1 at the site
};

Cell ringCell(vec2 q) {
  float rad = length(q);
  float ang = atan(q.y, q.x); // -PI .. PI

  // divisions start 46, head down to 5, sweep up to 89 and back, ~20 min
  float divisions = 47.0 - 42.0 * sin(time * 0.005236 + 0.0238);
  float rot = fract(time * 0.012);
  float curve = 0.2 + 0.25 * sin(time * 0.02);

  float phase = fract(ang / 6.28318530718 * divisions + rot + curve * (rad - 0.85));
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
  // centered, aspect-corrected coordinates, same space as the sites (radius 0..1)
  vec2 p = (2.0 * gl_FragCoord.xy - resolution.xy) / resolution.y;

  // nearest and second-nearest site (voronoi), squared distances for speed
  float d1s = 1e20;
  float d2s = 1e20;
  vec2 best = u_sites[0];
  for (int i = 0; i < N; i++) {
    vec2 d = p - u_sites[i];
    float ds = dot(d, d);
    if (ds < d1s) {
      d2s = d1s;
      d1s = ds;
      best = u_sites[i];
    } else if (ds < d2s) {
      d2s = ds;
    }
  }
  float d1 = sqrt(d1s);
  float d2 = sqrt(d2s);

  // the cell takes the color of its point on the current shader, only
  Cell cell = ringCell(best);

  // halo: lit cells bloom with their own palette color, fading with distance
  // from the cell center (gaussian, sigma ~ cell spacing)
  float halo = cell.glow * exp(-(d1 * d1) / (2.0 * 0.14 * 0.14));
  vec3 col = cell.color + cell.lit * halo * 0.20;

  // faint cell silhouette from the gap to the second-nearest point
  col *= 0.88 + 0.12 * smoothstep(0.02, 0.09, d2 - d1);

  gl_FragColor = vec4(col, 1.0);
}