import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { devBypassEnabled, getSessionUser } from "@/lib/session";
import PushOptIn from "@/components/PushOptIn";
import ThemeToggle, { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stringing Tracker",
  description: "Badminton racket stringing tracker",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <header className="sticky top-0 z-20 bg-gradient-to-r from-emerald-700 to-emerald-600 text-white shadow-md dark:from-emerald-900 dark:to-emerald-800">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
            <Link href="/" className="flex items-center gap-1.5 text-lg font-bold tracking-tight">
              <span className="text-xl">🏸</span> Stringing Tracker
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {user && !devBypassEnabled() && <PushOptIn />}
              {user &&
                (devBypassEnabled() ? (
                  <span className="rounded-full bg-emerald-900/50 px-2.5 py-1 text-xs font-medium">
                    dev mode
                  </span>
                ) : (
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}
                  >
                    <button
                      type="submit"
                      title={user.email}
                      className="text-sm font-medium text-emerald-50 underline-offset-2 hover:underline"
                    >
                      Sign out
                    </button>
                  </form>
                ))}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-3 py-4 pb-24">{children}</main>
        <footer className="mx-auto max-w-3xl px-4 pb-6 text-center text-xs text-slate-400 dark:text-slate-500">
          <Link href="/about" className="underline-offset-2 hover:underline">
            Stringing Tracker v{process.env.NEXT_PUBLIC_APP_VERSION} · About
          </Link>
        </footer>
      </body>
    </html>
  );
}
