import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  FileWarning,
  ClipboardCheck,
  Database,
  History,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  UserCog,
  Users,
  Send,
  Workflow,
} from "lucide-react";
import { useEmployeeAuth } from "../../lib/auth";
import { employeeApiClient } from "../../lib/api-client";
import { OrgTimezoneProvider } from "./DateTime";
import { TooltipProvider } from "../ui/tooltip";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { NotificationBell } from "./NotificationBell";

interface OrganizationSummary {
  id: string;
  name: string;
  timezone: string;
}

const NAV_ITEMS: ReadonlyArray<{
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}> = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/data-sources", label: "Data Sources", icon: Database },
  { to: "/app/purposes", label: "Purposes", icon: ScrollText },
  { to: "/app/requests", label: "Requests", icon: ClipboardCheck },
  { to: "/app/notices", label: "Notices", icon: ScrollText },
  { to: "/app/consents", label: "Consents", icon: ClipboardCheck },
  { to: "/app/children", label: "Children", icon: Users },
  { to: "/app/retention", label: "Retention", icon: History },
  { to: "/app/settings/compliance", label: "Compliance rules", icon: Settings },
  { to: "/app/messaging/templates", label: "Message templates", icon: Send },
  { to: "/app/messaging/campaigns", label: "Message campaigns", icon: Send },
  { to: "/app/breaches", label: "Breaches", icon: FileWarning },
  { to: "/app/sdf", label: "SDF readiness", icon: Workflow },
  { to: "/app/information-requests", label: "Information requests", icon: ClipboardCheck },
  { to: "/app/settings/rights", label: "Rights publication", icon: Settings },
  { to: "/app/registers", label: "Registers", icon: Boxes },
  { to: "/app/principals", label: "Principals", icon: Users },
  { to: "/app/review", label: "Review Queue", icon: ClipboardCheck },
  { to: "/app/employees", label: "Employees", icon: UserCog },
  { to: "/app/audit", label: "Audit", icon: History },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

/**
 * The fiduciary console's layout: sidebar nav + the authenticated
 * `<Outlet>` Tasks 24-29 fill in. Fetches the organization once here (for
 * its name and timezone) and provides the timezone down through
 * `OrgTimezoneProvider` so every `<DateTime>` in the tree converts
 * consistently -- see that component's docstring for the "exactly once at
 * the render boundary" rule this feeds.
 */
export function AppShell() {
  const { employee, logout } = useEmployeeAuth();
  const { data: organization } = useQuery({
    queryKey: ["organization"],
    queryFn: () => employeeApiClient.get<OrganizationSummary>("/organization"),
    staleTime: 5 * 60_000,
  });

  return (
    <OrgTimezoneProvider value={organization?.timezone ?? "UTC"}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
            <div className="px-4 py-5">
              <p className="truncate text-sm font-semibold">
                {organization?.name ?? "DPDP Platform"}
              </p>
              <p className="text-xs text-muted-foreground">Fiduciary console</p>
            </div>
            <nav className="flex-1 space-y-0.5 px-2">
              {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent font-medium text-accent-foreground",
                    )
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="border-t border-border px-4 py-3">
              <NotificationBell apiClient={employeeApiClient} className="mb-2" />
              <p className="truncate text-sm font-medium">{employee?.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{employee?.role.name}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full justify-start gap-2 px-0"
                onClick={() => {
                  void logout();
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            </div>
          </aside>
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </TooltipProvider>
    </OrgTimezoneProvider>
  );
}
