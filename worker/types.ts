export type Bindings = Env & {
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  LINK_SECRET: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
};
export type AppEnv = { Bindings: Bindings };
export type Row = Record<string, any>;
