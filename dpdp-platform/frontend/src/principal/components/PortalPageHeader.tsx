import type { ReactNode } from "react";
import { PortalHelpLink } from "./PortalHelpLink";

// Re-export the shared help link for portal pages that need a standalone
// placement (for example the home page) while keeping the header contract in
// one module.
export { PortalHelpLink };

interface PortalPageHeaderProps {
  title: string;
  children: ReactNode;
}

/** A plain-language heading plus the required help route on every portal screen. */
export function PortalPageHeader({ title, children }: PortalPageHeaderProps) {
  return (
    <header className="space-y-2">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-base text-muted-foreground">{children}</p>
      </div>
      <PortalHelpLink />
    </header>
  );
}
