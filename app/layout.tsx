import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const spaceMono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Sonic CRM — AI Lead Engine & Outreach",
  description: "Sonic CRM — AI Lead Scraper, Automated SMS Campaigns, and Pipeline Automation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`min-h-screen bg-background text-foreground font-sans ${dmSans.variable} ${spaceGrotesk.variable} ${spaceMono.variable}`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
