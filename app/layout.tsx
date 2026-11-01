import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { InstallGate } from "@/components/InstallGate";

export const metadata: Metadata = {
  title: "Court Call",
  description: "Court signups and chat for your pickleball group",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Court Call", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f6f4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InstallGate>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </InstallGate>
      </body>
    </html>
  );
}
