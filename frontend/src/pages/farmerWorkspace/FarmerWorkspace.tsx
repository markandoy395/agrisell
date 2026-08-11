import type { EntityRecord, FarmerFarm } from "../../types/dashboard";
import { FarmerControls } from "../../components/ui/farmerWorkspace/FarmerControls";
import { FarmerSummaryGrid } from "../../components/ui/farmerWorkspace/FarmerSummaryGrid";
import { FarmerTable } from "../../components/ui/farmerWorkspace/FarmerTable";
import { FarmerFarmDrilldown } from "../../components/ui/farmerFarmDrilldown/FarmerFarmDrilldown";
import { useFarmerWorkspace } from "../../hooks/useFarmerWorkspace";
import "./FarmerWorkspace.css";

type FarmerWorkspaceProps = {
  farmers: EntityRecord[];
  farms: FarmerFarm[];
  search: string;
  created: EntityRecord[];
  onAdd: () => void;
  onOpen: (record: EntityRecord) => void;
  onReviewAction: (
    action: "approved" | "requested-information",
    farmer: EntityRecord,
  ) => Promise<void>;
};

export function FarmerWorkspace({
  farmers,
  farms,
  search,
  created,
  onAdd,
  onOpen,
  onReviewAction,
}: FarmerWorkspaceProps) {
  const workspace = useFarmerWorkspace({
    created,
    farmers,
    farms,
    onOpen,
    onReviewAction,
    search,
  });

  if (workspace.selectedFarmer) {
    return (
      <FarmerFarmDrilldown
        farmer={workspace.selectedFarmer}
        farms={workspace.selectedFarmerFarms}
        selectedFarmId={workspace.selectedFarmId}
        isImageGalleryOpen={workspace.isFarmImageGalleryOpen}
        onSelectFarm={workspace.onSelectFarm}
        onClearSelection={workspace.clearSelectedFarmer}
        onOpenImageGallery={workspace.onOpenImageGallery}
        onCloseImageGallery={workspace.onCloseImageGallery}
        onApproveFarmer={workspace.approveSelectedFarmer}
        onRequestInformation={workspace.requestSelectedFarmerInformation}
      />
    );
  }

  return (
    <section
      className="user-workspace farmer-workspace"
      aria-labelledby="farmers-title"
    >
      <h1 className="user-workspace-title" id="farmers-title">
        Farmers
      </h1>
      <FarmerSummaryGrid cards={workspace.farmerSummaryCards} />
      <FarmerControls
        {...workspace.farmerControls}
        onAdd={onAdd}
        onDownload={workspace.downloadFarmers}
        onLocationFilterChange={workspace.updateFarmerLocationFilter}
        onQueryChange={workspace.updateFarmerQuery}
        onSpecialtyFilterChange={workspace.updateFarmerSpecialtyFilter}
        onStatusFilterChange={workspace.updateFarmerStatusFilter}
      />
      <FarmerTable
        activePage={workspace.activeFarmerPage}
        allVisibleSelected={workspace.allVisibleFarmersSelected}
        farmerFarmLookup={workspace.farmerFarmLookup}
        farmers={workspace.pageFarmers}
        pageNumbers={workspace.farmerPageNumbers}
        selectedFarmerRecordKeys={workspace.selectedFarmerRecordKeys}
        totalCount={workspace.filteredFarmers.length}
        totalPages={workspace.totalFarmerPages}
        onApproveFarmer={workspace.approveFarmer}
        onOpenFarmer={workspace.openFarmer}
        onPageChange={workspace.setFarmerCurrentPage}
        onToggleAllVisible={workspace.toggleAllVisibleFarmers}
        onToggleFarmerSelection={workspace.toggleFarmerSelection}
      />
    </section>
  );
}
