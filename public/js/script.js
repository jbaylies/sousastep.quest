(function(document) {
  // Respect prefers-reduced-motion: freeze the sidebar shader. Shadify
  // watches data-shader-speed, and 0 is treated as falsy, so use a tiny
  // value that is imperceptibly close to still.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var shaderEls = document.querySelectorAll('[data-shader]');
    for (var i = 0; i < shaderEls.length; i++) {
      shaderEls[i].setAttribute('data-shader-speed', '0.001');
    }
  }

  // Precompute the phyllotaxis sites for the voronoi background shader and
  // upload them once, so the fragment shader doesn't eval cos/sin per pixel.
  // Shadify fetches the shader asynchronously, so poll until it's ready.
  document.addEventListener('DOMContentLoaded', function() {
    var host = document.querySelector('.vfx-background');
    if (!host) return;
    var attempts = 0;
    var timer = setInterval(function() {
      if (!host.shadify || !host.shadify.gl) {
        if (++attempts > 50) clearInterval(timer); // give up after ~5s
        return;
      }
      clearInterval(timer);
      var gl = host.shadify.gl;
      var N = 200;
      var pts = new Float32Array(N * 2);
      var golden = 2.399963229728653;
      for (var i = 0; i < N; i++) {
        var r = Math.sqrt((i + 0.5) / N);
        pts[i * 2] = r * Math.cos(i * golden);
        pts[i * 2 + 1] = r * Math.sin(i * golden);
      }
      var loc = gl.getUniformLocation(host.shadify.pid, 'u_sites');
      if (loc) gl.uniform2fv(loc, pts);
    }, 100);
  });

  var toggle = document.querySelector('.sidebar-toggle');
  var sidebar = document.querySelector('#sidebar');
  var checkbox = document.querySelector('#sidebar-checkbox');

  document.addEventListener('click', function(e) {
    var target = e.target;

    if(!checkbox.checked ||
       sidebar.contains(target) ||
       (target === checkbox || target === toggle)) return;

    checkbox.checked = false;
  }, false);
})(document);
