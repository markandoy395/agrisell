const BLOCKED_PUBLIC_ROUTING_HOSTS = new Set(['router.project-osrm.org'])

export const ROUTING_DISABLED_MESSAGE =
  'Road routing is disabled to protect exact delivery coordinates. Configure an approved private routing service to enable it.'

export const normalizeDeliveryRoutingUrl = (
  value: string | undefined,
  production = false,
): string | null => {
  const configured = value?.trim()
  if (!configured) return null
  try {
    const url = new URL(configured)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (production && url.protocol !== 'https:') return null
    if (url.username || url.password || url.search || url.hash) return null
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (BLOCKED_PUBLIC_ROUTING_HOSTS.has(hostname)) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export const getDeliveryRoutingUrl = () =>
  normalizeDeliveryRoutingUrl(
    import.meta.env?.VITE_DELIVERY_ROUTING_URL,
    import.meta.env?.PROD === true,
  )
