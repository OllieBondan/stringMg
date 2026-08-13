"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refetch the page's server data on back/forward (bfcache) restore and when
 * the tab becomes visible again. Next.js serves history navigations from its
 * client router cache regardless of staleTimes, so without this, going "back"
 * to the list shows the data as it looked before any changes.
 *
 * Deliberately does NOT refresh on mount: a forward navigation already ran the
 * server component (every page here is force-dynamic, so nothing is cached),
 * and refreshing again immediately doubled the server work — a second auth +
 * query + RSC render — for data milliseconds old. That was the bulk of the
 * lag when opening a job. The two listeners below cover the stale cases the
 * mount call was really there for.
 */
export function useFreshData() {
  const router = useRouter();
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) router.refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
}
