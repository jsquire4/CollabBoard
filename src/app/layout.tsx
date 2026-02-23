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

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://theorem.app";

export const metadata: Metadata = {
  title: "Theorem",
  description: "An intelligent strategy canvas.",
  openGraph: {
    title: "Theorem — An intelligent strategy canvas",
    description: "An intelligent strategy canvas.",
    url: baseUrl,
    siteName: "Theorem",
    images: [
      {
        url: `${baseUrl}/theorem_sm_vf-rs.png`,
        width: 1200,
        height: 630,
        alt: "Theorem — An intelligent strategy canvas",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Theorem — An intelligent strategy canvas",
    description: "An intelligent strategy canvas.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${dmSerifDisplay.variable} antialiased`}
      >
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[9999] -translate-y-full rounded-md bg-navy px-4 py-2 text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-leather focus:ring-offset-2"
        >
          Skip to main content
        </a>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
