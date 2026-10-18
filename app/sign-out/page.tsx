import { redirect } from "next/navigation";
import { accountsEnabled } from "@/lib/account-auth";
import { AccountSignOut } from "@/components/account-controls";
export default function SignOutPage() {
  if (!accountsEnabled()) redirect("/signout-with-chatgpt");
  return <AccountSignOut />;
}
