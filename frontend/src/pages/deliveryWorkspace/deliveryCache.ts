import type { Delivery, DeliveryOptions } from '../../types/delivery'

export type DeliveryFetcher = (signal?: AbortSignal) => Promise<[Delivery[], DeliveryOptions]>

let cachedDeliveries: Delivery[] | null = null
let cachedOptions: DeliveryOptions | null = null
let inFlight: Promise<[Delivery[], DeliveryOptions]> | null = null
let defaultDeliveryFetcher: DeliveryFetcher | null = null

export const setDefaultDeliveryFetcher = (fetcher: DeliveryFetcher) => {
  defaultDeliveryFetcher = fetcher
}

export const getDeliveryCache = () => ({
  deliveries: cachedDeliveries,
  options: cachedOptions,
})

export const setDeliveryCache = (deliveries: Delivery[], options?: DeliveryOptions) => {
  cachedDeliveries = deliveries
  if (options) cachedOptions = options
}

export const clearDeliveryCache = () => {
  cachedDeliveries = null
  cachedOptions = null
  inFlight = null
}

export const fetchDeliveriesCached = async (
  signal?: AbortSignal,
  fetcher?: DeliveryFetcher,
): Promise<[Delivery[], DeliveryOptions]> => {
  if (cachedDeliveries !== null && cachedOptions !== null) {
    return [cachedDeliveries, cachedOptions]
  }
  if (inFlight) return inFlight
  const activeFetcher = fetcher || defaultDeliveryFetcher
  if (!activeFetcher) {
    return [cachedDeliveries ?? [], cachedOptions ?? { orders: [], riders: [] }]
  }
  inFlight = (async () => {
    try {
      const result = await activeFetcher(signal)
      setDeliveryCache(result[0], result[1])
      return result
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export const preloadDeliveries = (fetcher?: DeliveryFetcher) => {
  if (cachedDeliveries !== null && cachedOptions !== null) return
  void fetchDeliveriesCached(undefined, fetcher).catch(() => undefined)
}

