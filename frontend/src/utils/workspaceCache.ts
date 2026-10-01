export type CacheFetcher<T> = (signal?: AbortSignal) => Promise<T>

export interface WorkspaceCache<T> {
  clear: () => void
  fetchCached: (
    signal?: AbortSignal,
    fetcher?: CacheFetcher<T>,
    forceRefresh?: boolean,
  ) => Promise<T>
  get: () => T | null
  hasData: () => boolean
  preload: (fetcher?: CacheFetcher<T>) => void
  set: (data: T) => void
  setDefaultFetcher: (fetcher: CacheFetcher<T>) => void
  subscribe: (listener: (data: T | null) => void) => () => void
}

export function createWorkspaceCache<T>(
  defaultFetcher?: CacheFetcher<T>,
  fallbackValue?: T,
): WorkspaceCache<T> {
  let cachedData: T | null = null
  let inFlight: Promise<T> | null = null
  let activeDefaultFetcher: CacheFetcher<T> | null = defaultFetcher ?? null
  const listeners = new Set<(data: T | null) => void>()

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener(cachedData)
      } catch {
        // Ignore subscriber errors
      }
    })
  }

  const get = (): T | null => cachedData

  const set = (data: T): void => {
    cachedData = data
    notify()
  }

  const clear = (): void => {
    cachedData = null
    inFlight = null
    notify()
  }

  const hasData = (): boolean => cachedData !== null

  const setDefaultFetcher = (fetcher: CacheFetcher<T>): void => {
    activeDefaultFetcher = fetcher
  }

  const fetchCached = async (
    signal?: AbortSignal,
    fetcher?: CacheFetcher<T>,
    forceRefresh = false,
  ): Promise<T> => {
    if (!forceRefresh && cachedData !== null) {
      return cachedData
    }
    if (inFlight) {
      return inFlight
    }
    const currentFetcher = fetcher || activeDefaultFetcher
    if (!currentFetcher) {
      if (cachedData !== null) return cachedData
      if (fallbackValue !== undefined) return fallbackValue
      throw new Error('No fetcher provided for workspace cache.')
    }

    inFlight = (async () => {
      try {
        const result = await currentFetcher(signal)
        cachedData = result
        notify()
        return result
      } finally {
        inFlight = null
      }
    })()

    return inFlight
  }

  const preload = (fetcher?: CacheFetcher<T>): void => {
    if (cachedData !== null) return
    void fetchCached(undefined, fetcher).catch(() => undefined)
  }

  const subscribe = (listener: (data: T | null) => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    clear,
    fetchCached,
    get,
    hasData,
    preload,
    set,
    setDefaultFetcher,
    subscribe,
  }
}
