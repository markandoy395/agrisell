export type Row = Record<string, unknown>;

export type Admin = {
  avatarUrl?: string;
  email: string;
  name: string;
  permissions: string[];
  role: "admin";
  userId: string;
};

export type HandlerResult = {
  body: unknown;
  headers?: Record<string, string>;
  status: number;
};
