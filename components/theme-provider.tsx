"use client"

import { useServerInsertedHTML } from "next/navigation"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useRef } from "react"

const storageKey = "theme"
const defaultTheme = "system"

const themeBootstrap = `(() => {
  let theme = ${JSON.stringify(defaultTheme)};
  try {
    theme = localStorage.getItem(${JSON.stringify(storageKey)}) || theme;
  } catch {
    // Follow the system preference when storage is unavailable.
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
})();`

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const inserted = useRef(false)

  // Run the bootstrap before paint, outside the tree React hydrates.
  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
  })

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={defaultTheme}
      storageKey={storageKey}
      disableTransitionOnChange
      // Keep the library's inline script inert during client mounts.
      scriptProps={{ type: "text/plain" }}
    >
      {children}
    </NextThemesProvider>
  )
}
