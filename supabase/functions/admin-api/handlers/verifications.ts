import type { Admin, HandlerResult } from "../types.ts";
import { approveFarmer, approveRider } from "../services/approvals.ts";
import { requestFarmerInformation } from "../services/workspace.ts";
import { getVerification, updateVerification, type VerificationType } from "../services/verification.ts";
import { requirePermission } from "./permission.ts";

export const handleVerificationRoutes = async (
  request: Request, pathname: string, admin: Admin,
): Promise<HandlerResult | null> => {
  const verification = pathname.match(/^\/api\/admin\/verifications\/(farmer|rider)\/([^/]+)$/);
  if (verification && (request.method === "GET" || request.method === "PATCH")) {
    const type = verification[1] as VerificationType;
    const entityId = decodeURIComponent(verification[2]);
    requirePermission(admin.permissions, type === "farmer" ? "farmers:manage" : "logistics:manage");
    if (request.method === "GET") {
      return { status: 200, body: await getVerification(type, entityId) };
    }
    const action = await updateVerification(
      type, entityId, await request.json().catch(() => null), admin,
    );
    return { status: 200, body: { action } };
  }
  const farmerApproval = pathname.match(/^\/api\/admin\/farmers\/([^/]+)\/approval$/);
  if (farmerApproval && request.method === "PATCH") {
    requirePermission(admin.permissions, "farmers:manage");
    return {
      status: 200,
      body: { farmer: await approveFarmer(decodeURIComponent(farmerApproval[1])) },
    };
  }
  const information = pathname.match(/^\/api\/admin\/farmers\/([^/]+)\/information-requests$/);
  if (information && request.method === "POST") {
    requirePermission(admin.permissions, "farmers:manage");
    const saved = await requestFarmerInformation(decodeURIComponent(information[1]), admin);
    return { status: 201, body: { request: saved } };
  }
  const riderApproval = pathname.match(/^\/api\/admin\/riders\/([^/]+)\/approval$/);
  if (riderApproval && request.method === "PATCH") {
    requirePermission(admin.permissions, "logistics:manage");
    return {
      status: 200,
      body: { rider: await approveRider(decodeURIComponent(riderApproval[1])) },
    };
  }
  return null;
};
