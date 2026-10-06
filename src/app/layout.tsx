import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Space_Grotesk({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

const title = "What happens when you type a URL";
const description =
  "Follow one request from your address bar through DNS, TCP, TLS, a CDN edge and a submarine cable under the Atlantic, then back to a rendered page. In 3D, in 1.2 seconds.";

export const metadata: Metadata = {
  // share cards need absolute URLs: explicit override, else Vercel's production domain, else local dev
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  ),
  title,
  description,
  openGraph: { title, description, images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "A packet crossing the Atlantic on the Dunant cable" }], type: "website" },
  twitter: { card: "summary_large_image", title, description, images: ["/og.jpg"] },
};

export const viewport: Viewport = { themeColor: "#06060f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
