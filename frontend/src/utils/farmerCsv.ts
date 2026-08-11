import type { EntityRecord, FarmerFarm } from "../types/dashboard";
import {
  getFarmerCommodityList,
  getFarmerFarms,
  getFarmerLocationList,
} from "./farmerWorkspace";

function getCsvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function downloadFarmersCsv(
  farmers: EntityRecord[],
  farms: FarmerFarm[],
) {
  const headers = [
    "farmer_user_id",
    "name",
    "specialty",
    "registered_farms",
    "verification",
    "farm_locations",
    "commodities",
  ];
  const rows = farmers.map((farmer) => {
    const linkedFarms = getFarmerFarms(farmer, farms);
    const locations = getFarmerLocationList(linkedFarms).join("; ");
    const commodities = getFarmerCommodityList(linkedFarms).join("; ");

    return [
      farmer.entityId ?? "",
      farmer.primary,
      farmer.category,
      farmer.value,
      farmer.status,
      locations,
      commodities,
    ]
      .map(getCsvValue)
      .join(",");
  });
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "agrisell-farmers.csv";
  link.click();
  URL.revokeObjectURL(url);
}
