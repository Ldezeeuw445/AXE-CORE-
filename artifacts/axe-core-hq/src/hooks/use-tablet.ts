import * as React from "react"

const TABLET_BREAKPOINT_MIN = 768
const TABLET_BREAKPOINT_MAX = 1024

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
