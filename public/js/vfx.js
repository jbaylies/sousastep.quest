// Full-resolution phyllotaxis voronoi background with scroll parallax.
//
// Two-pass renderer:
//   pass 1 renders the voronoi index map into an offscreen texture
//     (sousavfx-voronoi-index.frag), only when the spiral changes (point count,
//     phi's discriminant) or the page/viewport size does;
//   pass 2 (every frame) samples that texture and evaluates the animated ring
//     color at the nearest site (sousavfx-voronoi.frag).
// Pass 2 never searches the sites, so we can render at full device-pixel
// resolution (devicePixelRatio-aware) — crisp on retina — cheaply.
//
// The canvas is fixed to the viewport, behind the content, so only what is on
// screen is shaded each frame. The shaders' `resolution` is the viewport size,
// which sets the spiral's scale. The pattern is laid out in "pattern space": a
// column as wide as the viewport whose height covers the page. At scroll 0 the
// viewport shows the top of that column and the spiral's center is half a
// viewport above the column's bottom; scrolling moves the viewport down the
// column at (2 - parallax) times the scroll, so the spiral rises through the
// page faster than the text. The index map covers the whole column, so
// scrolling costs nothing extra.
//
// The host element carries the data-* attributes:
//   data-shader           URL of the main (pass 2) fragment shader
//   data-shader-speed     animation speed multiplier (fallback without the panel)
//   data-shader-parallax  scroll parallax factor 0..1; default 0.3
//   data-shader-z-index   z-index for the canvas
//
// The links page also renders a control panel (see _layouts/default.html) whose
// sliders drive the shader parameters. Values ease toward the sliders with the
// same critically damped smoothing palette_blend.h uses, and the animation is
// driven by phases integrated over time, so moving the speed slider changes the
// rate of motion rather than jumping the pattern to a new position.
//   speed         scales the rate of every animated phase (negative = backwards);
//                 starts at 0 when the visitor prefers reduced motion
// Frames where nothing would change (speed 0, nothing easing, no scroll) are
// skipped, so a still background costs no GPU time.
//   divisions     with its lock on, the slider value; off, the time-run sweep
//   points        NUM_FIB_POINTS, the number of phyllotaxis sites
//   discriminant  D in phi = (1 + sqrt(D)) / 2; 5 is the golden ratio
//   hue .. chroma the five OKLCH synth knobs of the SousaVFX Max patch
//                 (oklch_synth_codebox.txt), in CSS-style units
// Below the sliders, a mask-mode toggle drives u_maskType (0 = angle-based
// divisions, 1 = index-from-center divisions, seam-free), off by default. On
// narrow viewports the panel is a bottom sheet opened from a header button.
(function(document) {
  var INDEX_SUFFIX = '-index.frag';
  var VERT = '\n attribute vec2 coords;\n void main(void) {\n   gl_Position = vec4(coords.xy, 0.0, 1.0);\n }\n ';
  var MAX_POINTS = 2048; // must match MAX_POINTS in the index shader
  // cap the index map's size; a taller map is rendered at a lower resolution
  var MAX_MAP_PIXELS = 16e6;
  // skip frames faster than this, so high-refresh displays draw ~60 fps
  var MIN_FRAME_MS = 12;
  // roughly the time to cover 60% of a change; settles in about 3x this
  var SMOOTH_SECONDS = 0.3;
  var BASE_RGB = [21, 27, 38]; // #151b26, also the shader's base color

  // the time-run rates, per unit of `speed` per second
  var ROT_RATE = -0.16;
  var PALETTE_RATE = 0.008;
  var DIVISION_SWEEP_RATE = 0.02536;

  // must match maxPaletteStops / maxStopChroma in SousaVFX/serial_params.h
  var STOP_COUNT = 7;
  var ACHROMATIC_CHROMA = 0.002;

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('vfx shader compile: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }

  function link(gl, fragSrc) {
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('vfx program link: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function clamp01(x) {
    return x < 0 ? 0 : (x > 1 ? 1 : x);
  }

  // Critically damped smoothing, from Game Programming Gems 4, as in
  // palette_blend.h: a new target mid-blend keeps the current velocity, so a
  // dragged slider is followed smoothly. `s` holds {value, velocity}.
  function smoothDamp(s, target, omega, dt, decay) {
    var change = s.value - target;
    var temp = (s.velocity + omega * change) * dt;
    s.velocity = (s.velocity - omega * temp) * decay;
    s.value = target + (change + temp) * decay;
  }

  function smoother(value) {
    return { value: value, velocity: 0 };
  }

  // smoothDamp only approaches its target, so snap once the gap is invisible;
  // a settled value then stops changing and the frame can be skipped
  function smoothTo(s, target, omega, dt, decay, epsilon) {
    smoothDamp(s, target, omega, dt, decay);
    if (Math.abs(s.value - target) < epsilon) {
      s.value = target;
      s.velocity = 0;
    }
  }

  // --- OKLCH palette, ported from SousaVFX (oklch.h, palette_blend.h) and the
  // Max patch's oklch_synth codebox. Hue is in turns (0..1) throughout. ---

  function wrapTurns(h) {
    return h - Math.floor(h);
  }

  function wrapTurnsSigned(dh) {
    return dh - Math.floor(dh + 0.5);
  }

  // Mixes two colors in OKLCH, taking the shorter way around the hue circle; a
  // grey end borrows the other end's hue so the mix only fades chroma.
  function mixOKLCH(a, b, t) {
    var ah = a.h;
    var bh = b.h;
    if (a.C < ACHROMATIC_CHROMA) {
      ah = bh;
    } else if (b.C < ACHROMATIC_CHROMA) {
      bh = ah;
    }
    var dh = wrapTurnsSigned(bh - ah);
    return { L: a.L + (b.L - a.L) * t, C: a.C + (b.C - a.C) * t, h: wrapTurns(ah + dh * t) };
  }

  // Synth mode: the hue sweeps hueSpan degrees from hue while lightness swings
  // by one sine period, so a full-circle span loops seamlessly. Seven stops
  // keep neighbors at most 60 degrees apart, since mixing takes the short way.
  function synthStops(p) {
    var stops = [];
    for (var i = 0; i < STOP_COUNT; i++) {
      var t = i / (STOP_COUNT - 1);
      stops.push({
        pos: t,
        L: clamp01(p.lightness + p.lightSwing * 0.5 * Math.sin(2 * Math.PI * t)),
        C: p.chroma,
        h: wrapTurns((p.hue + p.hueSpan * t) / 360)
      });
    }
    return stops;
  }

  // Samples the stops at each of the 16 palette entries. Entry i sits at
  // i * 17 / 255, the spread FastLED uses for a 16-entry gradient palette.
  function buildTargetEntries(stops, out) {
    for (var i = 0; i < 16; i++) {
      var pos = i / 15;
      var k = 0;
      while (k < stops.length && stops[k].pos < pos) k++;
      if (k === 0) {
        out[i] = stops[0];
      } else if (k === stops.length) {
        out[i] = stops[stops.length - 1];
      } else {
        var a = stops[k - 1];
        var b = stops[k];
        out[i] = mixOKLCH(a, b, (pos - a.pos) / (b.pos - a.pos));
      }
    }
  }

  // OKLCH -> 8-bit sRGB. https://bottosson.github.io/posts/oklab/
  // Out-of-gamut colors move straight toward the grey of the same lightness
  // until they fit, as in oklch.h. The LEDs take linear light directly, but a
  // screen expects sRGB, so the result gets the sRGB transfer curve (the same
  // thing CSS oklch() does).
  function oklchToSRGB8(c, out, o) {
    var L = clamp01(c.L);
    var a = c.C * Math.cos(2 * Math.PI * c.h);
    var b = c.C * Math.sin(2 * Math.PI * c.h);
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_;
    var m = m_ * m_ * m_;
    var s = s_ * s_ * s_;
    var rgb = [
      +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
    var grey = L * L * L;
    var scale = 1;
    for (var i = 0; i < 3; i++) {
      if (rgb[i] > 1) {
        scale = Math.min(scale, (1 - grey) / (rgb[i] - grey));
      } else if (rgb[i] < 0) {
        scale = Math.min(scale, grey / (grey - rgb[i]));
      }
    }
    for (var j = 0; j < 3; j++) {
      var v = clamp01(grey + scale * (rgb[j] - grey));
      v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      out[o + j] = Math.round(v * 255);
    }
  }

  // The 16 palette entries, eased toward the synth stops in OKLCH like
  // updatePaletteBlend(), so dragging a color slider fades smoothly.
  function createPalette() {
    var entries = [];
    var target = [];
    for (var i = 0; i < 16; i++) {
      entries.push({ L: smoother(0), C: smoother(0), h: smoother(0) });
      target.push(null);
    }
    return { entries: entries, target: target, key: '', settled: false, bytes: new Uint8Array(64) };
  }

  // Returns true when the palette bytes changed.
  function updatePalette(pal, p, omega, dt, decay) {
    var key = [p.hue, p.hueSpan, p.lightness, p.lightSwing, p.chroma].join();
    var first = pal.key === '';
    if (key !== pal.key) {
      pal.key = key;
      buildTargetEntries(synthStops(p), pal.target);
      pal.settled = false;
    }
    if (pal.settled) return false;

    var maxDelta = 0;
    for (var i = 0; i < 16; i++) {
      var cur = pal.entries[i];
      var t = pal.target[i];
      var th = t.h;
      if (first) {
        cur.L.value = t.L;
        cur.C.value = t.C;
        cur.h.value = t.h;
        continue;
      }
      // fading to or from grey only changes chroma; the hue just goes along
      if (t.C < ACHROMATIC_CHROMA) {
        th = cur.h.value;
      } else if (cur.C.value < ACHROMATIC_CHROMA) {
        cur.h.value = th;
      }
      // ease toward the nearest copy of the target hue, the short way round
      smoothDamp(cur.L, t.L, omega, dt, decay);
      smoothDamp(cur.C, t.C, omega, dt, decay);
      smoothDamp(cur.h, cur.h.value + wrapTurnsSigned(th - cur.h.value), omega, dt, decay);
      cur.C.value = Math.max(cur.C.value, 0);
      cur.h.value = wrapTurns(cur.h.value);
      maxDelta = Math.max(maxDelta, Math.abs(cur.L.value - t.L), Math.abs(cur.C.value - t.C),
        Math.abs(wrapTurnsSigned(cur.h.value - th)) * cur.C.value);
    }
    // close enough to be invisible: snap and stop updating the texture
    if (maxDelta < 0.0005) {
      for (var j = 0; j < 16; j++) {
        pal.entries[j].L.value = pal.target[j].L;
        pal.entries[j].C.value = pal.target[j].C;
        pal.entries[j].h.value = pal.target[j].h;
        pal.entries[j].L.velocity = pal.entries[j].C.velocity = pal.entries[j].h.velocity = 0;
      }
      pal.settled = true;
    }

    var color = { L: 0, C: 0, h: 0 };
    for (var e = 0; e < 16; e++) {
      color.L = pal.entries[e].L.value;
      color.C = pal.entries[e].C.value;
      color.h = pal.entries[e].h.value;
      oklchToSRGB8(color, pal.bytes, e * 4);
      pal.bytes[e * 4 + 3] = 255;
    }
    return true;
  }

  function init(host) {
    var shaderUrl = host.getAttribute('data-shader');
    if (!shaderUrl) return;
    var speed = parseFloat(host.getAttribute('data-shader-speed')) || 0.7;
    var parallax = parseFloat(host.getAttribute('data-shader-parallax'));
    parallax = (parallax >= 0 && parallax <= 1) ? parallax : 0.3;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // With reduced motion on, the animation starts at speed 0 (a still
    // background); raising the speed slider opts in to the motion.
    if (reduced) {
      speed = 0;
      var speedSlider = document.querySelector('.vfx-controls [data-shader-param="speed"]');
      if (speedSlider) speedSlider.value = 0;
    }

    // Shader control panel state, shared with the render loop: `params` are the
    // slider values (these defaults apply when the panel is absent) and
    // `locks` is 0/1 for divisions, where a lock means "use the slider value
    // instead of the time-run sweep".
    var controls = {
      params: {
        speed: speed, divisions: 56, points: 201, discriminant: 5,
        hue: 200, hueSpan: 60, lightness: 0.66, lightSwing: 0.4, chroma: 0.11
      },
      locks: { divisions: 1 },
      maskType: 0,
      swatch: document.querySelector('.vfx-controls .vfx-palette')
    };

    // narrow viewports: the header button opens the panel as a bottom sheet
    // (wide viewports always show it, so CSS ignores `is-open` there). The
    // sheet is non-modal; its close button or Escape closes it and hands focus
    // back to the header button.
    var panel = document.querySelector('.vfx-controls');
    var panelToggle = document.querySelector('.vfx-controls-toggle');
    if (panel && panelToggle) {
      var setPanelOpen = function(open, refocus) {
        panel.classList.toggle('is-open', open);
        panelToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open && refocus) panelToggle.focus();
      };
      panelToggle.addEventListener('click', function() {
        setPanelOpen(!panel.classList.contains('is-open'), false);
      });
      var panelClose = panel.querySelector('.vfx-controls-close');
      if (panelClose) {
        panelClose.addEventListener('click', function() { setPanelOpen(false, true); });
      }
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) setPanelOpen(false, true);
      });
    }

    // mask-mode toggle below the sliders: off = case 0, on = case 1
    var maskToggle = document.querySelector('.vfx-controls .vfx-mask-input');
    if (maskToggle) {
      var syncMask = function() {
        controls.maskType = maskToggle.checked ? 1 : 0;
        maskToggle.closest('.vfx-mask').className = 'vfx-mask' + (maskToggle.checked ? ' is-on' : '');
      };
      maskToggle.addEventListener('change', syncMask);
      syncMask();
    }

    Array.prototype.forEach.call(document.querySelectorAll('.vfx-controls .vfx-control'), function(row) {
      var slider = row.querySelector('input[type="range"]');
      var lock = row.querySelector('.vfx-lock'); // only the divisions row has one
      var value = row.querySelector('output');
      var name = slider && slider.getAttribute('data-shader-param');
      if (!name) return;

      // enough decimals to show every value the slider's step can land on
      var step = parseFloat(slider.getAttribute('step'));
      var decimals = step ? Math.max(0, Math.min(3, Math.ceil(-Math.log(step) / Math.LN10))) : 2;

      function isLocked() {
        return !lock || lock.checked; // a row without a checkbox is always locked
      }

      function sync() {
        var v = parseFloat(slider.value);
        controls.params[name] = v;
        if (lock) controls.locks[name] = isLocked() ? 1 : 0;
        if (value) value.textContent = v.toFixed(decimals);
        row.className = 'vfx-control' + (isLocked() ? ' is-locked' : '');
      }

      // moving a slider claims its parameter, so the lock checks itself on
      slider.addEventListener('input', function() {
        if (lock) lock.checked = true;
        sync();
      });
      if (lock) lock.addEventListener('change', sync);
      sync();
    });

    var canvas = document.createElement('canvas');
    // fixed to the viewport (via the host); only the visible part is shaded
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = host.getAttribute('data-shader-z-index') || '-1';
    host.appendChild(canvas);

    // opaque, no depth/stencil/antialias buffers: the compositor can skip
    // blending the canvas, and the GPU allocates only the color buffer
    var attrs = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    var gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) return;
    // the base color until the shaders arrive, instead of opaque black
    gl.clearColor(BASE_RGB[0] / 255, BASE_RGB[1] / 255, BASE_RGB[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var indexUrl = shaderUrl.replace(/\.frag$/, INDEX_SUFFIX);
    Promise.all([
      fetch(shaderUrl).then(function(r) { return r.text(); }),
      fetch(indexUrl).then(function(r) { return r.text(); })
    ]).then(function(sources) {
      try {
        run(gl, canvas, parallax, controls, sources[0], sources[1]);
      } catch (e) {
        console.error('vfx:', e);
      }
    }).catch(function(e) {
      console.error('vfx: could not load shaders', e);
    });
  }

  function run(gl, canvas, parallax, controls, mainSrc, indexSrc) {
    var maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    var prog = link(gl, mainSrc);
    var idxProg = link(gl, indexSrc);

    // shared fullscreen triangle
    var tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'coords');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var iLoc = gl.getAttribLocation(idxProg, 'coords');
    gl.enableVertexAttribArray(iLoc);
    gl.vertexAttribPointer(iLoc, 2, gl.FLOAT, false, 0, 0);

    var u = {};
    ['u_mapOffset', 'u_mapInvSize', 'u_indexMap', 'u_palette', 'u_count', 'u_golden',
      'u_divisions', 'u_rot', 'u_palPhase', 'u_maskType'].forEach(function(name) {
      u[name] = gl.getUniformLocation(prog, name);
    });
    var iu = {};
    ['resolution', 'u_origin', 'u_texelSize', 'u_count', 'u_golden', 'u_goldenRot',
      'u_cellScale'].forEach(function(name) {
      iu[name] = gl.getUniformLocation(idxProg, name);
    });

    // texture units are fixed: 0 = index map, 1 = palette
    gl.useProgram(prog);
    gl.uniform1i(u.u_indexMap, 0);
    gl.uniform1i(u.u_palette, 1);

    // offscreen index texture + framebuffer (rebuilt only when the spiral or
    // the page/viewport size changes). Plain RGBA8 is fine: it stores the
    // nearest site INDEX (exact in 16 bits across R and G) plus two smooth
    // 0..1 values, not a quantized position.
    var tex = gl.createTexture();
    var fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // 16x1 palette texture; LINEAR + REPEAT blends entries (15 wraps to 0)
    var palTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);

    // device-pixel sizes: the canvas is the viewport; pageH is the page height
    var dpr = 1;
    var viewW = 1;
    var viewH = 1;
    var pageH = 1;

    // the index map as last built: its size in texels, the pattern px per
    // texel scale, the pattern y of its bottom row, and the spiral it holds
    var map = { w: 0, h: 0, scale: 1, originY: 0, count: 0, discriminant: 0, golden: 0, preview: false, version: 0, dirty: true };

    // phyllotaxis golden angle in turns for phi = (1 + sqrt(D)) / 2, as in
    // buildCoordinateMaps(): 360 * (1 - 1 / phi) degrees
    function goldenTurns(discriminant) {
      return 1 - 2 / (1 + Math.sqrt(Math.max(discriminant, 0)));
    }

    function pointCount() {
      return Math.max(2, Math.min(MAX_POINTS, Math.round(controls.params.points)));
    }

    // `preview` builds at CSS-pixel resolution instead of device pixels (a
    // quarter of the work on retina), for rebuilds every frame while the
    // spiral is changing; a full-resolution build follows once it settles
    function buildIndexMap(discriminant, preview) {
      // pattern space spans the page, plus the extra distance the pattern
      // travels below it at full scroll (see the parallax note at the top)
      var span = (1 - parallax) * Math.max(0, pageH - viewH);
      var mapH = pageH + span;
      var scale = Math.min(1, maxTex / mapH, maxTex / viewW, Math.sqrt(MAX_MAP_PIXELS / (viewW * mapH)));
      if (preview) scale = Math.min(scale, 1 / dpr);
      var w = Math.max(1, Math.ceil(viewW * scale));
      var h = Math.max(1, Math.ceil(mapH * scale));

      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (w !== map.w || h !== map.h) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error('vfx: index framebuffer incomplete');
        }
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      }

      var count = pointCount();
      var golden = goldenTurns(discriminant);
      gl.viewport(0, 0, w, h);
      gl.useProgram(idxProg);
      gl.uniform2f(iu.resolution, viewW, viewH);
      gl.uniform2f(iu.u_origin, 0, -span);
      gl.uniform1f(iu.u_texelSize, 1 / scale);
      gl.uniform1f(iu.u_count, count);
      gl.uniform1f(iu.u_golden, golden);
      gl.uniform2f(iu.u_goldenRot, Math.cos(2 * Math.PI * golden), Math.sin(2 * Math.PI * golden));
      gl.uniform1f(iu.u_cellScale, Math.sqrt(201 / count));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      map.w = w;
      map.h = h;
      map.scale = scale;
      map.originY = -span;
      map.count = count;
      map.discriminant = discriminant;
      map.golden = golden;
      map.preview = !!preview && scale < 1;
      map.version++;
      map.dirty = false;
    }

    function resize() {
      // full device-pixel resolution (capped so ultra-high-DPI screens don't
      // overdraw); pass 2 is cheap enough that this stays affordable
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(window.innerWidth * dpr));
      var h = Math.max(1, Math.round(window.innerHeight * dpr));
      // content height can change after fonts/images load, so this is
      // rechecked every frame
      var ph = Math.max(h, Math.round(Math.max(
        document.documentElement.scrollHeight,
        (document.body && document.body.scrollHeight) || 0
      ) * dpr));

      if (w !== viewW || h !== viewH || ph !== pageH) {
        viewW = w;
        viewH = h;
        pageH = ph;
        map.dirty = true;
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    // animation state: phases integrated over time (so a speed change only
    // changes their rate), and the eased values that follow the sliders
    var rotPhase = 0;      // u_rot, 0..1
    var palPhase = 0;      // u_palPhase, 0..1
    var sweepPhase = 0;    // radians, drives the unlocked divisions sweep
    var speedS = smoother(controls.params.speed);
    var divisionsS = smoother(controls.params.divisions);
    var discriminantS = smoother(controls.params.discriminant);
    var palette = createPalette();
    // seconds the spiral has been still; the map is a preview until it settles
    var spiralStill = 1;
    var paletteVersion = 0;
    // what the canvas last showed, so an unchanged frame isn't redrawn
    var drawnKey = '';
    var lastNow = null;
    var lost = false;

    function step(dt) {
      var omega = 2 / SMOOTH_SECONDS;
      var x = omega * dt;
      // the cubic is a cheap stand-in for exp(-x), as in palette_blend.h
      var decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      var p = controls.params;

      smoothTo(speedS, p.speed, omega, dt, decay, 1e-4);
      var t = speedS.value * dt;
      rotPhase = wrapTurns(rotPhase + ROT_RATE * t);
      palPhase = wrapTurns(palPhase + PALETTE_RATE * t);
      sweepPhase = (sweepPhase + DIVISION_SWEEP_RATE * t) % (2 * Math.PI);

      // divisions start 46, head down to 5, sweep up to 89 and back, ~20 min
      // at speed 0.7; a locked slider replaces the sweep
      var divisionsTarget = controls.locks.divisions ? p.divisions : 47 - 42 * Math.sin(sweepPhase + 0.0238);
      smoothTo(divisionsS, divisionsTarget, omega, dt, decay, 1e-4);
      smoothTo(discriminantS, p.discriminant, omega, dt, decay, 1e-5);
      if (discriminantS.value !== map.discriminant || pointCount() !== map.count) {
        map.dirty = true;
        spiralStill = 0;
      } else {
        spiralStill += dt;
      }
      // a quick slider drag leaves the spiral still for a frame or two, so
      // wait a moment before the full-resolution build
      if (map.preview && spiralStill > 0.15) map.dirty = true;

      if (updatePalette(palette, p, omega, dt, decay)) {
        paletteVersion++;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, palTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 16, 1, gl.RGBA, gl.UNSIGNED_BYTE, palette.bytes);
        gl.activeTexture(gl.TEXTURE0);
        if (controls.swatch) {
          var stops = [];
          for (var i = 0; i <= 16; i++) {
            var o = (i % 16) * 4;
            stops.push('rgb(' + palette.bytes[o] + ',' + palette.bytes[o + 1] + ',' + palette.bytes[o + 2] + ')');
          }
          controls.swatch.style.background = 'linear-gradient(to right,' + stops.join(',') + ')';
        }
      }
    }

    function draw() {
      resize();
      // the first build (and a resize) goes straight to full resolution
      if (map.dirty) buildIndexMap(discriminantS.value, map.count > 0 && spiralStill <= 0.15);

      // scroll parallax: the viewport looks at pattern rows off .. off + viewH,
      // starting at the top of pattern space and moving down it at
      // (2 - parallax) times the scroll (clamped, so overscroll bounce doesn't
      // run past the map)
      var scrollMax = pageH - viewH;
      var scrollY = (window.pageYOffset || document.documentElement.scrollTop || 0) * dpr;
      scrollY = Math.max(0, Math.min(scrollMax, scrollY));
      var off = scrollMax - (2 - parallax) * scrollY;

      // a still scene (speed 0, nothing easing, no scroll) costs no GPU time
      var key = [viewW, viewH, map.version, off, divisionsS.value, rotPhase, palPhase,
        controls.maskType, paletteVersion].join();
      if (key === drawnKey) return;
      drawnKey = key;

      gl.viewport(0, 0, viewW, viewH);
      gl.useProgram(prog);
      gl.uniform2f(u.u_mapOffset, 0, off - map.originY);
      gl.uniform2f(u.u_mapInvSize, map.scale / map.w, map.scale / map.h);
      gl.uniform1f(u.u_count, map.count);
      gl.uniform1f(u.u_golden, map.golden);
      gl.uniform1f(u.u_divisions, divisionsS.value);
      gl.uniform1f(u.u_rot, rotPhase);
      gl.uniform1f(u.u_palPhase, palPhase);
      gl.uniform1f(u.u_maskType, controls.maskType);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      if (lost) return;
      requestAnimationFrame(frame);
      if (lastNow !== null && now - lastNow < MIN_FRAME_MS) return;
      // clamp dt so returning to a background tab doesn't take one giant step
      var dt = lastNow === null ? 0 : Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;
      step(dt);
      draw();
    }

    canvas.addEventListener('webglcontextlost', function() { lost = true; });

    requestAnimationFrame(frame);
  }

  document.addEventListener('DOMContentLoaded', function() {
    var host = document.querySelector('.vfx-background');
    if (host) init(host);
  });
})(document);
