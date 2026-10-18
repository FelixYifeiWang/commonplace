import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOrigin } from "@/lib/auth";
import { signInOriginRedirect } from "@/lib/auth-origin.mjs";
import { accountsEnabled, accountUser } from "@/lib/account-auth";
import { GoogleSignIn } from "@/components/account-controls";
import LegacySignIn from "@/app/signin-with-chatgpt/page";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!accountsEnabled()) return <LegacySignIn searchParams={searchParams} />;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const canonical = authOrigin();
  if (host) {
    const destination = signInOriginRedirect(
      `${new URL(canonical).protocol}//${host}`,
      canonical,
    );
    if (destination) redirect(destination);
  }
  if (await accountUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="account-signin">
      <div className="account-signin-card">
        <h1>Newron</h1>
        <GoogleSignIn
          initialError={
            error ? "Sign-in did not finish. Please try again." : ""
          }
        />
      </div>
    </main>
  );
}
