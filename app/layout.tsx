import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { TopNav } from "@/components/layout/TopNav";
import {
  ThemeProvider,
  THEME_INIT_SCRIPT,
} from "@/components/providers/ThemeProvider";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: "Quai Supply Tracker",
  description:
    "Live and historical Quai & Qi token emissions on Quai Network (cyprus1).",
  icons: {
    icon: "/brand/quai-mark.svg",
    apple: "/brand/quai-mark.svg",
  },
  openGraph: {
    title: "Quai Supply Tracker",
    description:
      "Live and historical Quai & Qi token emissions on Quai Network (cyprus1).",
    images: [{ url: "/opengraph-image.png", width: 256, height: 256 }],
  },
  twitter: {
    card: "summary",
    title: "Quai Supply Tracker",
    description:
      "Live and historical Quai & Qi token emissions on Quai Network (cyprus1).",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>
        {/* Runs before React hydration so the correct `dark` class is on
            <html> before any paint — eliminates the flash-of-wrong-theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans">
        <ThemeProvider>
          <QueryProvider>
            <TopNav />
            {children}
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
