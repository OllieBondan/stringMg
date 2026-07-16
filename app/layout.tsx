import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { devBypassEnabled, getSessionUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "String Management",
  description: "Badminton racket stringing tracker",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        <header className="sticky top-0 z-20 bg-emerald-700 text-white shadow">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              🏸 String Management
            </Link>
            {user &&
              (devBypassEnabled() ? (
                <span className="rounded bg-emerald-900/60 px-2 py-1 text-xs">dev mode</span>
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
                    className="text-sm text-emerald-100 underline-offset-2 hover:underline"
                  >
                    Sign out
                  </button>
                </form>
              ))}
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-3 py-4 pb-24">{children}</main>
      </body>
    </html>
  );
}
