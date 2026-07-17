"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refetch the page's server data on mount, on back/forward (bfcache) restore,
 * and when the tab becomes visible again. Next.js serves history navigations
 * from its client router cache regardless of staleTimes, so without this,
 * going "back" to the list shows the data as it looked before any changes.
 */
export function useFreshData() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
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
