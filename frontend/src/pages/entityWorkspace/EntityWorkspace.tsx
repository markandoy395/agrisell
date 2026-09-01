import { useMemo } from "react";
import { getEntityInfo, getEntityTableColumns } from "../../data/entityWorkspaceConfig";
import type { EntityRecord } from "../../types/dashboard";
import type { LocationPin, ModuleHighlight } from "../../types/dashboard";
import { Icon } from "../../components/ui/icon/Icon";
import { LocationPinsMap } from "../../components/ui/locationPinsMap/LocationPinsMap";
import "./EntityWorkspace.css";

type EntityWorkspaceProps = {
  locationPins?: LocationPin[];
  records?: EntityRecord[];
  section: string;
  search: string;
  created: EntityRecord[];
  activeOnly: boolean;
  period?: string;
  onToggleFilter: () => void;
  onAdd: () => void;
  onOpen: (record: EntityRecord) => void;
};

const getLiveHighlights = (
  section: string,
  records: EntityRecord[],
): ModuleHighlight[] => {
  if (section === "Reviews") {
    const ratings = records
      .map((record) => record.rating ?? Number(record.value.match(/[\d.]+/)?.[0]))
      .filter((rating) => Number.isFinite(rating));
    const averageRating =
      ratings.length === 0
        ? "0.0"
        : (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1);

    return [
      { detail: "Submitted database reviews", label: "Total reviews", value: String(records.length) },
      { detail: "Average customer rating", label: "Average rating", value: averageRating },
      {
        detail: "Reviews that need attention",
        label: "Needs reply",
        value: String(records.filter((record) => /pending|review/i.test(record.status)).length),
      },
    ];
  }

  const activeRecords = records.filter((record) =>
    ACTIVE_RECORD_STATUSES.has(record.status),
  ).length;
  const attentionRecords = records.length - activeRecords;

  return [
    {
      detail: "Current database records",
      label: "Total records",
      value: String(records.length),
    },
    {
      detail: "Available, active, or completed",
      label: "Active records",
      value: String(activeRecords),
    },
    {
      detail: "Pending or inactive records",
      label: "Need attention",
      value: String(attentionRecords),
    },
  ];
};

const ACTIVE_RECORD_STATUSES = new Set([
  "Active",
  "Available",
  "Verified",
  "Completed",
  "Published",
  "Delivered",
  "In cart",
  "To deliver",
  "In transit",
  "Processing",
  "Paid",
  "On delivery",
]);

const SECTIONS_WITH_LOCATION_MAP = new Set(["Farms"]);

const getModuleClassName = (section: string) =>
  `module-${section.toLowerCase().replace(/\s+/g, "-")}`;

const getReviewInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const getReviewRating = (record: EntityRecord) => {
  const rating = record.rating ?? Number(record.value.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);

  return Math.min(5, Math.max(0, Math.round(rating)));
};

const formatReviewDate = (value?: string) => {
  if (!value) return "Date not recorded";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
};

const getReviewDistribution = (records: EntityRecord[]) => {
  const ratings = records.map(getReviewRating).filter((rating) => rating >= 1);

  return [5, 4, 3, 2, 1].map((rating) => {
    const count = ratings.filter((recordRating) => recordRating === rating).length;

    return {
      count,
      percent: ratings.length === 0 ? 0 : Math.round((count / ratings.length) * 100),
      rating,
    };
  });
};

const renderReviewStars = (rating: number, size = 13) =>
  Array.from({ length: 5 }, (_, index) => (
    <span
      className={`review-star ${index < rating ? "is-filled" : ""}`}
      key={index}
      aria-hidden="true"
    >
      <Icon name="star" size={size} />
    </span>
  ));

export function EntityWorkspace({
  locationPins,
  records: liveRecords,
  section,
  search,
  created,
  activeOnly,
  period = "This month",
  onToggleFilter,
  onAdd,
  onOpen,
}: EntityWorkspaceProps) {
  const baseInfo = getEntityInfo(section);
  const tableColumns = getEntityTableColumns(section);
  const showAdminLocationMap = SECTIONS_WITH_LOCATION_MAP.has(section);
  const allRecords = useMemo(
    () => [...created, ...(liveRecords ?? [])],
    [created, liveRecords],
  );
  const info = {
    ...baseInfo,
    total: `${allRecords.length} ${allRecords.length === 1 ? "record" : "records"}`,
  };
  const highlights = getLiveHighlights(section, allRecords);
  const records = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return allRecords.filter((record) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        `${record.primary} ${record.secondary} ${record.category} ${record.value} ${record.status} ${record.reviewedName ?? ""} ${record.referenceLabel ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch);

      return (
        matchesSearch &&
        (!activeOnly || ACTIVE_RECORD_STATUSES.has(record.status))
      );
    });
  }, [activeOnly, allRecords, search]);
  const reviewCards = useMemo(
    () =>
      records.map((record) => ({
        avatarTone:
          getReviewRating(record) <= 2
            ? "orange"
            : record.reviewedType === "Rider"
              ? "gold"
              : "green",
        comment: record.comment ?? record.secondary,
        date: formatReviewDate(record.reviewDate),
        record,
        initials: getReviewInitials(record.primary),
        rating: getReviewRating(record),
      })),
    [records],
  );

  if (section === "Reviews") {
    const averageRating =
      highlights.find((highlight) => highlight.label === "Average rating")
        ?.value ?? "4.8";
    const ratingDistribution = getReviewDistribution(allRecords);
    const farmerReviewCount = allRecords.filter(
      (record) => record.reviewedType === "Farmer",
    ).length;
    const riderReviewCount = allRecords.filter(
      (record) => record.reviewedType === "Rider",
    ).length;

    return (
      <section
        className="review-workspace panel module-reviews"
        aria-labelledby="reviews-title"
      >
        <div className="review-heading">
          <div>
            <span className="management-count">CUSTOMER FEEDBACK</span>
            <h2 id="reviews-title">Reviews</h2>
            <p>{info.description}</p>
          </div>
          <div className="review-period" aria-label={`Review period ${period}`}>
            <Icon name="calendar" size={16} />
            {period}
          </div>
        </div>

        <div className="review-overview" aria-label="Review summary">
          <article className="review-metric">
            <span>Total Reviews</span>
            <strong>{allRecords.length}</strong>
            <small>
              <b>{farmerReviewCount} farmer</b> and {riderReviewCount} rider reviews
            </small>
          </article>
          <article className="review-metric">
            <span>Average Rating</span>
            <strong>
              {averageRating}
              <span className="review-inline-stars">
                {renderReviewStars(Math.round(Number(averageRating)))}
              </span>
            </strong>
            <small>Average across all database reviews</small>
          </article>
          <article className="review-distribution">
            {ratingDistribution.map((item) => (
              <div className="review-rating-row" key={item.rating}>
                <span>{item.rating}</span>
                <div className="review-rating-track">
                  <i style={{ width: `${item.percent}%` }} />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </article>
        </div>

        <div className="review-toolbar">
          <span>{reviewCards.length} reviews shown</span>
          <button
            className={`filter-button ${activeOnly ? "is-active" : ""}`}
            type="button"
            onClick={onToggleFilter}
          >
            {activeOnly ? "Showing published" : "Show published only"}
          </button>
        </div>

        <div className="review-list">
          {reviewCards.map((review) => (
            <article
              className="review-card"
              key={review.record.entityId ?? `${review.record.primary}-${review.record.secondary}`}
            >
              <div
                className={`review-avatar review-avatar-${review.avatarTone}`}
                aria-hidden="true"
              >
                {review.initials}
              </div>
              <div className="review-author">
                <h3>{review.record.primary}</h3>
                <span>
                  Reviewed {review.record.reviewedType?.toLowerCase() ?? "account"}: {review.record.reviewedName ?? "Not recorded"}
                </span>
                <span>{review.record.referenceLabel ?? review.record.category}</span>
              </div>
              <div className="review-body">
                <div className="review-card-meta">
                  <span className="review-stars">
                    {renderReviewStars(review.rating, 14)}
                    <span className="review-sr-only">
                      {review.rating} out of 5 stars
                    </span>
                  </span>
                  <time>{review.date}</time>
                  <span className={`status ${review.record.tone}`}>
                    <i aria-hidden="true" />
                    {review.record.status}
                  </span>
                </div>
                <p>{review.comment}</p>
                <div className="review-card-actions">
                  <button
                    className="review-action-button"
                    type="button"
                    onClick={() => onOpen(review.record)}
                  >
                    <Icon name="message" size={15} />
                    Public Comment
                  </button>
                  <button
                    className="review-action-button"
                    type="button"
                    onClick={() => onOpen(review.record)}
                  >
                    <Icon name="mail" size={15} />
                    Direct Message
                  </button>
                  <button
                    className="review-like-button"
                    type="button"
                    onClick={() => onOpen(review.record)}
                    aria-label={`Mark ${review.record.primary}'s review as important`}
                  >
                    <Icon name="heart" size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}

          {reviewCards.length === 0 && (
            <div className="no-orders">No matching reviews found.</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className={`management-panel panel ${getModuleClassName(section)}`}
    >
      <div className="management-heading">
        <div>
          <span className="management-count">{info.total}</span>
          <h2>{section} workspace</h2>
          <p>{info.description}</p>
        </div>
        <button className="primary-button" type="button" onClick={onAdd}>
          + Add {info.singular}
        </button>
      </div>
      <div className="module-highlights">
        {highlights.map((highlight) => (
          <article key={highlight.label}>
            <span>{highlight.label}</span>
            <strong>{highlight.value}</strong>
            <small>{highlight.detail}</small>
          </article>
        ))}
      </div>
      {showAdminLocationMap && (
        <LocationPinsMap
          title="User and farmer pins"
          description="Agrisell user accounts and registered farmer farms across active service areas."
          pins={locationPins ?? []}
        />
      )}
      <div className="management-toolbar">
        <span>{records.length} records shown</span>
        <button
          className={`filter-button ${activeOnly ? "is-active" : ""}`}
          type="button"
          onClick={onToggleFilter}
        >
          {activeOnly ? "Showing active" : "Show active only"}
        </button>
      </div>
      <div className="entity-table-wrap">
        <table>
          <thead>
            <tr>
              {tableColumns.map((column) => (
                <th key={column.label}>{column.label}</th>
              ))}
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.primary}-${record.secondary}`}>
                {tableColumns.map((column) => {
                  const value = record[column.field];
                  const helper = column.helperField
                    ? record[column.helperField]
                    : null;

                  return (
                    <td key={column.label}>
                      {column.isStatus ? (
                        <span className={`status ${record.tone}`}>
                          <i aria-hidden="true" />
                          {value}
                        </span>
                      ) : helper ? (
                        <>
                          <strong>{value}</strong>
                          <small>{helper}</small>
                        </>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
                <td>
                  <button
                    className="row-open"
                    type="button"
                    onClick={() => onOpen(record)}
                    aria-label={`Open ${record.primary}`}
                  >
                    Open <Icon name="arrow" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && (
          <div className="no-orders">No matching records found.</div>
        )}
      </div>
    </section>
  );
}
