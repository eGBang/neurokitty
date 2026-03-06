import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEUROKITTY - Biological Neural Culture Gaming",
  description:
    "A biological neural culture (Cortical Labs CL1) controls a virtual cat in a 2D pixel-art world. Watch real neurons learn to play.",
  keywords: [
    "neuroscience",
    "neural culture",
    "cortical labs",
    "biological computing",
    "pixel art",
    "game",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-neural-dark text-neural-text font-mono antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
