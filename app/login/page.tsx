import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Env vars sign-in cannot work without. Checked here so a misconfigured
 * deployment shows a clear setup message instead of Auth.js's generic
 * "There is a problem with the server configuration" page.
 */
const REQUIRED_ENV = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLOWED_EMAILS"];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());

  return (
    <div className="flex flex-col items-center gap-6 pt-16 text-center">
      <div className="text-6xl">🏸</div>
      <div>
        <h1 className="text-2xl font-bold">Stringing Tracker</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">Badminton racket stringing tracker</p>
      </div>
      {error && (
        <p className="max-w-xs rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error === "AccessDenied"
            ? "This Google account is not on the allowed list."
            : "Sign-in failed. Please try again."}
        </p>
      )}
      {missingEnv.length > 0 ? (
        <div className="max-w-sm rounded-lg bg-amber-100 px-4 py-3 text-left text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          <p className="font-semibold">Sign-in is not configured yet.</p>
          <p className="mt-1">These environment variables are missing:</p>
          <ul className="mt-1 list-inside list-disc font-mono text-xs">
            {missingEnv.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
          <p className="mt-2">
            Set them in Vercel under <span className="font-medium">Settings → Environment
            Variables</span> and redeploy (locally: <span className="font-mono text-xs">.env.local</span>).
            See the README for the Google OAuth setup steps.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  );
}
