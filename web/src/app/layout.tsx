import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
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
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
