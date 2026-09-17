import "./globals.css";
export const metadata = { title: "BarThings", description: "Bar operations and batching workflow" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
