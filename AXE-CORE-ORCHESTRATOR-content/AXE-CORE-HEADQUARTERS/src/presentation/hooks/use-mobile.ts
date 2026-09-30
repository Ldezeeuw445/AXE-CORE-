import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * iPhone gets the mobile command surface. iPad never does.
 *
 * iPadOS can report a desktop-class "Macintosh" user agent and its PWA can
 * become narrower than 768px in Split View / Stage Manager. Width alone then
 * used to flip the installed iPad app into the iPhone shell. AXE's contract is
 * different: every iPad PWA keeps the full Tauri/desktop shell and only lets
 * that shell shrink to the available viewport.
 */
function isIPadLike(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  return /iPad/i.test(ua)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function mobileNow(): boolean {
  if (typeof window === 'undefined') return false
  if (isIPadLike()) return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(mobileNow)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mobileNow())
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    onChange()
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
