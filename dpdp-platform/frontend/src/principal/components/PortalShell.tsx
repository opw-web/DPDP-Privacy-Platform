import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { usePrincipalAuth } from "../../lib/auth";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: "/me", label: "Home", end: true },
  { to: "/me/data", label: "Your data" },
  { to: "/me/sources", label: "Where it came from" },
  { to: "/me/recipients", label: "Who it's shared with" },
];

/**
 * The principal portal's layout: plainer language, larger type, no
 * jargon (spec: this is read by members of the public, not compliance
 * staff).
 */
export function PortalShell() {
  const { principal, logout } = usePrincipalAuth();

  return (
    <div className="min-h-screen bg-background text-base">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <p className="text-xl font-semibold">Your Privacy Portal</p>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{principal?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => {
                void logout();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-2 px-6 pb-3">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent font-medium text-accent-foreground",
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
