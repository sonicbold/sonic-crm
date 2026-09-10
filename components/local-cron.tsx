"use client";
import { useEffect } from "react";

export function LocalCron() {
  useEffect(() => {
    // This component acts as a continuous background runner while the dashboard is open.
    // By keeping the CRM tab open, the browser itself acts as the organic SMS blaster server!
    const runCron = () => {
      fetch("/api/cron/drip").catch(console.error);
    };

    // Run frequently (every 10 seconds) to ensure randomized messages go out exactly on time
    const interval = setInterval(runCron, 10000);
    return () => clearInterval(interval);
  }, []);

  return null; // Invisible component
}
