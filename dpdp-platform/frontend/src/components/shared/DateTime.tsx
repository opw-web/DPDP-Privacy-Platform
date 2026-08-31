import { createContext, useContext } from "react";
import { formatInOrgTimezone, formatUtcTooltip } from "../../lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

/**
 * The organization's timezone, provided once near the root of the
 * fiduciary route tree (`AppShell`, from `GET /api/organization`) so every
 * `<DateTime>` under it converts consistently without each call site
 * re-fetching or re-deriving it. Defaults to "UTC" for any `<DateTime>`
 * rendered before that fetch resolves, or outside the fiduciary tree
 * entirely -- never a guess at the organization's real timezone.
 */
const OrgTimezoneContext = createContext<string>("UTC");
export const OrgTimezoneProvider = OrgTimezoneContext.Provider;
export function useOrgTimezone(): string {
  return useContext(OrgTimezoneContext);
}

interface DateTimeProps {
  /** A UTC ISO-8601 instant, exactly as the API sent it. */
  value: string;
  className?: string;
}

/**
 * The one render boundary where a UTC instant becomes a wall-clock time
 * (global constraint #7). Shows the organization-timezone rendering; the
 * UTC instant itself is always available in the tooltip, never hidden.
 *
 * Wraps its own Radix `<TooltipProvider>` rather than requiring one from
 * an ancestor. `<DateTime>` is a shared component six other tasks render
 * from both route trees (`AppShell` wraps its tree in a provider;
 * `PortalShell` and bare `main.tsx` mounts do not) -- a mounting
 * precondition an ancestor has to remember is exactly the kind of
 * invisible contract that gets forgotten. Radix providers nest cleanly
 * (an inner one just governs its own subtree), so this local provider is
 * a no-op where an ancestor one already exists and the thing that makes
 * "render `<DateTime>` outside any provider" simply not a failure mode,
 * instead of a rule every future shell must remember to satisfy.
 */
export function DateTime({ value, className }: DateTimeProps) {
  const timeZone = useOrgTimezone();
  const display = formatInOrgTimezone(value, timeZone);
  const tooltip = formatUtcTooltip(value);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <time dateTime={value} className={className}>
            {display}
          </time>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
