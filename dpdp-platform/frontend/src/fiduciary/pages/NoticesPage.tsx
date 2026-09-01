import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { PermissionGate } from "../../components/shared/PermissionGate";
import type { Notice } from "../components/notices/types";

/** `/app/notices` — versioned Rule 3 notices. */
export function NoticesPage() {
  const { data: notices = [], isLoading } = useQuery({ queryKey: ["notices"], queryFn: () => employeeApiClient.get<Notice[]>("/notices") });
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Privacy notices</h1><p className="text-sm text-muted-foreground">Standalone, itemised and versioned notices. A published version is frozen.</p></div><PermissionGate permission="CAN_MANAGE_NOTICES"><Button asChild><Link to="/app/notices/new"><Plus className="h-4 w-4" />New notice</Link></Button></PermissionGate></div>
    {isLoading ? <p className="text-sm text-muted-foreground">Loading notices…</p> : notices.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground">No notices yet. Create a notice shell, then compose its first draft version from mapped data fields.</CardContent></Card> : <div className="grid gap-4 md:grid-cols-2">{notices.map((notice) => <Card key={notice.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{notice.name}</CardTitle><CardDescription>{notice.code}</CardDescription></div><Badge variant={notice.status === "PUBLISHED" ? "default" : "secondary"}>{notice.status.toLowerCase()}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{notice.purposeIds.length} purpose{notice.purposeIds.length === 1 ? "" : "s"} covered</p><Button variant="outline" size="sm" asChild><Link to={`/app/notices/${notice.id}`}>Open builder</Link></Button></CardContent></Card>)}</div>}
  </div>;
}
