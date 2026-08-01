import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Source_Serif_4 } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// §3: Instrument Sans for all application UI. Not Inter, not Geist.
const instrumentSans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// §3: Source Serif 4 for the document pane only. Papers are set in serif.
const sourceSerif = Source_Serif_4({
  variable: "--font-doc",
  subsets: ["latin"],
  weight: ["400", "600"],
});

// §3: IBM Plex Mono for every number, identifier, log line, and table cell.
const plexMono = IBM_Plex_Mono({
  variable: "--font-numeric",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "residual",
  description: "Checks whether a paper's own numbers agree with each other.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${sourceSerif.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <TooltipProvider delay={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
