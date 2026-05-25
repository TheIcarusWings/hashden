// Temporary theme-harness no-flash bootstrap. Applies the saved design
// direction before first paint so switching themes doesn't flash. Paired with
// src/components/ThemeSwitcher.tsx. Safe to delete with the rest of the harness.
(function () {
  try {
    var t = localStorage.getItem("hashden-theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
