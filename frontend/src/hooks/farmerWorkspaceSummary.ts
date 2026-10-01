import type { EntityRecord, FarmerFarm, FarmerSummaryCard } from '../types/dashboard'

export const createFarmerSummaryCards = (
  farmers: EntityRecord[],
  farms: FarmerFarm[],
): FarmerSummaryCard[] => {
  const verifiedFarmerCount = farmers.filter((farmer) => farmer.status === 'Verified').length
  const pendingFarmerCount = farmers.filter((farmer) =>
    /(pending|review)/i.test(farmer.status),
  ).length

  return [
    {
      detail: 'Registered farmer profiles',
      icon: 'sprout',
      label: 'Farmers',
      trend: 'Live',
      value: farmers.length.toLocaleString('en-US'),
    },
    {
      detail: 'Across farmer profiles',
      icon: 'leaf',
      label: 'Registered farms',
      trend: 'Live',
      value: farms.length.toLocaleString('en-US'),
    },
    {
      detail: 'Ready to sell on Agrisell',
      icon: 'settings',
      label: 'Verified farmers',
      trend: 'Live',
      value: verifiedFarmerCount.toLocaleString('en-US'),
    },
    {
      detail: 'Require a verification decision',
      icon: 'trend',
      label: 'Pending review',
      trend: 'Live',
      value: pendingFarmerCount.toLocaleString('en-US'),
    },
  ]
}
