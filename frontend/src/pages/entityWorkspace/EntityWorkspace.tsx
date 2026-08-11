import { useMemo } from "react";
import {
  adminLocationPins,
  entityInfo,
  entityRows,
  entityTableColumns,
  moduleHighlights,
} from "../../data/dashboardMock";
import type { EntityRecord, EntityTableColumn } from "../../types/dashboard";
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
      .map((record) => Number(record.value.match(/[\d.]+/)?.[0]))
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

const FALLBACK_TABLE_COLUMNS: EntityTableColumn[] = [
  { label: "RECORD", field: "primary", helperField: "secondary" },
  { label: "TYPE / CATEGORY", field: "category" },
  { label: "DETAIL", field: "value" },
  { label: "STATUS", field: "status", isStatus: true },
];

const SECTIONS_WITH_LOCATION_MAP = new Set(["Farms"]);

type ReviewMeta = {
  comment: string;
  date: string;
  reviewCount: number;
  spent: string;
  avatarTone: string;
  featured?: boolean;
};

const REVIEW_RATING_DISTRIBUTION = [
  { rating: 5, count: 151, percent: 64 },
  { rating: 4, count: 54, percent: 23 },
  { rating: 3, count: 21, percent: 9 },
  { rating: 2, count: 7, percent: 3 },
  { rating: 1, count: 3, percent: 1 },
] as const;

const REVIEW_META: readonly ReviewMeta[] = [
  {
    comment:
      "The romaine arrived crisp and clean, and the farmer packed it beautifully. Delivery updates were clear from pickup to doorstep.",
    date: "24-06-2026",
    reviewCount: 14,
    spent: "PHP 8,420",
    avatarTone: "green",
    featured: true,
  },
  {
    comment:
      "Sweet mangoes and a quick handoff from the rider. I would love a little more detail on ripeness next time, but the order was still very good.",
    date: "22-06-2026",
    reviewCount: 9,
    spent: "PHP 5,160",
    avatarTone: "gold",
  },
  {
    comment:
      "The eggs were fresh, but one tray had a cracked piece. Please help me understand the replacement process for future orders.",
    date: "19-06-2026",
    reviewCount: 4,
    spent: "PHP 2,760",
    avatarTone: "orange",
  },
] as const;

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

const getReviewRating = (value: string) => {
  const rating = Number(value.match(/\d+(?:\.\d+)?/)?.[0] ?? 5);

  return Math.min(5, Math.max(1, Math.round(rating)));
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
  const baseInfo = entityInfo[section];
  const tableColumns = entityTableColumns[section] ?? FALLBACK_TABLE_COLUMNS;
  const showAdminLocationMap = SECTIONS_WITH_LOCATION_MAP.has(section);
  const allRecords = useMemo(
    () => [...created, ...(liveRecords ?? entityRows[section] ?? [])],
    [created, liveRecords, section],
  );
  const info =
    liveRecords === undefined
      ? baseInfo
      : {
          ...baseInfo,
          total: `${allRecords.length} ${allRecords.length === 1 ? "record" : "records"}`,
        };
  const highlights =
    liveRecords === undefined
      ? moduleHighlights[section]
      : getLiveHighlights(section, allRecords);
  const records = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return allRecords.filter((record) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        `${record.primary} ${record.secondary} ${record.category} ${record.value} ${record.status}`
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
      records.map((record, index) => ({
        record,
        initials: getReviewInitials(record.primary),
        rating: getReviewRating(record.value),
        ...REVIEW_META[index % REVIEW_META.length],
      })),
    [records],
  );

  if (section === "Reviews") {
    const averageRating =
      highlights.find((highlight) => highlight.label === "Average rating")
        ?.value ?? "4.8";
    const needsReply =
      highlights.find((highlight) => highlight.label === "Needs reply")
        ?.value ?? "0";

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
            <strong>{info.total.replace(" reviews", "")}</strong>
            <small>
              <b>21% up</b> Growth in reviews on this year
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
            <small>Average rating on this year</small>
          </article>
          <article className="review-distribution">
            {REVIEW_RATING_DISTRIBUTION.map((item) => (
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
            {activeOnly ? "Showing published" : `${needsReply} need replies`}
          </button>
        </div>

        <div className="review-list">
          {reviewCards.map((review) => (
            <article
              className="review-card"
              key={`${review.record.primary}-${review.record.secondary}`}
            >
              <div
                className={`review-avatar review-avatar-${review.avatarTone}`}
                aria-hidden="true"
              >
                {review.initials}
              </div>
              <div className="review-author">
                <h3>{review.record.primary}</h3>
                <span>Total Spent: {review.spent}</span>
                <span>Total Review: {review.reviewCount}</span>
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
                    className={`review-like-button ${
                      review.featured ? "is-liked" : ""
                    }`}
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
          pins={locationPins ?? adminLocationPins}
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
