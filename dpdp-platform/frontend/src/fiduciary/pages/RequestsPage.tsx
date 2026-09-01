import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { DataTable } from "../../components/shared/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import { humanizeEnum } from "../lib/enum-options";
import type { RequestRecord } from "../components/requests/types";

function Counter({ label, value, amber = false }: { label: string; value: number; amber?: boolean }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={amber ? "text-2xl font-semibold text-amber-700" : "text-2xl font-semibold"}>{value}</p></CardContent></Card>; }
/** `/app/requests` — operational view of rights requests and their stored deadlines. */
export function RequestsPage() {
  const { data: requests = [], isLoading } = useQuery({ queryKey: ["requests"], queryFn: () => employeeApiClient.get<RequestRecord[]>("/requests"), refetchInterval: 20_000 });
  const counters = useMemo(() => { const now = Date.now(); const active = requests.filter((item) => !["COMPLETED", "REJECTED", "CANCELLED"].includes(item.status)); return { open: requests.filter((item) => item.status === "OPEN").length, dueSoon: active.filter((item) => !item.isOverdue && item.warningAt && new Date(item.warningAt).getTime() <= now).length, overdue: requests.filter((item) => item.isOverdue).length, awaiting: requests.filter((item) => item.status === "WAITING_FOR_PRINCIPAL").length, escalated: requests.filter((item) => item.status === "ESCALATED").length, unassigned: active.filter((item) => !item.assignedEmployeeId).length }; }, [requests]);
  const columns: ColumnDef<RequestRecord>[] = [{ accessorKey: "reference", header: "Reference", cell: ({ row }) => <Link className="font-medium text-primary hover:underline" to={`/app/requests/${row.original.reference}`}>{row.original.reference}</Link> }, { accessorKey: "type", header: "Type", cell: ({ row }) => humanizeEnum(row.original.type) }, { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant={row.original.isOverdue ? "destructive" : "secondary"}>{humanizeEnum(row.original.status)}{row.original.isOverdue ? " · overdue" : ""}</Badge> }, { accessorKey: "subject", header: "Subject" }, { id: "deadline", header: "Deadline", cell: ({ row }) => row.original.dueAt ? new Date(row.original.dueAt).toLocaleString() : "No deadline rule configured" }];
  return <div className="space-y-6"><div><h1 className="text-xl font-semibold">Rights requests</h1><p className="text-sm text-muted-foreground">Status and deadline views are operational prompts, not a conclusion that the company is compliant.</p></div><div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><Counter label="Open" value={counters.open} /><Counter label="Due Soon" value={counters.dueSoon} amber /><Counter label="Overdue" value={counters.overdue} amber /><Counter label="Awaiting Principal" value={counters.awaiting} /><Counter label="Escalated" value={counters.escalated} /><Counter label="Unassigned" value={counters.unassigned} /></div><DataTable columns={columns} data={requests} isLoading={isLoading} getRowId={(request) => request.id} emptyState={{ title: "No rights requests", description: "Requests submitted through the Data Principal portal appear here.", action: { label: "Open Data Principal portal", to: "/me" } }} /></div>;
}
