import { isPhoneDevice } from '../utils/isPhoneDevice'

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    mobile?: boolean
  }
}

export function useSmallScreenAccessBlock() {
  if (typeof navigator === 'undefined') return false

  const navigatorWithHints: NavigatorWithUserAgentData = navigator
  return isPhoneDevice(navigator.userAgent, navigatorWithHints.userAgentData?.mobile)
}
