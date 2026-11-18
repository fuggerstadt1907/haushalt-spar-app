import { Suspense } from "react";
import { DesktopNav, MobileNav } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/dal";
import { signOut } from "../login/actions";

async function UserMenu() {
  const { profile } = await requireProfile();
  return (
    <form action={signOut} className="flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline">{profile.display_name}</span>
      <Button type="submit" variant="ghost" size="sm">
        Abmelden
      </Button>
    </form>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <span className="font-semibold tracking-tight">Haushalt</span>
          <DesktopNav />
          <Suspense fallback={<div className="h-7 w-20" />}>
            <UserMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:pb-10">{children}</main>
      <MobileNav />
    </div>
  );
}
