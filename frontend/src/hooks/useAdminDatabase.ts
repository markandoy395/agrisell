import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../api/adminAuth";
import { getAdminDashboardData } from "../api/adminData";
import type { AdminDatabaseData } from "../types/adminData";

export function useAdminDatabase() {
  const [data, setData] = useState<AdminDatabaseData | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const nextData = await getAdminDashboardData();
      setData(nextData);
      setError("");
    } catch (requestError: unknown) {
      setError(
        getApiErrorMessage(
          requestError,
          "The marketplace data could not be loaded.",
        ),
      );
      throw requestError;
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  return { data, error, isLoading: data === null && !error, refresh };
}
