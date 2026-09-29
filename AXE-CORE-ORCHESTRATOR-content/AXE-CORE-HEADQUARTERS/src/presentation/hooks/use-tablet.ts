import * as React from "react"

/**
 * Tablet is a capability/input distinction, not a giant width bucket.
 *
 * The old 768..1600 rule classified 13-inch laptops and the Tauri window as
 * "tablet". Sidebar/RightPanel then switched to Sheet mode while AppShell still
 * rendered desktop chrome: exactly the half-desktop/half-tablet state that
 * clips the right side on iPad and can also change Tauri at common widths.
 *
 * iPad PWA should use the same full AXE layout as Tauri. Components that truly
 * need touch-specific behaviour can use this hook, but only on a coarse-pointer
 * browser surface; packaged Tauri is explicitly excluded.
 */
function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as typeof window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__)
}

function tabletNow(): boolean {
  if (typeof window === 'undefined' || isTauriRuntime()) return false
  return window.matchMedia('(pointer: coarse)').matches
    && window.matchMedia('(min-width: 768px)').matches
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(tabletNow)

  React.useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)')
    const min = window.matchMedia('(min-width: 768px)')
    const check = () => setIsTablet(tabletNow())
    coarse.addEventListener("change", check)
    min.addEventListener("change", check)
    window.addEventListener("resize", check)
    check()
    return () => {
      coarse.removeEventListener("change", check)
      min.removeEventListener("change", check)
      window.removeEventListener("resize", check)
    }
  }, [])

  return isTablet
}
