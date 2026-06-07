import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/access";
import { signOutAction } from "@/app/auth-actions";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GapFlow",
  description: "Gap-analysis project manager for IT managers.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
            <div className="flex items-center gap-6">
              <Link
                href={user ? "/projects" : "/login"}
                className="font-heading text-lg font-semibold"
              >
                GapFlow
              </Link>
              {user && (
                <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                  <Link href="/dashboard" className="hover:text-foreground">
                    Dashboard
                  </Link>
                  <Link href="/projects" className="hover:text-foreground">
                    Projects
                  </Link>
                  <Link href="/people" className="hover:text-foreground">
                    People
                  </Link>
                  <Link href="/teams" className="hover:text-foreground">
                    Teams
                  </Link>
                </nav>
              )}
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {user.email}
                </span>
                {user.role === "admin" && <Badge variant="outline">admin</Badge>}
                <form action={signOutAction}>
                  <SubmitButton variant="ghost" size="sm">
                    Sign out
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
