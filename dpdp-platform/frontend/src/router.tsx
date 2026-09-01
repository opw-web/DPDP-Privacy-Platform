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
import { MeConsentsPage } from "./principal/pages/MeConsentsPage";
import { MeRequestsPage } from "./principal/pages/MeRequestsPage";
import { MeRequestDetailPage } from "./principal/pages/MeRequestDetailPage";
import { MeMessagesPage } from "./principal/pages/MeMessagesPage";
import { MePrivacyPage } from "./principal/pages/MePrivacyPage";
import { MeNominationPage } from "./principal/pages/MeNominationPage";
import { RequestsPage } from "./fiduciary/pages/RequestsPage";
import { RequestDetailPage } from "./fiduciary/pages/RequestDetailPage";
import { SettingsRightsPage } from "./fiduciary/pages/SettingsRightsPage";
import { NoticesPage } from "./fiduciary/pages/NoticesPage";
import { NoticeBuilderPage } from "./fiduciary/pages/NoticeBuilderPage";
import { ConsentsPage } from "./fiduciary/pages/ConsentsPage";
import { SettingsCompliancePage } from "./fiduciary/pages/SettingsCompliancePage";
import { ChildrenPage } from "./fiduciary/pages/ChildrenPage";
import { RetentionPage } from "./fiduciary/pages/RetentionPage";
import { PrincipalEvidencePage } from "./fiduciary/pages/PrincipalEvidencePage";
import { MessagingTemplatesPage } from "./fiduciary/pages/MessagingTemplatesPage";
import { MessagingTemplateEditorPage } from "./fiduciary/pages/MessagingTemplateEditorPage";
import { MessagingCampaignsPage } from "./fiduciary/pages/MessagingCampaignsPage";
import { MessagingCampaignBuilderPage } from "./fiduciary/pages/MessagingCampaignBuilderPage";
import { MessagingCampaignDetailPage } from "./fiduciary/pages/MessagingCampaignDetailPage";
import { BreachesPage } from "./fiduciary/pages/BreachesPage";
import { BreachWizardPage } from "./fiduciary/pages/BreachWizardPage";
import { BreachDetailPage } from "./fiduciary/pages/BreachDetailPage";
import { SdfPage } from "./fiduciary/pages/SdfPage";
import { SdfGapsPage } from "./fiduciary/pages/SdfGapsPage";
import { InformationRequestsPage } from "./fiduciary/pages/InformationRequestsPage";

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
            <Route path="requests" element={<RequestsPage />} />
            <Route path="requests/:ref" element={<RequestDetailPage />} />
            <Route path="notices" element={<NoticesPage />} />
            <Route path="notices/new" element={<NoticeBuilderPage />} />
            <Route path="notices/:noticeId" element={<NoticeBuilderPage />} />
            <Route path="consents" element={<ConsentsPage />} />
            <Route path="children" element={<ChildrenPage />} />
            <Route path="retention" element={<RetentionPage />} />
            <Route path="registers" element={<RegistersPage />} />
            <Route path="principals" element={<PrincipalsPage />} />
            <Route path="principals/:id" element={<PrincipalDetailPage />} />
            <Route path="principals/:id/evidence" element={<PrincipalEvidencePage />} />
            <Route path="review" element={<ReviewQueuePage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="settings/rights" element={<SettingsRightsPage />} />
            <Route path="settings/compliance" element={<SettingsCompliancePage />} />
            <Route path="messaging/templates" element={<MessagingTemplatesPage />} />
            <Route path="messaging/templates/new" element={<MessagingTemplateEditorPage />} />
            <Route path="messaging/templates/:templateId" element={<MessagingTemplateEditorPage />} />
            <Route path="messaging/campaigns" element={<MessagingCampaignsPage />} />
            <Route path="messaging/campaigns/new" element={<MessagingCampaignBuilderPage />} />
            <Route path="messaging/campaigns/:campaignId" element={<MessagingCampaignDetailPage />} />
            <Route path="breaches" element={<BreachesPage />} />
            <Route path="breaches/new" element={<BreachWizardPage />} />
            <Route path="breaches/:breachId" element={<BreachDetailPage />} />
            <Route path="sdf" element={<SdfPage />} />
            <Route path="sdf/gaps" element={<SdfGapsPage />} />
            <Route path="information-requests" element={<InformationRequestsPage />} />
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
            <Route path="consents" element={<MeConsentsPage />} />
            <Route path="requests" element={<MeRequestsPage />} />
            <Route path="requests/:ref" element={<MeRequestDetailPage />} />
            <Route path="messages" element={<MeMessagesPage />} />
            <Route path="privacy" element={<MePrivacyPage />} />
            <Route path="nomination" element={<MeNominationPage />} />
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
