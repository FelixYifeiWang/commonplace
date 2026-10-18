import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { env } from "@/lib/runtime-env";
import * as schema from "@/db/auth-schema";
export function accountsEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.BETTER_AUTH_SECRET,
  );
}
function createAuth() {
  if (!accountsEnabled()) throw new Error("Google sign-in is not configured.");
  const database = env.DB;
  if (!database) throw new Error("The account database is not configured.");
  return betterAuth({
    appName: "Commonplace",
    baseURL:
      process.env.BETTER_AUTH_URL || "https://commonplace-pearl.vercel.app",
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(database, { schema }), {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account",
        accessType: "online",
        includeGrantedScopes: false,
      },
    },
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    advanced: { cookiePrefix: "commonplace-account", useSecureCookies: true },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ||= createAuth());
}
