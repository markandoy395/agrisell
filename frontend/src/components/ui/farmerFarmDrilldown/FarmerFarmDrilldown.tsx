import { useEffect } from "react";
import type { EntityRecord, FarmerFarm } from "../../../types/dashboard";
import { CloseButton } from "../closeButton/CloseButton";
import "./FarmerFarmDrilldown.css";

type FarmerFarmDrilldownProps = {
  farmer: EntityRecord;
  farms: FarmerFarm[];
  selectedFarmId: string | null;
  isImageGalleryOpen: boolean;
  onSelectFarm: (farmId: string) => void;
  onClearSelection: () => void;
  onOpenImageGallery: () => void;
  onCloseImageGallery: () => void;
  onApproveFarmer: () => Promise<void>;
  onRequestInformation: () => Promise<void>;
};

const VISIBLE_FARM_IMAGE_LIMIT = 4;

const getMapUrl = (gpsLat: number, gpsLong: number) =>
  `https://www.google.com/maps/search/?api=1&query=${gpsLat},${gpsLong}`;

const getMapEmbedUrl = (gpsLat: number, gpsLong: number) =>
  `https://maps.google.com/maps?q=${gpsLat},${gpsLong}&z=15&output=embed`;

const getFarmSummary = (farm: FarmerFarm) =>
  `${farm.farmSizeHectares} hectares - ${farm.totalCrops} crops`;

const getVisibleFarmImages = (farm: FarmerFarm) =>
  farm.farmImages.slice(0, VISIBLE_FARM_IMAGE_LIMIT);

const getHiddenFarmImageCount = (farm: FarmerFarm) =>
  Math.max(farm.farmImages.length - VISIBLE_FARM_IMAGE_LIMIT, 0);

export function FarmerFarmDrilldown({
  farmer,
  farms,
  selectedFarmId,
  isImageGalleryOpen,
  onSelectFarm,
  onClearSelection,
  onOpenImageGallery,
  onCloseImageGallery,
  onApproveFarmer,
  onRequestInformation,
}: FarmerFarmDrilldownProps) {
  const selectedFarm = farms.find((farm) => farm.id === selectedFarmId) ?? null;

  useEffect(() => {
    if (!isImageGalleryOpen) return;

    const closeGalleryOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onCloseImageGallery();
    };

    window.addEventListener("keydown", closeGalleryOnEscape);

    return () => {
      window.removeEventListener("keydown", closeGalleryOnEscape);
    };
  }, [isImageGalleryOpen, onCloseImageGallery]);

  return (
    <article className="farmer-farms-panel" aria-labelledby="farmer-farms-title">
      <div className="farmer-farms-heading">
        <div>
          <span className="management-count">FARMER - FARMS - COMMODITIES</span>
          <h3 id="farmer-farms-title">{farmer.primary}'s registered farms</h3>
          <p>
            Select a farm to review its GPS pin, farm images, registered crops,
            and linked commodities.
          </p>
        </div>
        <button className="filter-button" type="button" onClick={onClearSelection}>
          Clear selection
        </button>
      </div>
      {farms.length > 0 ? (
        <div className="farm-drilldown-grid">
          <div className="farm-card-list" aria-label="Registered farms">
            <section className="farmer-review-actions" aria-label="Farmer review actions">
              <span className="management-count">PROFILE REVIEW</span>
              <strong>{farmer.status === "Verified" ? "Profile approved" : "Review required"}</strong>
              <p>
                {farmer.status === "Verified"
                  ? "This farmer can sell through Agrisell."
                  : "Confirm the profile or request missing verification details."}
              </p>
              <div>
                <button
                  className="farmer-approve-button"
                  type="button"
                  onClick={() => {
                    void onApproveFarmer().catch(() => undefined);
                  }}
                  disabled={farmer.status === "Verified"}
                >
                  {farmer.status === "Verified" ? "Approved" : "Approve farmer"}
                </button>
                <button
                  className="farmer-request-info-button"
                  type="button"
                  onClick={() => {
                    void onRequestInformation().catch(() => undefined);
                  }}
                >
                  Request information
                </button>
              </div>
            </section>
            {farms.map((farm) => (
              <button
                className={`farm-card ${
                  selectedFarm?.id === farm.id ? "is-selected" : ""
                }`}
                key={farm.id}
                type="button"
                onClick={() => {
                  onSelectFarm(farm.id);
                  onCloseImageGallery();
                }}
                aria-pressed={selectedFarm?.id === farm.id}
              >
                <span className="farm-card-copy">
                  <span className={`status ${farm.tone}`}>
                    <i aria-hidden="true" />
                    {farm.status}
                  </span>
                  <strong>{farm.farmName}</strong>
                  <small>{farm.farmLocation}</small>
                  <span>{getFarmSummary(farm)}</span>
                </span>
                {farm.farmImages[0] && (
                  <span className="farm-card-thumbnail" aria-hidden="true">
                    <img src={farm.farmImages[0].imageUrl} alt="" />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="farm-location-detail">
            {selectedFarm ? (
              <>
                <div className="farm-location-header">
                  <div>
                    <span className="management-count">GPS PINPOINT</span>
                    <h4>{selectedFarm.farmName}</h4>
                    <p>
                      {selectedFarm.gpsLat.toFixed(4)},{" "}
                      {selectedFarm.gpsLong.toFixed(4)}
                    </p>
                  </div>
                  <a
                    className="map-link"
                    href={getMapUrl(selectedFarm.gpsLat, selectedFarm.gpsLong)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Maps
                  </a>
                </div>
                <div className="farm-map-media">
                  <iframe
                    className="farm-map-frame"
                    src={getMapEmbedUrl(
                      selectedFarm.gpsLat,
                      selectedFarm.gpsLong,
                    )}
                    title={`Map showing ${selectedFarm.farmName}`}
                    loading="lazy"
                  />
                  {selectedFarm.farmImages.length > 0 && (
                    <div
                      className={`farm-featured-image image-count-${getVisibleFarmImages(selectedFarm).length}`}
                      aria-label={`${selectedFarm.farmName} farm images`}
                    >
                      {getVisibleFarmImages(selectedFarm).map((image, index) => {
                        const moreImageCount =
                          index === VISIBLE_FARM_IMAGE_LIMIT - 1
                            ? getHiddenFarmImageCount(selectedFarm)
                            : 0;

                        return (
                          <button
                            className={
                              moreImageCount > 0
                                ? "farm-featured-tile has-more-images"
                                : "farm-featured-tile"
                            }
                            key={`${image.title}-${index}`}
                            type="button"
                            onClick={onOpenImageGallery}
                            aria-label={
                              moreImageCount > 0
                                ? `View all ${selectedFarm.farmImages.length} images for ${selectedFarm.farmName}`
                                : `View ${image.title} for ${selectedFarm.farmName}`
                            }
                          >
                            <img src={image.imageUrl} alt="" />
                            {moreImageCount > 0 && (
                              <span
                                className="farm-image-more"
                                aria-label={`${moreImageCount} more farm images`}
                              >
                                +{moreImageCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <dl className="farm-spec-grid">
                  <div>
                    <dt>Farming type</dt>
                    <dd>{selectedFarm.farmingType}</dd>
                  </div>
                  <div>
                    <dt>Soil type</dt>
                    <dd>{selectedFarm.soilType}</dd>
                  </div>
                  <div>
                    <dt>Irrigation</dt>
                    <dd>{selectedFarm.irrigationType}</dd>
                  </div>
                  <div>
                    <dt>Certifications</dt>
                    <dd>
                      {selectedFarm.certifications.length > 0
                        ? selectedFarm.certifications.join(", ")
                        : "No certifications listed"}
                    </dd>
                  </div>
                </dl>
                <div className="farm-commodity-list">
                  {selectedFarm.commodities.map((commodity) => (
                    <span key={commodity}>{commodity}</span>
                  ))}
                </div>
                {isImageGalleryOpen && (
                  <div
                    className="farm-gallery-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="farm-gallery-title"
                  >
                    <button
                      className="farm-gallery-backdrop"
                      type="button"
                      onClick={onCloseImageGallery}
                      aria-label="Close farm image gallery"
                    />
                    <div className="farm-gallery-dialog">
                      <div className="farm-gallery-header">
                        <div>
                          <span className="management-count">FARM IMAGES</span>
                          <h5 id="farm-gallery-title">
                            {selectedFarm.farmName}
                          </h5>
                        </div>
                        <CloseButton
                          label="Close farm image gallery"
                          onClick={onCloseImageGallery}
                        />
                      </div>
                      <div className="farm-gallery-grid">
                        {selectedFarm.farmImages.map((image, index) => (
                          <figure key={`${image.title}-gallery-${index}`}>
                            <img src={image.imageUrl} alt={image.alt} />
                            <figcaption>{image.title}</figcaption>
                          </figure>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="farm-location-empty">
                Select a farm to display its map pin and farm images.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="farm-location-empty">
          No farms are registered to this farmer yet.
        </div>
      )}
    </article>
  );
}
