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
  title: "Sharp",
  description: "Market Simulation Game",
  icons: {
    icon: "https://firebasestorage.googleapis.com/v0/b/sharp-80263.firebasestorage.app/o/Group%201%20(4).png?alt=media&token=f3b4d36b-c10a-4d2f-a6dc-bb5dc54bf7d8",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
