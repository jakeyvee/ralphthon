import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Call-Check-Loop",
  description:
    "Daily voice check-ins for elders, with transparent family-facing escalation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 text-[15px] leading-relaxed">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-200 bg-white px-6 py-3 text-xs text-zinc-500">
          Not a medical, emergency, or monitoring replacement.
        </footer>
      </body>
    </html>
  );
}
