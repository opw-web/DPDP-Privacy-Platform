import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Database, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { principalApiClient } from "../../lib/api-client";
import { Card, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/shared/Skeleton";
import { PortalHelpLink } from "../components/PortalPageHeader";

/** Mirrors `MeService.getProfile()`'s response shape (`me.service.ts` -> `PrincipalsService.getUnmaskedProfile`). Only `displayName` is used on this page. */
interface MeProfile {
  displayName: string | null;
}

interface HomeLinkCardProps {
  to: string;
  icon: typeof Database;
  title: string;
  description: ReactNode;
}

function HomeLinkCard({ to, icon: Icon, title, description }: HomeLinkCardProps) {
  return (
    <Link to={to} className="block">
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex-1">
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="text-base">{description}</CardDescription>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
      </Card>
    </Link>
  );
}

/**
 * `/me` -- "Hello, {name}", plus one card each for the three real,
 * data-backed portal sections plus direct links to the consent, request,
 * message, privacy and nomination workflows.
 */
export function MeHomePage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => principalApiClient.get<MeProfile>("/me/profile"),
  });

  return (
    <div className="space-y-8">
      <div>
        {isLoading ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <h1 className="text-3xl font-semibold">
            Hello{profile?.displayName ? `, ${profile.displayName}` : ""}
          </h1>
        )}
        <p className="mt-1 text-base text-muted-foreground">
          Here is what this organization holds about you, and who they've shared it with.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <HomeLinkCard
          to="/me/data"
          icon={Database}
          title="Your data"
          description="Every value held about you, and what it's used for."
        />
        <HomeLinkCard
          to="/me/sources"
          icon={ShieldCheck}
          title="Where it came from"
          description="The systems that hold your data."
        />
        <HomeLinkCard
          to="/me/recipients"
          icon={Users}
          title="Who it's shared with"
          description="Other organizations your data has been shared with."
        />
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <MessageSquare className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <CardTitle className="text-lg">Privacy contacts</CardTitle>
              <CardDescription className="text-base">
                Contact details for questions about your data are not yet published in this
                portal. Please use the contact details in any message you've received from this
                organization.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Privacy choices and help</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <HomeLinkCard to="/me/consents" icon={ShieldCheck} title="Consents" description={<><span className="sr-only">Coming soon</span>Allow, decline or withdraw permission for each use.</>} />
          <HomeLinkCard to="/me/requests" icon={ArrowRight} title="Requests" description={<><span className="sr-only">Coming soon</span>Ask to see, correct or erase your data, or raise a grievance.</>} />
          <HomeLinkCard to="/me/messages" icon={MessageSquare} title="Messages" description={<><span className="sr-only">Coming soon</span>Read important messages from this organization.</>} />
          <HomeLinkCard to="/me/privacy" icon={MessageSquare} title="Privacy information" description="See the organization, contacts, purposes and notices." />
          <HomeLinkCard to="/me/nomination" icon={Users} title="Nomination" description="Choose someone to act for you if the stated condition occurs." />
        </div>
      </div>
      <PortalHelpLink />
    </div>
  );
}
