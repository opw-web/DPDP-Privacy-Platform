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
 * Tasks 24-29 extend this file by adding routes *inside* the two empty
 * layout routes below (`<Route element={<AppShell />}>` and
 * `<Route element={<PortalShell />}>`) -- this task deliberately leaves
 * them with no children: the dashboard, data sources, purposes, etc. are
 * later tasks' pages, not this scaffold's.
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
          <Route element={<AppShell />}>{/* Tasks 24-29 add nested routes here */}</Route>
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
          <Route element={<PortalShell />}>{/* Task 29 adds nested routes here */}</Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
