import * as React from "react"

const TABLET_BREAKPOINT_MIN = 768
// 1024 only covered iPad *portrait* widths, and even 1366 (12.9" Pro
// landscape) misses the 13" Pro (M4/M5) at ~1590pt landscape. Raised again
// to comfortably clear every current iPad in either orientation, including
// that one. Above this is genuinely desktop/laptop territory.
const TABLET_BREAKPOINT_MAX = 1600

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const w = window.innerWidth
    return w >= TABLET_BREAKPOINT_MIN && w <= TABLET_BREAKPOINT_MAX
  })

  React.useEffect(() => {
    const check = () => {
      const w = window.innerWidth
      setIsTablet(w >= TABLET_BREAKPOINT_MIN && w <= TABLET_BREAKPOINT_MAX)
    }
    const mqlMin = window.matchMedia(`(min-width: ${TABLET_BREAKPOINT_MIN}px)`)
    const mqlMax = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT_MAX}px)`)
    mqlMin.addEventListener("change", check)
    mqlMax.addEventListener("change", check)
    check()
    return () => {
      mqlMin.removeEventListener("change", check)
      mqlMax.removeEventListener("change", check)
    }
  }, [])

  return isTablet
}
