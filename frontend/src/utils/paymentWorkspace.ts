import type { EntityRecord, PaymentRecord } from "../types/dashboard";

export function getPaymentInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CU"
  );
}

export function createdRecordToPayment(record: EntityRecord): PaymentRecord {
  return {
    amount: record.value,
    customer: record.secondary,
    fee: "Not calculated",
    id: record.primary,
    method: record.category,
    net: record.value,
    order: record.secondary,
    settlement: "New record",
    status:
      record.status === "Completed" || record.status === "Pending"
        ? record.status
        : "Failed",
    time: "Created just now",
    tone: record.tone,
  };
}

export function paymentToEntityRecord(payment: PaymentRecord): EntityRecord {
  return {
    category: payment.method,
    primary: payment.id,
    secondary: `${payment.order} - ${payment.customer}`,
    status: payment.status,
    tone: payment.tone,
    value: `${payment.amount} / net ${payment.net}`,
  };
}
