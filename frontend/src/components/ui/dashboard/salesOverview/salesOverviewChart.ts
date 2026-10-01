import type { SalesTrendPoint } from '../../../../types/adminData'

export type SalesChartPeriod = 'Daily' | 'Weekly' | 'Monthly'

export const chartWidth = 650
export const chartHeight = 218
export const plotPadding = 8

export const currency = new Intl.NumberFormat('en-PH', {
  currency: 'PHP',
  style: 'currency',
})

export const compactCurrency = new Intl.NumberFormat('en-PH', {
  currency: 'PHP',
  maximumFractionDigits: 1,
  notation: 'compact',
  style: 'currency',
})

export const dateLabel = new Intl.DateTimeFormat('en-PH', {
  day: 'numeric',
  month: 'short',
})

export const fullDate = new Intl.DateTimeFormat('en-PH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export const monthLabel = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  year: 'numeric',
})

export const monthAxisLabel = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
})

export const parseDate = (value: string) => new Date(`${value}T00:00:00`)

export const niceMaximum = (value: number) => {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return rounded * magnitude
}

export const aggregateSalesTrend = (salesTrend: SalesTrendPoint[], period: SalesChartPeriod) => {
  if (period === 'Daily') return salesTrend.slice(-7)
  if (period === 'Weekly') {
    const recentDays = salesTrend.slice(-56)
    return Array.from({ length: Math.ceil(recentDays.length / 7) }, (_, index) => {
      const week = recentDays.slice(index * 7, index * 7 + 7)
      return week.reduce<SalesTrendPoint>(
        (total, point) => ({
          date: point.date,
          orders: total.orders + point.orders,
          revenue: total.revenue + point.revenue,
        }),
        { date: week[0]?.date ?? '', orders: 0, revenue: 0 },
      )
    })
  }

  const months = new Map<string, SalesTrendPoint>()
  salesTrend.forEach((point) => {
    const key = point.date.slice(0, 7)
    const total = months.get(key) ?? {
      date: `${key}-01`,
      orders: 0,
      revenue: 0,
    }
    total.orders += point.orders
    total.revenue += point.revenue
    months.set(key, total)
  })
  return [...months.values()].slice(-12)
}
