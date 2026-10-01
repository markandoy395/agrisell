import { downloadPaymentReport } from '../../api/payments'
import { getApiErrorMessage } from '../../api/adminAuth'
import { Icon } from '../../components/ui/icon/Icon'
import { WorkspaceStatsGrid } from '../../components/ui/workspaceStats/WorkspaceStatsGrid'
import type { PaymentSummaryCard } from '../../types/dashboard'

type PaymentHeaderSummaryProps = {
  cards: PaymentSummaryCard[]
  onNotice: (message: string) => void
}

export function PaymentHeaderSummary({ cards, onNotice }: PaymentHeaderSummaryProps) {
  const downloadReport = () => {
    void downloadPaymentReport()
      .then(() => onNotice('Accounting CSV downloaded.'))
      .catch((error) =>
        onNotice(getApiErrorMessage(error, 'The accounting report could not be downloaded.')),
      )
  }
  return (
    <>
      <header className="payment-workspace-header">
        <div>
          <span className="payment-kicker">MANAGEMENT</span>
          <h1>Payments</h1>
          <p>Monitor and manage all your payments in one place.</p>
        </div>
        <button className="payment-period-button" type="button" onClick={downloadReport}>
          <Icon name="download" size={15} />
          Export accounting CSV
        </button>
      </header>
      <WorkspaceStatsGrid
        ariaLabel="Payment summary"
        cards={cards.map((card) => ({ ...card, accent: card.tone }))}
      />
    </>
  )
}
