import { requestSupabase } from "../repository.ts";
import type { Row } from "../types.ts";
import { text } from "../value.ts";

export const getAuthUserByEmail = async (email: string) => {
  const result = await requestSupabase("/auth/v1/admin/users?per_page=1000") as Row;
  const users = Array.isArray(result?.users) ? result.users : [];
  return users.find((user): user is Row =>
    typeof user === "object" && user !== null &&
    text((user as Row).email).toLowerCase() === email);
};
