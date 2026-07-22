import * as React from "react"

const TABLET_BREAKPOINT_MIN = 768
// 1024 only covered iPad *portrait* widths. Every current iPad's landscape
// width (iPad mini 1133, Air/11" Pro ~1180-1194, 12.9" Pro 1366) exceeded
// that, so it fell through to the fixed-column desktop layout instead of
// the drawer/off-canvas panels. Raised to cover all iPad orientations up
// to the largest Pro.
const TABLET_BREAKPOINT_MAX = 1366

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
