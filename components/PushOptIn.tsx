"use client";

import { useEffect, useState } from "react";

type Status = "unsupported" | "checking" | "off" | "denied" | "on" | "busy";

/** base64url VAPID key -> the raw bytes PushManager.subscribe expects. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

export default function PushOptIn() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    });
  }, []);

  async function enable() {
    setStatus("busy");
    try {
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) throw new Error("Push is not configured on the server");
      const { publicKey } = await keyRes.json();

      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setStatus("on");
    } catch (err) {
      console.error("Push enable failed", err);
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      console.error("Push disable failed", err);
      setStatus("on");
    }
  }

  if (status === "unsupported" || status === "checking") return null;

  if (status === "denied") {
    return (
      <span
        title="Notifications are blocked for this site in your browser settings"
        className="text-xs text-emerald-100/70"
      >
        🔕 Blocked
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={status === "on" ? disable : enable}
      disabled={status === "busy"}
      title={status === "on" ? "Turn off notifications" : "Get notified when a job needs you"}
      className="flex h-7 w-7 items-center justify-center rounded-full text-base text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-50"
    >
      {status === "on" ? "🔔" : "🔕"}
    </button>
  );
}
