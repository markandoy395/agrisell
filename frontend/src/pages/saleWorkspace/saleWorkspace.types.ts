export type DiscountType = 'sale_price' | 'percentage' | 'amount'
export type TargetGroup = 'all_users' | 'new_users_only'
export type SaleStatus = 'active' | 'scheduled' | 'expired' | 'disabled'
export type SaleScope = 'all' | 'platform' | 'farmer'

export type FarmOption = {
  id: string
  name: string
  farmerName?: string | null
  location?: string | null
}

export type Product = {
  id: string
  name: string
  price: number
  unit: string
  category?: string
  imageUrl?: string
  stockQuantity?: number | null
  stockStatus?: string
  farmId?: string | null
  farmName?: string | null
}

export type Sale = {
  id: string
  name: string
  discountType: DiscountType
  discountValue: number
  targetUserGroup: TargetGroup
  startsAt: string | null
  endsAt: string | null
  isEnabled: boolean
  promoteOnHome: boolean
  promoCode?: string | null
  products: Array<{ id: string; name: string }>
  farmId?: string | null
  farmName?: string | null
  farmerName?: string | null
  scope?: 'platform' | 'farmer'
}

export type SaleSummary = {
  active: number
  newUser: number
  products: number
  scheduled: number
  platformSales: number
  farmerSales: number
}
