import { useMemo } from 'react'
import { getEntityInfo, getEntityTableColumns } from '../../data/entityWorkspaceConfig'
import { EntityTableWorkspace } from './EntityTableWorkspace'
import type { EntityWorkspaceProps } from './entityWorkspace.types'
import { ACTIVE_RECORD_STATUSES, getLiveHighlights } from './entityWorkspace.utils'
import { ReviewWorkspace } from './ReviewWorkspace'
import './EntityWorkspace.css'

export function EntityWorkspace({
  locationPins,
  records: liveRecords,
  section,
  search,
  created,
  activeOnly,
  period = 'This month',
  onToggleFilter,
  onAdd,
  onOpen,
  onReviewModeration,
  onReviewResponse,
}: EntityWorkspaceProps) {
  const info = getEntityInfo(section)
  const allRecords = useMemo(() => [...created, ...(liveRecords ?? [])], [created, liveRecords])
  const visibleRecords = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim()
    return allRecords.filter((record) => {
      const searchable = [
        record.primary,
        record.secondary,
        record.category,
        record.value,
        record.status,
        record.reviewedName ?? '',
        record.referenceLabel ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return (
        (!normalizedSearch || searchable.includes(normalizedSearch)) &&
        (!activeOnly || ACTIVE_RECORD_STATUSES.has(record.status))
      )
    })
  }, [activeOnly, allRecords, search])
  const highlights = getLiveHighlights(section, allRecords)

  if (section === 'Reviews') {
    return (
      <ReviewWorkspace
        activeOnly={activeOnly}
        averageRating={highlights.find(({ label }) => label === 'Average rating')?.value ?? '4.8'}
        description={info.description}
        onReviewModeration={onReviewModeration}
        onReviewResponse={onReviewResponse}
        onToggleFilter={onToggleFilter}
        period={period}
        records={allRecords}
        visibleRecords={visibleRecords}
      />
    )
  }

  return (
    <EntityTableWorkspace
      activeOnly={activeOnly}
      columns={getEntityTableColumns(section)}
      description={info.description}
      highlights={highlights}
      locationPins={locationPins}
      onAdd={onAdd}
      onOpen={onOpen}
      onToggleFilter={onToggleFilter}
      records={visibleRecords}
      section={section}
      singular={info.singular}
      total={`${allRecords.length} ${allRecords.length === 1 ? 'record' : 'records'}`}
    />
  )
}
