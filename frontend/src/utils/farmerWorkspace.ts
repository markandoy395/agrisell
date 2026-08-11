import type {
  EntityRecord,
  FarmerFarm,
  FarmerFarmLookup,
  FarmerSummaryCard,
  FarmerWorkspaceFilters,
  ModuleHighlight,
} from "../types/dashboard";

export const farmerPageSize = 5;
export const allFarmerSpecialtiesFilter = "All specialties";
export const allFarmerLocationsFilter = "All farm locations";
export const allFarmerStatusFilter = "All verification";

export function createFarmerFarmLookup(farms: FarmerFarm[]) {
  return farms.reduce<FarmerFarmLookup>((lookup, farm) => {
    lookup[farm.farmerId] = [...(lookup[farm.farmerId] ?? []), farm];

    return lookup;
  }, {});
}

export function getFarmerFarms(farmer: EntityRecord, farms: FarmerFarm[]) {
  return farmer.entityId
    ? farms.filter((farm) => farm.farmerId === farmer.entityId)
    : [];
}

export function getFirstFarmIdForFarmer(
  farmerId: string,
  farms: FarmerFarm[],
) {
  return farms.find((farm) => farm.farmerId === farmerId)?.id ?? null;
}

export function getFarmerRecordKey(farmer: EntityRecord) {
  return farmer.entityId ?? `${farmer.primary}-${farmer.secondary}`;
}

export function getFarmerInitials(farmer: EntityRecord) {
  return farmer.primary
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function getFarmerLocationList(farms: FarmerFarm[]) {
  return Array.from(new Set(farms.map((farm) => farm.farmLocation)));
}

export function getFarmerCommodityList(farms: FarmerFarm[]) {
  return Array.from(new Set(farms.flatMap((farm) => farm.commodities)));
}

export function getFarmerLocationSummary(farms: FarmerFarm[]) {
  if (farms.length === 0) return "No registered farms";

  const locations = getFarmerLocationList(farms);

  return locations.length > 1
    ? `${locations[0]} +${locations.length - 1} more`
    : locations[0];
}

export function getFarmerCommoditySummary(farms: FarmerFarm[]) {
  const commodities = getFarmerCommodityList(farms);

  if (commodities.length === 0) return "No commodities linked";

  return commodities.length > 2
    ? `${commodities.slice(0, 2).join(", ")} +${commodities.length - 2}`
    : commodities.join(", ");
}

export function getFarmerHectareSummary(farms: FarmerFarm[]) {
  if (farms.length === 0) return "No farm area tracked";

  const totalHectares = farms.reduce(
    (total, farm) => total + farm.farmSizeHectares,
    0,
  );

  return `${totalHectares.toFixed(1)} hectares tracked`;
}

export function getFarmerSearchText(farmer: EntityRecord, farms: FarmerFarm[]) {
  return [
    farmer.entityId ?? "",
    farmer.primary,
    farmer.secondary,
    farmer.category,
    farmer.value,
    farmer.status,
    getFarmerLocationSummary(farms),
    getFarmerCommoditySummary(farms),
    ...farms.flatMap((farm) => [
      farm.farmName,
      farm.farmLocation,
      farm.farmingType,
      farm.status,
      ...farm.commodities,
      ...farm.certifications,
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

export function getFarmerRecordsMatchingSearch(
  farmers: EntityRecord[],
  farmerFarmLookup: FarmerFarmLookup,
  search: string,
) {
  const normalizedSearch = search.toLowerCase().trim();

  if (normalizedSearch.length === 0) return farmers;

  return farmers.filter((farmer) => {
    const farms = farmer.entityId ? farmerFarmLookup[farmer.entityId] ?? [] : [];

    return getFarmerSearchText(farmer, farms).includes(normalizedSearch);
  });
}

export function getFarmerSpecialtyOptions(farmers: EntityRecord[]) {
  return [
    allFarmerSpecialtiesFilter,
    ...Array.from(new Set(farmers.map((farmer) => farmer.category))).sort(),
  ];
}

export function getFarmerLocationOptions(
  farmers: EntityRecord[],
  farmerFarmLookup: FarmerFarmLookup,
) {
  return [
    allFarmerLocationsFilter,
    ...Array.from(
      new Set(
        farmers.flatMap((farmer) =>
          farmer.entityId
            ? (farmerFarmLookup[farmer.entityId] ?? []).map(
                (farm) => farm.farmLocation,
              )
            : [],
        ),
      ),
    ).sort(),
  ];
}

export function getFarmerStatusOptions(farmers: EntityRecord[]) {
  return [
    allFarmerStatusFilter,
    ...Array.from(new Set(farmers.map((farmer) => farmer.status))).sort(),
  ];
}

export function getFilteredFarmerRecords(
  farmers: EntityRecord[],
  farmerFarmLookup: FarmerFarmLookup,
  filters: FarmerWorkspaceFilters,
) {
  const normalizedQuery = filters.query.toLowerCase().trim();

  return farmers.filter((farmer) => {
    const farms = farmer.entityId ? farmerFarmLookup[farmer.entityId] ?? [] : [];
    const matchesQuery =
      normalizedQuery.length === 0 ||
      getFarmerSearchText(farmer, farms).includes(normalizedQuery);
    const matchesSpecialty =
      filters.specialty === allFarmerSpecialtiesFilter ||
      farmer.category === filters.specialty;
    const matchesLocation =
      filters.location === allFarmerLocationsFilter ||
      farms.some((farm) => farm.farmLocation === filters.location);
    const matchesStatus =
      filters.status === allFarmerStatusFilter ||
      farmer.status === filters.status;

    return matchesQuery && matchesSpecialty && matchesLocation && matchesStatus;
  });
}

export function getFarmerSummaryCards(
  highlights: ModuleHighlight[],
  registeredFarmCount: number,
): FarmerSummaryCard[] {
  return [
    {
      label: highlights[0].label,
      value: highlights[0].value,
      detail: highlights[0].detail,
      trend: "+4 this week",
      icon: "sprout",
    },
    {
      label: "Registered farms",
      value: String(registeredFarmCount),
      detail: "Across farmer profiles",
      trend: "+8 tracked",
      icon: "leaf",
    },
    {
      label: highlights[1].label,
      value: highlights[1].value,
      detail: highlights[1].detail,
      trend: "7 open",
      icon: "settings",
    },
    {
      label: highlights[2].label,
      value: highlights[2].value,
      detail: highlights[2].detail,
      trend: "+4",
      icon: "trend",
    },
  ];
}
