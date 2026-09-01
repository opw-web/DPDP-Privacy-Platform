import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

interface Template { id: string; code: string; name: string; category: string; subject: string; bodyMarkdown: string; }
export function MessagingTemplatesPage() {
  const query = useQuery({ queryKey: ["messaging-templates"], queryFn: () => employeeApiClient.get<Template[]>("/templates") });
  return <div className="space-y-6"><div className="flex items-start justify-between"><div><h1 className="text-xl font-semibold">Message templates</h1><p className="text-sm text-muted-foreground">Markdown-only content with a closed variable whitelist.</p></div><Button asChild><Link to="/app/messaging/templates/new">New template</Link></Button></div>{query.isLoading ? <p>Loading templates…</p> : <div className="grid gap-4 md:grid-cols-2">{(query.data ?? []).map((template) => <Card key={template.id}><CardHeader><CardTitle>{template.name}</CardTitle><p className="text-sm text-muted-foreground">{template.code} · {template.category}</p></CardHeader><CardContent><p className="text-sm">{template.subject}</p><Button className="mt-3" variant="outline" asChild><Link to={`/app/messaging/templates/${template.id}`}>Edit template</Link></Button></CardContent></Card>)}</div>}</div>;
}
