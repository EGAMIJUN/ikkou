import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "忌校 -IKKOU-",
  description:
    "深夜の校舎に閉じ込められた。視線に捉えられたら、もう逃げられない。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-ink text-bone">{children}</body>
    </html>
  );
}
