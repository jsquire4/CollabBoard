import type { Metadata } from "next";
import { Geist, DM_Serif_Display } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
});

const rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://theoremai.app";
const baseUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
const ogImageUrl = `${baseUrl}/theorem_sm_vf-rs.png`;

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Theorem",
  description: "An intelligent strategy canvas for teams that think in frameworks. AI-powered synthesis, real-time collaboration, and a structured workspace.",
  openGraph: {
    title: "Theorem — Where hypotheses become theorems",
    description: "An intelligent strategy canvas for teams that think in frameworks. AI-powered synthesis, real-time collaboration, and a structured workspace.",
    url: baseUrl,
    siteName: "Theorem",
    type: "website",
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "Theorem — An intelligent strategy canvas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Theorem — Where hypotheses become theorems",
    description: "An intelligent strategy canvas for teams that think in frameworks. AI-powered synthesis, real-time collaboration, and a structured workspace.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="image" property="og:image" content={ogImageUrl} />
      </head>
      <body
        className={`${geistSans.variable} ${dmSerifDisplay.variable} antialiased`}
      >
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
