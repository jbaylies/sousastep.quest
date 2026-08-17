(function(document) {
  // Respect prefers-reduced-motion: freeze the sidebar shader. Shadify
  // watches data-shader-speed, and 0 is treated as falsy, so use a tiny
  // value that is imperceptibly close to still.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var shaderEl = document.querySelector('[data-shader]');
    if (shaderEl) shaderEl.setAttribute('data-shader-speed', '0.001');
  }

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
