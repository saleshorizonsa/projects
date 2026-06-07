import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/access";
import { AuthForm } from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/projects");
  return (
    <div className="flex flex-1 items-center justify-center">
      <AuthForm mode="signup" />
    </div>
  );
}
