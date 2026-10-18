"use client";
import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function GoogleSignIn({ initialError = "" }: { initialError?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  return (
    <>
      <button
        className="google-signin-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await authClient.signIn.social({
              provider: "google",
              callbackURL: "/",
              errorCallbackURL: "/sign-in?error=1",
            });
            if (result.error)
              throw new Error(result.error.message || "Could not sign in.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Try again.");
            setBusy(false);
          }
        }}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
          />
        </svg>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function AccountControls() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="account-controls">
      <button
        className="text-button"
        onClick={async () => {
          setError("");
          try {
            const result = await authClient.signOut();
            if (result.error) throw new Error("Could not sign out.");
            router.replace("/sign-in");
          } catch {
            setError("Could not sign out. Try again.");
          }
        }}
      >
        Sign out
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
export function AccountTransition({
  onLinked,
}: {
  onLinked: () => Promise<void>;
}) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/claim", { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) {
          const result = (await r.json()) as { canClaim?: boolean };
          setAvailable(result.canClaim === true);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          console.warn("Account transition unavailable", error);
      });
    return () => controller.abort();
  }, []);
  if (!available) return null;
  return (
    <div className="account-transition" role="status">
      <span>{error || "Your existing space is ready."}</span>
      <button
        className="text-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/account/claim", { method: "POST" });
            const result = (await r.json()) as { error?: string };
            if (!r.ok)
              throw new Error(
                result.error || "Could not open your existing space.",
              );
            await onLinked();
            setAvailable(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : "Open existing space"}
      </button>
    </div>
  );
}
export function AccountSignOut() {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    authClient
      .signOut()
      .then((result) => {
        if (result.error)
          setError("Could not sign out. Please retry from Settings.");
        else router.replace("/sign-in");
      })
      .catch(() => setError("Could not sign out. Please retry from Settings."));
  }, [router]);
  return <main className="account-signin">{error || "Signing out…"}</main>;
}
