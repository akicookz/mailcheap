export type Bindings = Env & {
  ADMIN_EMAIL: string;
  ADMIN_PASSWORD: string;
  LINK_SECRET: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  CLOUDFLARE_OAUTH_CLIENT_SECRET?: string;
};
export type AppEnv = { Bindings: Bindings };
export type Row = Record<string, any>;
