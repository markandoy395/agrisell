import type { DiscountType, Product, Sale, SaleStatus } from './saleWorkspace.types'

export const SALE_OVERVIEW_PAGE_SIZE = 50

export const SALE_STATUSES: Array<{ key: SaleStatus; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'expired', label: 'Expired' },
  { key: 'disabled', label: 'Disabled' },
]

export const peso = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    currency: 'PHP',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(Math.max(0, value))

export const formatSaleDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-PH', {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value))
    : 'No limit'

export const utcToLocalDateTime = (value: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export const localDateTimeToUtc = (value: string) => (value ? new Date(value).toISOString() : null)

export const getSaleStatus = (sale: Sale, now = Date.now()): SaleStatus => {
  if (!sale.isEnabled) return 'disabled'
  if (sale.endsAt && new Date(sale.endsAt).getTime() <= now) return 'expired'
  if (sale.startsAt && new Date(sale.startsAt).getTime() > now) return 'scheduled'
  return 'active'
}

export const timeRangesOverlap = (startsAt: string, endsAt: string, sale: Sale) => {
  const firstStart = startsAt ? new Date(startsAt).getTime() : -Infinity
  const firstEnd = endsAt ? new Date(endsAt).getTime() : Infinity
  const secondStart = sale.startsAt ? new Date(sale.startsAt).getTime() : -Infinity
  const secondEnd = sale.endsAt ? new Date(sale.endsAt).getTime() : Infinity
  return firstStart < secondEnd && secondStart < firstEnd
}

export const getSalePrice = (price: number, discountType: DiscountType, discountValue: number) => {
  if (!Number.isFinite(discountValue) || discountValue <= 0) return price
  if (discountType === 'sale_price') return discountValue
  if (discountType === 'percentage') return price * (1 - discountValue / 100)
  return price - discountValue
}

export const getDiscountLabel = (type: DiscountType, value: number) => {
  if (type === 'percentage') return `${value}% OFF`
  if (type === 'amount') return `${peso(value)} OFF`
  return `${peso(value)} SALE PRICE`
}

export const summarizeSaleProducts = (products: Sale['products'], limit = 3) => {
  if (!products.length) return 'No products'
  const names = products
    .slice(0, limit)
    .map((product) => product.name)
    .join(', ')
  const remaining = products.length - limit
  return remaining > 0 ? `${names} + ${remaining} more` : names
}

export const getStockTone = (product: Product) => {
  const status = product.stockStatus?.toLocaleLowerCase() ?? ''
  const quantity = product.stockQuantity
  if (/out|sold|unavailable/.test(status) || quantity === 0) return 'out'
  if (/low/.test(status) || (typeof quantity === 'number' && quantity <= 5)) return 'low'
  return 'in'
}

export const getStockLabel = (product: Product) => {
  const tone = getStockTone(product)
  if (tone === 'out') return 'Out of stock'
  if (tone === 'low')
    return typeof product.stockQuantity === 'number'
      ? `Low stock · ${product.stockQuantity} left`
      : 'Low stock'
  return typeof product.stockQuantity === 'number'
    ? `In stock · ${product.stockQuantity} available`
    : 'In stock'
}

export const isFarmerSale = (sale: Sale) => Boolean(sale.farmId || sale.scope === 'farmer')

export const getSaleScopeLabel = (sale: Sale) => {
  if (isFarmerSale(sale)) {
    return sale.farmName ? `Farmer (${sale.farmName})` : 'Farmer-specific'
  }
  return 'Platform-wide'
}

