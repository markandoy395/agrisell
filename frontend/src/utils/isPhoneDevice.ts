const PHONE_USER_AGENT_PATTERN =
  /Android.+Mobile|iPhone|iPod|webOS|IEMobile|Windows Phone|BlackBerry|BB10|Opera Mini/i
const TABLET_USER_AGENT_PATTERN = /iPad|Tablet|Kindle|Silk|PlayBook/i

export function isPhoneDevice(userAgent: string, mobileHint = false) {
  // iPad user agents can contain "Mobile" while still identifying a tablet.
  if (TABLET_USER_AGENT_PATTERN.test(userAgent)) return false

  return PHONE_USER_AGENT_PATTERN.test(userAgent) || mobileHint
}
