import type { UserWorkspaceRow } from "../types/dashboard";

function getCsvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function downloadUsersCsv(users: UserWorkspaceRow[]) {
  const headers = [
    "user_id",
    "first_name",
    "middle_name",
    "last_name",
    "extension_name",
    "email",
    "contact_number",
    "account_status",
    "created_at",
    "updated_at",
    "gender",
    "date_of_birth",
    "e_wallet_details",
    "buyer_user_id",
    "shipping_address",
    "loyalty_points",
    "preferred_payment_method",
    "user_type",
    "business_name",
  ];
  const rows = users.map((user) =>
    [
      user.userId,
      user.firstName,
      user.middleName,
      user.lastName,
      user.extensionName,
      user.email,
      user.contactNumber,
      user.accountStatus,
      user.createdAt,
      user.updatedAt,
      user.gender,
      user.dateOfBirth,
      user.eWalletDetails,
      user.buyerUserId ?? "",
      user.shippingAddress ?? "",
      String(user.loyaltyPoints ?? ""),
      user.preferredPaymentMethod ?? "",
      user.userType,
      user.businessName ?? "",
    ]
      .map(getCsvValue)
      .join(","),
  );
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "agrisell-users.csv";
  link.click();
  URL.revokeObjectURL(url);
}
