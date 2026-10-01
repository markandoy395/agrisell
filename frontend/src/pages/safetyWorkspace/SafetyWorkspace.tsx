import { useState } from 'react'
import { SafetyHeaderSummary } from './SafetyHeaderSummary'
import { SafetyIncidentList } from './SafetyIncidentList'
import { SafetyIncidentResolveDialog } from './SafetyIncidentResolveDialog'
import { ContactCallingModal } from '../../components/ui/contactCallingModal/ContactCallingModal'
import { useSafetyData } from './useSafetyData'
import type { SafetyIncident } from './safetyWorkspace.types'
import './SafetyWorkspace.css'

export function SafetyWorkspace({ onNotice }: { onNotice: (message: string) => void }) {
  const data = useSafetyData(onNotice)
  const [callingIncident, setCallingIncident] = useState<SafetyIncident | null>(null)

  return (
    <section
      className="safety-workspace"
      aria-labelledby="safety-sos-title"
    >
      <h1 className="safety-visually-hidden" id="safety-sos-title">Rider Safety & Emergency SOS</h1>
      <SafetyHeaderSummary
        summary={data.summary}
        filter={data.filter}
        search={data.search}
        onFilterChange={data.setFilter}
        onSearchChange={data.setSearch}
      />

      <SafetyIncidentList
        incidents={data.incidents}
        isLoading={data.isLoading}
        busyIncidentId={data.busyIncidentId}
        onResolve={data.setSelectedIncident}
        onCallContact={setCallingIncident}
      />

      <SafetyIncidentResolveDialog
        incident={data.selectedIncident}
        onClose={() => data.setSelectedIncident(null)}
        onSubmit={data.submitResolution}
        onViewReport={(reportId) => {
          data.setFilter('resolved')
          data.setSearch(reportId)
          data.setSelectedIncident(null)
        }}
      />

      {callingIncident && (
        <ContactCallingModal
          isOpen={Boolean(callingIncident)}
          onClose={() => setCallingIncident(null)}
          contactName={
            callingIncident.reporter?.name ||
            callingIncident.reporter_name ||
            callingIncident.rider?.full_name ||
            'Contact'
          }
          contactNumber={
            callingIncident.reporter?.contact_number ||
            callingIncident.reporter_contact ||
            callingIncident.rider?.contact_number ||
            '09207395938'
          }
          contactRole={
            callingIncident.reporter?.role ||
            callingIncident.reporter_role ||
            (callingIncident.rider ? 'rider' : 'farmer')
          }
          contactAvatarUrl={
            callingIncident.reporter?.profile_photo_url ||
            callingIncident.rider?.profile_photo_url
          }
          referenceId={callingIncident.report_id}
          referenceType="Incident ID"
          onSaveLog={async (log) => {
            const role =
              callingIncident.reporter?.role ||
              callingIncident.reporter_role ||
              (callingIncident.rider ? 'rider' : 'farmer')
            await data.submitContactLog(
              callingIncident.report_id,
              log.outcome,
              log.notes,
              role,
            )
          }}
        />
      )}
    </section>
  )
}
