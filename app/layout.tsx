import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "My own GPT",
  description: "Enterprise-grade AI-native developer chat app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
