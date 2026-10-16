import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { TestEnvBanner } from "@/components/layout/TestEnvBanner";

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

const barlow = localFont({
  src: [
    { path: "../../public/fonts/barlow-300.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/barlow-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/barlow-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/barlow-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/barlow-700.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/barlow-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-body",
});

const barlowCondensed = localFont({
  src: [
    { path: "../../public/fonts/barlow-condensed-700.woff2", weight: "700", style: "normal" },
    { path: "../../public/fonts/barlow-condensed-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-display",
});

const spaceMono = localFont({
  src: [
    { path: "../../public/fonts/space-mono-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/space-mono-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Trakk",
  description: "Lightweight issue tracking with Kanban boards.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${spaceMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Reads localStorage before paint to prevent theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('trakk-theme');if(!t)t='light';document.documentElement.setAttribute('data-theme',t);})();`,
          }}
        />
      </head>
      <body className="bg-trakk-bg text-trakk-text font-body antialiased">
        <TestEnvBanner />
        {children}
      </body>
    </html>
  );
}
