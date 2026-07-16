import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex flex-col items-center gap-6 pt-16 text-center">
      <div className="text-6xl">🏸</div>
      <div>
        <h1 className="text-2xl font-bold">String Management</h1>
        <p className="mt-1 text-slate-600">Badminton racket stringing tracker</p>
      </div>
      {error && (
        <p className="max-w-xs rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
          {error === "AccessDenied"
            ? "This Google account is not on the allowed list."
            : "Sign-in failed. Please try again."}
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 active:scale-95"
        >
          Sign in with Google
        </button>
      </form>
    </div>
  );
}
