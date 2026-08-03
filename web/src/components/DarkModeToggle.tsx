import { useEffect, useState } from 'react';

export function DarkModeToggle() {
  const [enabled, setEnabled] = useState(false);

  // Initialize from localStorage / system preference
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored) {
      setEnabled(stored === 'dark');
      if (stored === 'dark') document.documentElement.classList.add('dark');
    } else {
      // Fallback to prefers-color-scheme
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setEnabled(prefersDark);
      if (prefersDark) document.documentElement.classList.add('dark');
    }
  }, []);

  const toggle = () => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    if (newEnabled) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <button
      type="button"
      className="btn-ghost px-2 py-1 text-sm"
      onClick={toggle}
      aria-label="Toggle dark mode"
    >
      {enabled ? '🌙' : '☀️'}
    </button>
  );
}
