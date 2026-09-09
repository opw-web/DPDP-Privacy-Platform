import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { principalApiClient } from "../../lib/api-client";
import { Skeleton } from "../../components/shared/Skeleton";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Select } from "../../components/ui/select";
import { PortalPageHeader } from "../components/PortalPageHeader";
import MDEditor from "@uiw/react-md-editor";

interface PrivacyContact {
  organizationName?: string | null;
  companyName?: string | null;
  legalName?: string | null;
  published: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isDpo: boolean | null;
  grievanceContactEmail?: string | null;
  grievanceContactPhone?: string | null;
  publicPrivacyPageUrl: string | null;
}

interface NoticeSummary {
  id: string;
  name?: string;
  title?: string;
  purposeStatements?: Array<{ purposeName?: string; name?: string; lawfulBasis?: string; basis?: string; goodsOrServices?: string; description?: string }>;
  purposes?: Array<{ name?: string; lawfulBasis?: string; basis?: string; description?: string }>;
  versions?: Array<{ id?: string; version?: number; publishedAt?: string; languages?: string[] }>;
}

interface NoticeView {
  id?: string;
  title?: string;
  name?: string;
  version?: number;
  bodyMarkdown?: string;
  body?: string;
  languageCode?: string;
  fallbackToEnglish?: boolean;
  boardComplaintUrl?: string;
  withdrawalUrl?: string;
  rightsUrl?: string;
}

interface PublishedPurpose {
  noticeId: string;
  purposeName?: string;
  name?: string;
  lawfulBasis?: string;
  basis?: string;
  goodsOrServices?: string;
  description?: string;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["as", "Assamese"], ["bn", "Bengali"], ["gu", "Gujarati"], ["kn", "Kannada"], ["ml", "Malayalam"], ["mr", "Marathi"], ["or", "Odia"], ["pa", "Punjabi"], ["ta", "Tamil"], ["te", "Telugu"], ["ur", "Urdu"],
] as const;

/** `/me/privacy` -- published contacts, notices and routes for escalating a concern. */
export function MePrivacyPage() {
  const [language, setLanguage] = useState("en");
  const [noticeId, setNoticeId] = useState<string | null>(null);
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["me", "privacy-contact"],
    queryFn: () => principalApiClient.get<PrivacyContact>("/me/privacy-contact"),
  });
  const { data: notices, isLoading: noticesLoading } = useQuery({
    queryKey: ["me", "notices"],
    queryFn: () => principalApiClient.get<NoticeSummary[]>("/me/notices"),
  });
  const { data: selectedNotice, isLoading: noticeLoading } = useQuery({
    queryKey: ["me", "notices", noticeId, language],
    queryFn: () => principalApiClient.get<NoticeView>(`/me/notices/${noticeId}?lang=${encodeURIComponent(language)}`),
    enabled: Boolean(noticeId),
  });
  const organizationName = contact?.organizationName ?? contact?.companyName ?? contact?.legalName ?? "This organization";
  const publishedPurposes = useMemo<PublishedPurpose[]>(
    () =>
      (notices ?? []).flatMap((notice) =>
        (notice.purposeStatements ?? notice.purposes ?? []).map((purpose): PublishedPurpose => ({
          noticeId: notice.id,
          purposeName: "purposeName" in purpose ? stringOrUndefined(purpose.purposeName) : undefined,
          name: purpose.name,
          lawfulBasis: purpose.lawfulBasis,
          basis: purpose.basis,
          goodsOrServices: "goodsOrServices" in purpose ? stringOrUndefined(purpose.goodsOrServices) : undefined,
          description: "description" in purpose ? purpose.description : undefined,
        })),
      ),
    [notices],
  );

  return (
    <div className="space-y-8">
      <PortalPageHeader title="Privacy information">
        Find out who is responsible for your data, why it is used and how to get help.
      </PortalPageHeader>
      {contactLoading || noticesLoading ? <><Skeleton className="h-36 w-full" /><Skeleton className="h-48 w-full" /></> : <>
        <section className="grid gap-4 sm:grid-cols-2">
          <Card><CardHeader><CardTitle className="text-lg">Company</CardTitle></CardHeader><CardContent><p className="text-base">{organizationName}</p>{contact?.publicPrivacyPageUrl ? <a className="mt-2 inline-block text-sm text-primary underline underline-offset-4" href={contact.publicPrivacyPageUrl} target="_blank" rel="noreferrer">Read the public privacy page</a> : null}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Privacy contact</CardTitle></CardHeader><CardContent className="space-y-1">{contact?.published ? <><p>{contact.contactName ?? "Privacy contact"}{contact.isDpo ? " (Data Protection Officer)" : ""}</p>{contact.contactEmail ? <a className="block text-primary underline underline-offset-4" href={`mailto:${contact.contactEmail}`}>{contact.contactEmail}</a> : null}{contact.contactPhone ? <a className="block text-primary underline underline-offset-4" href={`tel:${contact.contactPhone}`}>{contact.contactPhone}</a> : null}</> : <p className="text-muted-foreground">A privacy contact has not been published yet.</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-lg">Grievance contact</CardTitle></CardHeader><CardContent>{contact?.grievanceContactEmail ? <a className="text-primary underline underline-offset-4" href={`mailto:${contact.grievanceContactEmail}`}>{contact.grievanceContactEmail}</a> : <p className="text-muted-foreground">Use the grievance form below so we can track and respond to your concern.</p>}</CardContent></Card>
        </section>

        <section aria-labelledby="purposes" className="space-y-3"><h2 id="purposes" className="text-xl font-semibold">Why we use your data</h2>{publishedPurposes.length ? <div className="space-y-3">{publishedPurposes.map((purpose, index) => <Card key={`${purpose.noticeId}-${index}`}><CardContent className="p-4"><p className="font-medium">{purpose.purposeName ?? purpose.name ?? "Published purpose"}</p>{purpose.goodsOrServices ?? purpose.description ? <p className="mt-1 text-muted-foreground">{purpose.goodsOrServices ?? purpose.description}</p> : null}<p className="mt-2 text-sm text-muted-foreground">Basis: {purpose.lawfulBasis ?? purpose.basis ?? "See the notice"}</p></CardContent></Card>)}</div> : <p className="text-muted-foreground">No purposes have been published here yet.</p>}</section>

        <section aria-labelledby="notices" className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="notices" className="text-xl font-semibold">Privacy notices</h2><p className="text-muted-foreground">Choose a language to read a notice version.</p></div><label className="text-sm font-medium" htmlFor="notice-language">Language<Select id="notice-language" className="mt-1 min-w-40" value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></label></div>{notices?.length ? <div className="space-y-3">{notices.map((notice) => <Card key={notice.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{notice.title ?? notice.name ?? "Privacy notice"}</p>{notice.versions?.length ? <p className="text-sm text-muted-foreground">{notice.versions.length} version{notice.versions.length === 1 ? "" : "s"} available</p> : null}</div><Button variant="outline" onClick={() => setNoticeId(notice.id)}>Read this notice</Button></CardContent></Card>)}</div> : <p className="text-muted-foreground">No privacy notices have been published here yet.</p>}
          {noticeId ? <Card className="border-primary"><CardHeader><CardTitle>{selectedNotice?.title ?? selectedNotice?.name ?? "Privacy notice"}{selectedNotice?.version ? ` — version ${selectedNotice.version}` : ""}</CardTitle></CardHeader><CardContent className="space-y-3">{noticeLoading ? <Skeleton className="h-48 w-full" /> : <>{selectedNotice?.fallbackToEnglish ? <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">This notice is not available in the language you chose, so it is shown in English.</p> : null}<div data-color-mode="light"><MDEditor.Markdown source={selectedNotice?.bodyMarkdown ?? selectedNotice?.body ?? "This notice could not be displayed."} style={{ backgroundColor: "transparent", color: "inherit" }} /></div></>}<Button variant="outline" onClick={() => setNoticeId(null)}>Close notice</Button></CardContent></Card> : null}
        </section>

        <section className="flex flex-wrap gap-3"><Button asChild><Link to="/me/consents">Withdraw permission</Link></Button><Button asChild variant="outline"><Link to="/me/requests?type=GRIEVANCE">Raise a grievance</Link></Button>{selectedNotice?.boardComplaintUrl ? <Button asChild variant="link"><a href={selectedNotice.boardComplaintUrl} target="_blank" rel="noreferrer">How to complain to the Board</a></Button> : <p className="self-center text-sm text-muted-foreground">If you are not satisfied after raising a grievance, you may complain to the Data Protection Board of India. The Board link is shown in each published notice.</p>}</section>
      </>}
    </div>
  );
}
