import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Absolute, so the Open Graph image and any canonical URL resolve against the real domain rather
  // than against whichever preview deployment happens to render them.
  metadataBase: new URL("https://cluby.cash"),
  title: "Cluby — credit against tokenized stocks",
  description:
    "Borrow USDG against tokenized NVDA, SPY, AAPL and ETH. Isolated markets curated on Morpho Blue, on Robinhood Chain.",
  icons: { icon: "/cluby-logo.png" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Cluby",
    url: "https://cluby.cash",
    title: "Cluby — credit against tokenized stocks",
    description:
      "Borrow USDG against tokenized stocks. Isolated Morpho Blue markets, Chainlink oracles, zero performance fee.",
    images: ["/cluby-banner.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cluby — credit against tokenized stocks",
    description:
      "Borrow USDG against tokenized stocks. Isolated Morpho Blue markets, Chainlink oracles, zero performance fee.",
    images: ["/cluby-banner.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${serif.variable} ${mono.variable} antialiased`}
        style={{ background: "#ffffff" }}
      >
        <Providers>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
