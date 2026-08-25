export interface TailnetIdentity {
  login: string;
  name: string;
  profilePic: string | null;
  address: string | null;
}

export interface TailnetBinding {
  identity(request: Request): Promise<TailnetIdentity | null>;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  BASE_DOMAIN?: string;
  /** Local `wrangler dev` only: act as this login without a tailnet. */
  DEV_USER_ID?: string;
  /** mf platform only (env.procdev). Absent elsewhere, in which case no one can sign in. */
  TAILNET?: TailnetBinding;
}

export type AppContext = {
  Bindings: Env;
  Variables: {
    user: { login: string; name: string };
  };
};
