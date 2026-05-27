"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial value only matters pre-hydration; the blocking script in layout.tsx
  // has already set the class on <html> so the DOM is correct. We sync React
  // state from the DOM on mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const domTheme: Theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    setTheme(domTheme);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage failures (private mode, quota, etc.)
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fail safe: return a no-op implementation so consumers don't crash when
    // rendered outside a ThemeProvider (e.g., in isolation tests).
    return { theme: "dark", toggle: () => {} };
  }
  return ctx;
}

/**
 * Pre-hydration blocking snippet. Injected into <head> by layout.tsx so the
 * correct theme class is on <html> BEFORE React renders, eliminating the
 * flash-of-wrong-theme on load.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme;
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else {
      theme = 'dark';
    }
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (_) {}
})();
`;
