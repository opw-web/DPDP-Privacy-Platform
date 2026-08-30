import type { ComponentType } from "react";
import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

interface ComingSoonSlotProps {
  /** Plain-language name of the feature, e.g. "Consents". */
  title: string;
  /** One plain-language line saying what this section will hold. */
  description: string;
  icon?: ComponentType<{ className?: string }>;
}

/**
 * A visible placeholder for a portal section that does not exist yet
 * (Consents / Requests / Messages, until MVP 2). It renders "Coming
 * soon" -- it never hides the section entirely, because the absence of
 * these features is itself information the person is entitled to see,
 * not something to tidy away (spec line 863).
 */
export function ComingSoonSlot({ title, description, icon: Icon = Clock }: ComingSoonSlotProps) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
        <Badge variant="secondary">Coming soon</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-base text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
