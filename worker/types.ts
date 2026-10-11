export type Bindings = Env & {
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  LINK_SECRET: string;
};
export type AppEnv = { Bindings: Bindings };
export type Row = Record<string, any>;
