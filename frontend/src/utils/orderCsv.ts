export type OrderCsvRow = {
  trackingNumber: string;
  recipientName: string;
  orderDate: string;
  destination: string;
  serviceType: string;
  courier: string;
  estimatedArrival: string;
  status: string;
};

function getCsvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function downloadOrdersCsv(rows: OrderCsvRow[]) {
  const headers = [
    "Tracking number",
    "Recipient name",
    "Order date",
    "Destination address",
    "Service type",
    "Courier",
    "Estimated arrival",
    "Order status",
  ];
  const csvRows = rows.map((row) =>
    [
      row.trackingNumber,
      row.recipientName,
      row.orderDate,
      row.destination,
      row.serviceType,
      row.courier,
      row.estimatedArrival,
      row.status,
    ]
      .map(getCsvValue)
      .join(","),
  );
  const blob = new Blob(
    [[headers.map(getCsvValue).join(","), ...csvRows].join("\n")],
    {
      type: "text/csv;charset=utf-8",
    },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "agrisell-orders.csv";
  link.click();
  URL.revokeObjectURL(url);
}
