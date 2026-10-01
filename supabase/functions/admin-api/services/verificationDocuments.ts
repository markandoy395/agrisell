import { SUPABASE_URL } from "../config.ts";
import { getTable, requestSupabase } from "../repository.ts";
import type { Row } from "../types.ts";
import { id, text } from "../value.ts";

export const getVerificationDocuments = async (entityId: string) => {
  const documents = await getTable("rider_documents", { rider_id: `eq.${entityId}` });
  return await Promise.all(documents.map(async (document) => {
    const path = text(document.file_path);
    const { file_path: privatePath, ...safeDocument } = document;
    void privatePath;
    if (!path || path.includes("..") || path.startsWith("/") || path.includes("://")) {
      return safeDocument;
    }
    try {
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const signed = await requestSupabase(`/storage/v1/object/sign/rider-documents/${encoded}`, {
        body: JSON.stringify({ expiresIn: 300 }),
        headers: { "Content-Type": "application/json" }, method: "POST",
      }) as Row;
      const signedPath = text(signed.signedURL ?? signed.signedUrl);
      return {
        ...safeDocument,
        signed_url: signedPath.startsWith("/object/sign/")
          ? `${SUPABASE_URL}/storage/v1${signedPath}` : signedPath,
      };
    } catch {
      return { ...safeDocument, signed_url: "" };
    }
  }));
};

export const saveDocumentDecisions = async (
  entityId: string, decisions: unknown,
) => {
  if (!Array.isArray(decisions)) return;
  for (const raw of decisions) {
    const decision = raw as Row;
    const documentId = id(decision.documentId);
    const status = text(decision.status);
    const reason = text(decision.reason);
    if (!documentId || !["verified", "rejected"].includes(status) ||
        (status === "rejected" && !reason)) continue;
    await requestSupabase(
      `/rest/v1/rider_documents?document_id=eq.${encodeURIComponent(documentId)}&rider_id=eq.${encodeURIComponent(entityId)}`,
      {
        body: JSON.stringify({
          verification_status: status,
          rejection_reason: status === "rejected" ? reason : null,
          updated_at: new Date().toISOString(),
        }),
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        method: "PATCH",
      },
    );
  }
};
