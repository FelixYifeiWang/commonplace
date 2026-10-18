import { accountsEnabled } from "@/lib/account-auth";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (accountsEnabled()) redirect("/sign-in");
  if (await getChatGPTUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="hosted-signin">
      <form action="/api/auth/login" method="post">
        <h1>Commonplace</h1>
        <label htmlFor="access-code">Access code</label>
        <input
          id="access-code"
          name="code"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
        {error && <p role="alert">That code didn’t match.</p>}
        <button type="submit">Open space</button>
      </form>
    </main>
  );
}
