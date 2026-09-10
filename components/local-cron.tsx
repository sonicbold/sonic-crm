"use client";
import { useEffect } from "react";

export function LocalCron() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    
    // In local development, Vercel isn't here to trigger the cron job.
    // This component acts as a background runner while the dashboard is open.
    const runCron = () => {
      fetch("/api/cron/drip").catch(console.error);
    };

    // Run every 10 seconds locally to process the queue quickly for testing
    const interval = setInterval(runCron, 10000);
    return () => clearInterval(interval);
  }, []);

  return null; // Invisible component
}
