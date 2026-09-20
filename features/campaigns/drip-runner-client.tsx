"use client";
import { useEffect } from "react";

/** Drives Strategic Drip while the CRM tab is open. */
export function DripRunner() {
  useEffect(() => {
    const tick = () => {
      fetch("/api/cron/drip").catch(() => {});
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, []);
  return null;
}
