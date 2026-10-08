// Full-resolution phyllotaxis voronoi background with scroll parallax.
//
// Two-pass renderer that replaces the single-pass shadify setup:
//   pass 1 (once, and again on resize) renders the STATIC voronoi index map
//     into an offscreen texture (sousavfx-voronoi-index.frag);
//   pass 2 (every frame) samples that texture and evaluates the animated ring
//     color at the nearest site (sousavfx-voronoi.frag).
// Because the per-frame pass no longer loops over all 200 sites, we can render
// at full device-pixel resolution (devicePixelRatio-aware) — crisp on retina —
// for less GPU work than the old half-resolution single pass.
//
// The canvas spans the FULL PAGE (absolute, behind the content). The shader's
// `resolution` uniform stays the VIEWPORT size, so the spiral keeps its size
// and its center at the initial viewport center; a scroll offset moves the
// pattern at `data-shader-parallax` times the scroll speed (slower than the
// text). The index map is rendered once at full-page size and pass 2 simply
// re-samples it with the scroll offset, so scrolling costs nothing extra.
//
// The host element carries the same data-* attributes shadify used:
//   data-shader           URL of the main (pass 2) fragment shader
//   data-shader-speed     animation speed multiplier
//   data-shader-parallax  scroll parallax factor 0..1 (0 = no motion,
//                         1 = scrolls with the text); default 0.3
//   data-shader-z-index   z-index for the canvas
//
// The links page also renders a control panel (see _layouts/default.html) whose
// sliders drive the shader parameters. `divisions` and `rot` have a lock
// checkbox each: unlocked, the shader's time-run equation owns the parameter;
// locked (or as soon as the slider is dragged) the slider value wins. `speed`
// has no checkbox — it always scales `time`, defaulting to 1 when the panel is
// absent.
(function(document) {
  var INDEX_SUFFIX = '-index.frag';
  var VERT = '\n attribute vec2 coords;\n void main(void) {\n   gl_Position = vec4(coords.xy, 0.0, 1.0);\n }\n ';
  var N = 200;

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

  // phyllotaxis sites on a golden-angle spiral, radius 0..1 (same as shadify-era
  // code in script.js, moved here so the renderer owns the whole pipeline)
  function makeSites() {
    var pts = new Float32Array(N * 2);
    var golden = 2.399963229728653;
    for (var i = 0; i < N; i++) {
      var r = Math.sqrt((i + 0.5) / N);
      pts[i * 2] = r * Math.cos(i * golden);
      pts[i * 2 + 1] = r * Math.sin(i * golden);
    }
    return pts;
  }

  function init(host) {
    var shaderUrl = host.getAttribute('data-shader');
    if (!shaderUrl) return;
    var speed = parseFloat(host.getAttribute('data-shader-speed')) || 1;
    var parallax = parseFloat(host.getAttribute('data-shader-parallax'));
    parallax = (parallax >= 0 && parallax <= 1) ? parallax : 0.3;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Shader control panel state, shared with the render loop: `params` are the
    // slider values and `locks` are 0/1 per parameter. For divisions and rot a
    // lock means "use the slider value instead of the shader's time-run
    // equation"; the speed row has no checkbox, so it is always locked to its
    // slider value (which scales `time` in the render loop).
    var controls = {
      params: { speed: 1, divisions: 46, rot: 0 },
      locks: { speed: 0, divisions: 0, rot: 0 },
      redraw: null
    };

    Array.prototype.forEach.call(document.querySelectorAll('.vfx-controls .vfx-control'), function(row) {
      var slider = row.querySelector('input[type="range"]');
      var lock = row.querySelector('.vfx-lock'); // absent on the always-locked speed row
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
        controls.locks[name] = isLocked() ? 1 : 0;
        if (value) value.textContent = v.toFixed(decimals);
        row.className = 'vfx-control' + (isLocked() ? ' is-locked' : '');
        if (controls.redraw) controls.redraw();
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
    // absolute, anchored to the top of the page; height is set to the full
    // page height by resize() so the background reaches the bottom of the page
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = host.getAttribute('data-shader-z-index') || '-1';
    host.appendChild(canvas);

    var gl = canvas.getContext('webgl', { antialias: false }) || canvas.getContext('experimental-webgl');
    if (!gl) return;

    var indexUrl = shaderUrl.replace(/\.frag$/, INDEX_SUFFIX);
    Promise.all([
      fetch(shaderUrl).then(function(r) { return r.text(); }),
      fetch(indexUrl).then(function(r) { return r.text(); })
    ]).then(function(sources) {
      try {
        run(gl, canvas, host, speed, parallax, reduced, controls, sources[0], sources[1]);
      } catch (e) {
        console.error('vfx:', e);
      }
    }).catch(function(e) {
      console.error('vfx: could not load shaders', e);
    });
  }

  function run(gl, canvas, host, speed, parallax, reduced, controls, mainSrc, indexSrc) {
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

    var pts = makeSites();

    var uRes = gl.getUniformLocation(prog, 'resolution');
    var uTime = gl.getUniformLocation(prog, 'time');
    var uMouse = gl.getUniformLocation(prog, 'mouse');
    var uIdx = gl.getUniformLocation(prog, 'u_indexMap');
    var uIndexRes = gl.getUniformLocation(prog, 'u_indexRes');
    var uOffset = gl.getUniformLocation(prog, 'u_offset');
    var uParams = gl.getUniformLocation(prog, 'u_params');
    var uLock = gl.getUniformLocation(prog, 'u_lock');
    var iRes = gl.getUniformLocation(idxProg, 'resolution');
    var iSites = gl.getUniformLocation(idxProg, 'u_sites');

    // offscreen index texture + framebuffer (rebuilt only when the canvas
    // resizes). Plain RGBA8 is fine: it stores the nearest site INDEX (exact in
    // 8 bits for 0..199) plus the silhouette, not a quantized position.
    var tex = gl.createTexture();
    var fbo = gl.createFramebuffer();
    var indexDirty = true;

    function buildIndexMap() {
      var w = canvas.width;
      var h = canvas.height;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('vfx: index framebuffer incomplete');
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(idxProg);
      gl.uniform2f(iRes, viewW, viewH);
      gl.uniform2fv(iSites, pts);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(prog);
      indexDirty = false;
    }

    // device-pixel sizes; `resolution` for the shaders is the VIEWPORT size so
    // the spiral keeps its size and its center at the initial viewport center
    var dpr = 1;
    var viewW = 1;
    var viewH = 1;

    function resize() {
      // full device-pixel resolution (capped so ultra-high-DPI screens don't
      // overdraw); pass 2 is cheap enough that this stays affordable
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      // the canvas spans the whole page so the parallax background reaches the
      // bottom of the page (rechecked every frame; content height can change
      // after fonts/images load)
      var pageH = Math.max(
        document.documentElement.scrollHeight,
        (document.body && document.body.scrollHeight) || 0
      );
      var w = Math.max(1, Math.round(window.innerWidth * dpr));
      var h = Math.max(1, Math.round(pageH * dpr));
      // very tall pages could exceed the GPU's max texture size for the index
      // map; cap the canvas so the map stays renderable
      h = Math.min(h, maxTex);

      viewW = w;
      viewH = Math.max(1, Math.round(window.innerHeight * dpr));

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        indexDirty = true;
      }

      // CSS size: full page height (the host is the positioned ancestor)
      var cssH = (h / dpr) + 'px';
      if (canvas.style.height !== cssH) canvas.style.height = cssH;
      if (host.style.height !== cssH) host.style.height = cssH;
    }

    var mouseX = 0;
    var mouseY = 0;
    function onMouse(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('resize', resize);

    function frame(now) {
      resize();
      if (indexDirty) buildIndexMap();

      // scroll parallax: shift the pattern by (1 - parallax) * scrollY (device
      // px), so the background moves at `parallax` times the scroll speed
      var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      var offY = (1 - parallax) * scrollY * dpr;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.uniform2f(uRes, viewW, viewH);
      gl.uniform2f(uIndexRes, canvas.width, canvas.height);
      gl.uniform2f(uOffset, 0, offY);
      // the panel's speed slider always drives `time` (negative = backwards);
      // `speed` is only the fallback for pages rendered without the panel
      gl.uniform1f(uTime, (now / 1000) * (controls.locks.speed ? controls.params.speed : speed));
      gl.uniform2f(uMouse, mouseX / viewW, 1 - mouseY / viewH);
      gl.uniform2f(uParams, controls.params.divisions, controls.params.rot);
      gl.uniform2f(uLock, controls.locks.divisions, controls.locks.rot);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uIdx, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!reduced) requestAnimationFrame(frame);
    }

    // reduced motion draws on demand only, so a slider change has to request a
    // fresh still frame (the animated path picks the values up on the next rAF)
    controls.redraw = function() { if (reduced) frame(0); };

    resize();
    if (reduced) {
      // single still frames, no rAF loop; re-render on resize or scroll so the
      // static background stays anchored to the page
      frame(0);
      var staticFrame = function() { frame(0); };
      window.addEventListener('resize', staticFrame);
      window.addEventListener('scroll', staticFrame, { passive: true });
    } else {
      requestAnimationFrame(frame);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    var host = document.querySelector('.vfx-background');
    if (host) init(host);
  });
})(document);
