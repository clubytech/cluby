import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getTokenListing } from "@/lib/token-listing";
import { OG_IMAGE } from "@/lib/og-image";
import "./globals.css";

// Inter is variable, so every weight between 100 and 900 is already in the one file: asking for
// specific ones would download more, not fewer.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  // 700 for the two places a headline has to carry the page on its own.
  weight: ["400", "500", "600", "700"],
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
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Cluby",
    url: "https://cluby.cash",
    title: "Cluby — credit against tokenized stocks",
    description:
      "Borrow USDG against tokenized stocks. Isolated Morpho Blue markets, Chainlink oracles, zero performance fee.",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cluby — credit against tokenized stocks",
    description:
      "Borrow USDG against tokenized stocks. Isolated Morpho Blue markets, Chainlink oracles, zero performance fee.",
    images: [OG_IMAGE],
  },
};

/**
 * The colour a mobile browser paints its own chrome with.
 *
 * There was none, so Safari and Chrome drew their bars in white above a page whose top is nearly
 * black — a seam across the top of every phone. It is the header's own ground, so the page appears
 * to start at the top of the screen rather than below a white strip.
 */
export const viewport = {
  themeColor: "#002c1e",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const listing = await getTokenListing();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${serif.variable} ${mono.variable} antialiased`}
        style={{ background: "#ffffff" }}
      >
        <Providers>
          <SiteHeader
            tokenLive={listing.token !== null}
            tokenAddress={listing.token}
            tokenSymbol={listing.symbol || "CLUBY"}
          />
          <main>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
