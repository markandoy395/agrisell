import { useMemo, useState } from "react";
import type {
  EntityRecord,
  FarmerFarm,
  FarmerSummaryCard,
} from "../types/dashboard";
import { downloadFarmersCsv } from "../utils/farmerCsv";
import {
  allFarmerLocationsFilter,
  allFarmerSpecialtiesFilter,
  allFarmerStatusFilter,
  createFarmerFarmLookup,
  farmerPageSize,
  getFarmerLocationOptions,
  getFarmerRecordKey,
  getFarmerRecordsMatchingSearch,
  getFarmerSpecialtyOptions,
  getFarmerStatusOptions,
  getFilteredFarmerRecords,
  getFirstFarmIdForFarmer,
} from "../utils/farmerWorkspace";

type UseFarmerWorkspaceParams = {
  farmers: EntityRecord[];
  farms: FarmerFarm[];
  search: string;
  created: EntityRecord[];
  onOpen: (record: EntityRecord) => void;
  onReviewAction: (
    action: "approved" | "requested-information",
    farmer: EntityRecord,
  ) => Promise<void>;
};

const createFarmerSummaryCards = (
  farmers: EntityRecord[],
  farms: FarmerFarm[],
): FarmerSummaryCard[] => {
  const verifiedFarmerCount = farmers.filter(
    (farmer) => farmer.status === "Verified",
  ).length;
  const pendingFarmerCount = farmers.filter((farmer) =>
    /(pending|review)/i.test(farmer.status),
  ).length;

  return [
    {
      detail: "Registered farmer profiles",
      icon: "sprout",
      label: "Farmers",
      trend: "Live",
      value: farmers.length.toLocaleString("en-US"),
    },
    {
      detail: "Across farmer profiles",
      icon: "leaf",
      label: "Registered farms",
      trend: "Live",
      value: farms.length.toLocaleString("en-US"),
    },
    {
      detail: "Ready to sell on Agrisell",
      icon: "settings",
      label: "Verified farmers",
      trend: "Live",
      value: verifiedFarmerCount.toLocaleString("en-US"),
    },
    {
      detail: "Require a verification decision",
      icon: "trend",
      label: "Pending review",
      trend: "Live",
      value: pendingFarmerCount.toLocaleString("en-US"),
    },
  ];
};

export function useFarmerWorkspace({
  farmers,
  farms,
  search,
  created,
  onOpen,
  onReviewAction,
}: UseFarmerWorkspaceParams) {
  const [selectedFarmerId, setSelectedFarmerId] = useState<string | null>(null);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(null);
  const [isFarmImageGalleryOpen, setIsFarmImageGalleryOpen] = useState(false);
  const [farmerQuery, setFarmerQuery] = useState("");
  const [farmerSpecialtyFilter, setFarmerSpecialtyFilter] = useState(
    allFarmerSpecialtiesFilter,
  );
  const [farmerLocationFilter, setFarmerLocationFilter] = useState(
    allFarmerLocationsFilter,
  );
  const [farmerStatusFilter, setFarmerStatusFilter] = useState(
    allFarmerStatusFilter,
  );
  const [selectedFarmerRecordKeys, setSelectedFarmerRecordKeys] = useState<
    Set<string>
  >(() => new Set());
  const [farmerCurrentPage, setFarmerCurrentPage] = useState(1);
  const [farmerReviewStatuses, setFarmerReviewStatuses] = useState<
    Record<string, Pick<EntityRecord, "status" | "tone">>
  >({});

  const allFarmers = useMemo(
    () =>
      [...created, ...farmers].map((farmer) => {
        const reviewStatus = farmer.entityId
          ? farmerReviewStatuses[farmer.entityId]
          : undefined;

        return reviewStatus ? { ...farmer, ...reviewStatus } : farmer;
      }),
    [created, farmerReviewStatuses, farmers],
  );
  const farmerFarmLookup = useMemo(
    () => createFarmerFarmLookup(farms),
    [farms],
  );
  const farmersMatchingTopbarSearch = useMemo(
    () => getFarmerRecordsMatchingSearch(allFarmers, farmerFarmLookup, search),
    [allFarmers, farmerFarmLookup, search],
  );
  const filteredFarmers = useMemo(
    () =>
      getFilteredFarmerRecords(
        farmersMatchingTopbarSearch,
        farmerFarmLookup,
        {
          query: farmerQuery,
          specialty: farmerSpecialtyFilter,
          location: farmerLocationFilter,
          status: farmerStatusFilter,
        },
      ),
    [
      farmerFarmLookup,
      farmerLocationFilter,
      farmerQuery,
      farmersMatchingTopbarSearch,
      farmerSpecialtyFilter,
      farmerStatusFilter,
    ],
  );
  const totalFarmerPages = Math.max(
    1,
    Math.ceil(filteredFarmers.length / farmerPageSize),
  );
  const activeFarmerPage = Math.min(farmerCurrentPage, totalFarmerPages);
  const pageFarmers = filteredFarmers.slice(
    (activeFarmerPage - 1) * farmerPageSize,
    activeFarmerPage * farmerPageSize,
  );
  const visibleFarmerRecordKeys = pageFarmers.map(getFarmerRecordKey);
  const allVisibleFarmersSelected =
    visibleFarmerRecordKeys.length > 0 &&
    visibleFarmerRecordKeys.every((recordKey) =>
      selectedFarmerRecordKeys.has(recordKey),
    );

  const resetFarmerPage = () => setFarmerCurrentPage(1);
  const updateFarmerQuery = (query: string) => {
    setFarmerQuery(query);
    resetFarmerPage();
  };
  const updateFarmerSpecialtyFilter = (specialty: string) => {
    setFarmerSpecialtyFilter(specialty);
    resetFarmerPage();
  };
  const updateFarmerLocationFilter = (location: string) => {
    setFarmerLocationFilter(location);
    resetFarmerPage();
  };
  const updateFarmerStatusFilter = (status: string) => {
    setFarmerStatusFilter(status);
    resetFarmerPage();
  };

  const toggleAllVisibleFarmers = () => {
    setSelectedFarmerRecordKeys((current) => {
      const nextSelectedFarmerRecordKeys = new Set(current);

      visibleFarmerRecordKeys.forEach((recordKey) => {
        if (allVisibleFarmersSelected) {
          nextSelectedFarmerRecordKeys.delete(recordKey);
        } else {
          nextSelectedFarmerRecordKeys.add(recordKey);
        }
      });

      return nextSelectedFarmerRecordKeys;
    });
  };

  const toggleFarmerSelection = (recordKey: string) => {
    setSelectedFarmerRecordKeys((current) => {
      const nextSelectedFarmerRecordKeys = new Set(current);

      if (nextSelectedFarmerRecordKeys.has(recordKey)) {
        nextSelectedFarmerRecordKeys.delete(recordKey);
      } else {
        nextSelectedFarmerRecordKeys.add(recordKey);
      }

      return nextSelectedFarmerRecordKeys;
    });
  };

  const openFarmer = (farmer: EntityRecord) => {
    if (!farmer.entityId) {
      onOpen(farmer);
      return;
    }

    setSelectedFarmerId(farmer.entityId);
    setSelectedFarmId(getFirstFarmIdForFarmer(farmer.entityId, farms));
    setIsFarmImageGalleryOpen(false);
  };

  const clearSelectedFarmer = () => {
    setSelectedFarmerId(null);
    setSelectedFarmId(null);
    setIsFarmImageGalleryOpen(false);
  };

  const selectedFarmer =
    selectedFarmerId === null
      ? null
      : (allFarmers.find((farmer) => farmer.entityId === selectedFarmerId) ??
        null);

  const updateFarmerReview = async (
    farmer: EntityRecord,
    action: "approved" | "requested-information",
  ) => {
    const farmerId = farmer.entityId;
    if (!farmerId) return;

    const nextStatus =
      action === "approved"
        ? { status: "Verified", tone: "green" }
        : { status: "Needs information", tone: "orange" };

    await onReviewAction(action, farmer);
    setFarmerReviewStatuses((current) => ({
      ...current,
      [farmerId]: nextStatus,
    }));
  };

  return {
    activeFarmerPage,
    allVisibleFarmersSelected,
    farmerControls: {
      locationFilter: farmerLocationFilter,
      locationOptions: getFarmerLocationOptions(allFarmers, farmerFarmLookup),
      query: farmerQuery,
      specialtyFilter: farmerSpecialtyFilter,
      specialtyOptions: getFarmerSpecialtyOptions(allFarmers),
      statusFilter: farmerStatusFilter,
      statusOptions: getFarmerStatusOptions(allFarmers),
    },
    farmerFarmLookup,
    farmerPageNumbers: Array.from(
      { length: totalFarmerPages },
      (_, index) => index + 1,
    ),
    farmerSummaryCards: createFarmerSummaryCards(allFarmers, farms),
    filteredFarmers,
    isFarmImageGalleryOpen,
    pageFarmers,
    selectedFarmId,
    selectedFarmer,
    selectedFarmerFarms:
      selectedFarmerId === null ? [] : (farmerFarmLookup[selectedFarmerId] ?? []),
    selectedFarmerRecordKeys,
    totalFarmerPages,
    clearSelectedFarmer,
    downloadFarmers: () => downloadFarmersCsv(filteredFarmers, farms),
    onCloseImageGallery: () => setIsFarmImageGalleryOpen(false),
    onOpenImageGallery: () => setIsFarmImageGalleryOpen(true),
    approveFarmer: (farmer: EntityRecord) =>
      updateFarmerReview(farmer, "approved"),
    approveSelectedFarmer: () => {
      if (selectedFarmer) return updateFarmerReview(selectedFarmer, "approved");
      return Promise.resolve();
    },
    onSelectFarm: setSelectedFarmId,
    requestSelectedFarmerInformation: () => {
      if (selectedFarmer) {
        return updateFarmerReview(selectedFarmer, "requested-information");
      }
      return Promise.resolve();
    },
    openFarmer,
    setFarmerCurrentPage,
    toggleAllVisibleFarmers,
    toggleFarmerSelection,
    updateFarmerLocationFilter,
    updateFarmerQuery,
    updateFarmerSpecialtyFilter,
    updateFarmerStatusFilter,
  };
}
