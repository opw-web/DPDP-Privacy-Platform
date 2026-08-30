import { useEffect, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import {
  bootstrapEmployeeSession,
  bootstrapPrincipalSession,
  useEmployeeAuth,
  usePrincipalAuth,
} from "./lib/auth";
import { AppShell } from "./components/shared/AppShell";
import { PortalShell } from "./principal/components/PortalShell";
import { LoginPage } from "./fiduciary/pages/LoginPage";
import { PrincipalLoginPage } from "./principal/pages/PrincipalLoginPage";
import { DashboardPage } from "./fiduciary/pages/DashboardPage";
import { DataSourcesPage } from "./fiduciary/pages/DataSourcesPage";
import { DataSourceNewPage } from "./fiduciary/pages/DataSourceNewPage";
import { DataSourceDetailPage } from "./fiduciary/pages/DataSourceDetailPage";
import { PurposesPage } from "./fiduciary/pages/PurposesPage";
import { RegistersPage } from "./fiduciary/pages/RegistersPage";
import { PrincipalsPage } from "./fiduciary/pages/PrincipalsPage";
import { PrincipalDetailPage } from "./fiduciary/pages/PrincipalDetailPage";
import { ReviewQueuePage } from "./fiduciary/pages/ReviewQueuePage";
import { EmployeesPage } from "./fiduciary/pages/EmployeesPage";
import { AuditPage } from "./fiduciary/pages/AuditPage";
import { SettingsPage } from "./fiduciary/pages/SettingsPage";
import { MeHomePage } from "./principal/pages/MeHomePage";
import { MeDataPage } from "./principal/pages/MeDataPage";
import { MeSourcesPage } from "./principal/pages/MeSourcesPage";
import { MeRecipientsPage } from "./principal/pages/MeRecipientsPage";

/**
 * `/login`, `/app/*`, `/me/login`, `/me/*` -- two independent route trees,
 * each with its own auth boundary (`EmployeeAuthBoundary` /
 * `PrincipalAuthBoundary`, backed by the equally independent token stores
 * in `lib/api-client.ts`) and its own guard (`RequireEmployeeAuth` /
 * `RequirePrincipalAuth`). React Router only ever mounts the boundary for
 * whichever tree the current URL is actually in -- the two are siblings at
 * the top of the route tree, not both-always-mounted, so visiting `/login`
 * never triggers a principal-session bootstrap and vice versa.
 *
 * Tasks 24-29 built the pages nested below inside the two layout routes
 * (`<Route element={<AppShell />}>` and `<Route element={<PortalShell />}>`)
 * without touching this file; the integration dispatch wires them in here.
 */

function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

function EmployeeAuthBoundary({ children }: { children: ReactNode }) {
  const { status } = useEmployeeAuth();

  useEffect(() => {
    if (status === "idle") {
      void bootstrapEmployeeSession();
    }
  }, [status]);

  if (status === "idle" || status === "loading") {
    return <FullPageLoading />;
  }
  return <>{children}</>;
}

function RequireEmployeeAuth() {
  const { status } = useEmployeeAuth();
  const location = useLocation();

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function PrincipalAuthBoundary({ children }: { children: ReactNode }) {
  const { status } = usePrincipalAuth();

  useEffect(() => {
    if (status === "idle") {
      void bootstrapPrincipalSession();
    }
  }, [status]);

  if (status === "idle" || status === "loading") {
    return <FullPageLoading />;
  }
  return <>{children}</>;
}

function RequirePrincipalAuth() {
  const { status } = usePrincipalAuth();

  if (status !== "authenticated") {
    return <Navigate to="/me/login" replace />;
  }
  return <Outlet />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route
        element={
          <EmployeeAuthBoundary>
            <Outlet />
          </EmployeeAuthBoundary>
        }
      >
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<RequireEmployeeAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="data-sources" element={<DataSourcesPage />} />
            <Route path="data-sources/new" element={<DataSourceNewPage />} />
            <Route path="data-sources/:id" element={<DataSourceDetailPage />} />
            <Route path="purposes" element={<PurposesPage />} />
            <Route path="registers" element={<RegistersPage />} />
            <Route path="principals" element={<PrincipalsPage />} />
            <Route path="principals/:id" element={<PrincipalDetailPage />} />
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route
        element={
          <PrincipalAuthBoundary>
            <Outlet />
          </PrincipalAuthBoundary>
        }
      >
        <Route path="/me/login" element={<PrincipalLoginPage />} />
        <Route path="/me" element={<RequirePrincipalAuth />}>
          <Route element={<PortalShell />}>
            <Route index element={<MeHomePage />} />
            <Route path="data" element={<MeDataPage />} />
            <Route path="sources" element={<MeSourcesPage />} />
            <Route path="recipients" element={<MeRecipientsPage />} />
          </Route>
        </Route>
      </Route>

      {/* A mistyped /me/... sub-path must land a principal on the
          principal login, not fall through to the employee /login below --
          this route is more specific than the trailing "*" and only
          catches /me paths the branch above didn't already match. */}
      <Route path="/me/*" element={<Navigate to="/me/login" replace />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
