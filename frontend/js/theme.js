// Kabithu Gold Finance — shared light/dark theme toggle
// Include this on any page after a .theme-toggle button with id="themeToggle" exists.
(function(){
  var STORAGE_KEY = 'kabithu-theme';

  function applyTheme(theme){
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  // Apply saved theme immediately (before paint where possible)
  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch(e) {}
  applyTheme(saved === 'light' ? 'light' : 'dark');

  function initToggleButton(){
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function(){
      var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      var next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch(e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToggleButton);
  } else {
    initToggleButton();
  }
})();
