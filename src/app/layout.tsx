import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0E0E10] text-white text-[15px] leading-relaxed">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-zinc-800 bg-[#18181C] px-6 py-3 text-xs text-zinc-400">
          Not a medical, emergency, or monitoring replacement.
        </footer>
      </body>
    </html>
  );
}
