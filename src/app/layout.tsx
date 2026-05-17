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
  title: "Nurse Joy 👩‍⚕️",
  description:
    "Nurse Joy: daily voice check-ins for elders, with transparent family-facing escalation. 🏥",
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
      <body className="min-h-full flex flex-col bg-[#FDFBF7] text-[#111827] text-[15px] leading-relaxed">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[#E5E7EB] bg-[#F7F4EB] px-6 py-3 text-xs text-[#4B5563]">
          🩺 Nurse Joy is not a medical, emergency, or monitoring replacement.
        </footer>
      </body>
    </html>
  );
}
