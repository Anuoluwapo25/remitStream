import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// A soft-serif display face for headings. It carries most of the warmth that
// the old blue-and-glow palette was missing; body copy stays on the system
// sans stack.
const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});
import { WalletProvider } from "@/lib/wallet";
import { ToastProvider } from "@/components/Toast";
import { AppErrorBoundary } from "@/components/ErrorBoundary";
import { Nav } from "@/components/Nav";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { WelcomeGuide } from "@/components/Onboarding";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "RemitStream — Cross-border remittances with auto-save & yield",
  description:
    "Send money home on Stellar in seconds. Recipients auto-save a slice of every transfer into an on-chain yield vault.",
  metadataBase: new URL("https://remitstream.app"),
  openGraph: {
    title: "RemitStream",
    description:
      "Cross-border remittances with auto-save & yield, built on Stellar.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#161512",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-dvh">
        <AppErrorBoundary>
          <ToastProvider>
            <WalletProvider>
              <Nav />
              <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                {children}
              </main>
              <Footer />
              <FeedbackWidget />
              <WelcomeGuide />
            </WalletProvider>
          </ToastProvider>
        </AppErrorBoundary>
        <Analytics />
      </body>
    </html>
  );
}
