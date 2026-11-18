"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListOrdered, Settings, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Cockpit", icon: LayoutDashboard },
  { href: "/buchungen", label: "Buchungen", icon: ListOrdered },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop: Links im Kopf. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="hidden items-center gap-1 md:flex"
    >
      {ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(pathname, href) && "bg-muted font-medium text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Handy: feste Leiste unten (R24). Muss außerhalb des Kopfs stehen, weil dessen backdrop-filter
 * sonst zum Bezugsrahmen für position: fixed wird.
 */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground",
            isActive(pathname, href) && "font-medium text-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
