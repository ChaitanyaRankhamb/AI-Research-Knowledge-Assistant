import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/src/lib/utils";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { ThemeProvider } from "@/src/lib/theme-provider";
import { UserProvider } from "@/context/UserContext";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Research & Knowledge Assistant",
  description: "Next-generation autonomous research and document synthesis platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable
      )}
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <UserProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
