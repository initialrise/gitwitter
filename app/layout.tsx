import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gitwitter",
  description: "Your GitHub following feed, without the one guy who spams it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
