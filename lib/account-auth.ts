import { headers } from "next/headers";
import { env } from "@/lib/runtime-env";
import { createAccountSpaces } from "./account-spaces.mjs";
import { accountsEnabled, getAuth } from "./auth";
export { accountsEnabled } from "./auth";
async function accountSession() {
  if (!accountsEnabled()) return null;
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.emailVerified ? session : null;
}
export async function accountIdentity() {
  return (await accountSession())?.user.id || null;
}
export async function accountUser() {
  const session = await accountSession();
  if (!session) return null;
  return {
    userId: await createAccountSpaces(env.DB).owner(session.user.id),
    displayName: session.user.name,
    email: session.user.email,
    fullName: session.user.name,
  };
}
