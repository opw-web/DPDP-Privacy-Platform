import { createContext, useContext } from "react";
import { formatInOrgTimezone, formatUtcTooltip } from "../../lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

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
 */
export function DateTime({ value, className }: DateTimeProps) {
  const timeZone = useOrgTimezone();
  const display = formatInOrgTimezone(value, timeZone);
  const tooltip = formatUtcTooltip(value);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value} className={className}>
          {display}
        </time>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
