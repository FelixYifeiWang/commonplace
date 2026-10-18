import { redirect } from "next/navigation";
import { accountsEnabled, accountUser } from "@/lib/account-auth";
import { GoogleSignIn } from "@/components/account-controls";
import LegacySignIn from "@/app/signin-with-chatgpt/page";
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!accountsEnabled()) return <LegacySignIn searchParams={searchParams} />;
  if (await accountUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="account-signin">
      <div className="account-signin-card">
        <h1>Commonplace</h1>
        <GoogleSignIn
          initialError={
            error ? "Sign-in did not finish. Please try again." : ""
          }
        />
      </div>
    </main>
  );
}
