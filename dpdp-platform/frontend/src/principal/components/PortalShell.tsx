import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { usePrincipalAuth } from "../../lib/auth";
import { principalApiClient } from "../../lib/api-client";
import { OrgTimezoneProvider } from "../../components/shared/DateTime";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";
import { NotificationBell } from "../../components/shared/NotificationBell";

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: "/me", label: "Home", end: true },
  { to: "/me/data", label: "Your data" },
  { to: "/me/sources", label: "Where it came from" },
  { to: "/me/recipients", label: "Who it's shared with" },
  { to: "/me/consents", label: "Permissions" },
  { to: "/me/requests", label: "Requests" },
  { to: "/me/messages", label: "Messages" },
  { to: "/me/privacy", label: "Privacy information" },
  { to: "/me/nomination", label: "Nomination" },
];

/**
 * `GET /api/me/profile` does not currently return an organization
 * timezone -- `MeService.getProfile()` -> `PrincipalsService.getUnmaskedProfile()`
 * selects `PRINCIPAL_DETAIL_SELECT` (`id, reference, ageStatus, ...`), no
 * organization fields at all. `organizationTimezone` is kept here,
 * optional, purely so that the moment a future backend change adds it to
 * that response, this shell picks it up with no frontend change -- the
 * same forward-compatible-field pattern `EmployeeSession.permissions`
 * already uses in `lib/auth.ts`. Until that field exists, it is always
 * `undefined` and `<OrgTimezoneProvider>` below falls back to `"UTC"`
 * EXPLICITLY, in the one place that owns the decision -- not a fabricated
 * organization zone, and not the silent, easy-to-miss default that
 * results from mounting no provider at all.
 */
interface MeProfileTimezone {
  organizationTimezone?: string;
}

/**
 * The principal portal's layout: plainer language, larger type, no
 * jargon (spec: this is read by members of the public, not compliance
 * staff).
 *
 * Also the one place in the `/me/*` tree that supplies `OrgTimezoneProvider`
 * (global constraint #7: convert UTC to the organization's timezone
 * exactly once, at the render boundary) -- every `<DateTime>` under here,
 * across every Task 29 page, reads it from here rather than each guessing
 * its own default.
 */
export function PortalShell() {
  const { principal, logout } = usePrincipalAuth();
  const { data: profile } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => principalApiClient.get<MeProfileTimezone>("/me/profile"),
    staleTime: 5 * 60_000,
  });

  return (
    <OrgTimezoneProvider value={profile?.organizationTimezone ?? "UTC"}>
      <div className="min-h-screen bg-background text-base">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <p className="text-xl font-semibold">Your Privacy Portal</p>
            <div className="flex items-center gap-4">
              <NotificationBell apiClient={principalApiClient} />
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
    </OrgTimezoneProvider>
  );
}
