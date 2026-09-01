import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

interface Campaign { id: string; reference: string; name: string; category: string; status: string; recipientCount: number; sentCount: number; approvedByEmployeeId: string | null; }
export function MessagingCampaignsPage() { const query = useQuery({ queryKey: ["campaigns"], queryFn: () => employeeApiClient.get<Campaign[]>("/campaigns") }); return <div className="space-y-6"><div className="flex items-start justify-between"><div><h1 className="text-xl font-semibold">Campaigns</h1><p className="text-sm text-muted-foreground">Preview, approve, and send operational messages.</p></div><Button asChild><Link to="/app/messaging/campaigns/new">New campaign</Link></Button></div><div className="grid gap-4 md:grid-cols-2">{(query.data ?? []).map((campaign) => <Card key={campaign.id}><CardHeader><CardTitle>{campaign.name}</CardTitle><p className="text-sm text-muted-foreground">{campaign.reference} · {campaign.category} · {campaign.status}</p></CardHeader><CardContent><p className="text-sm">{campaign.recipientCount} recipients · {campaign.sentCount} sent</p><Button className="mt-3" variant="outline" asChild><Link to={`/app/messaging/campaigns/${campaign.id}`}>Open campaign</Link></Button></CardContent></Card>)}</div></div>; }
