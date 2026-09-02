import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { CheckboxOption } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";

/**
 * `REQUESTING_BODIES`, transcribed verbatim from
 * `backend/src/modules/board/dto/requesting-body.ts` (Step 32 brief: "use
 * its values verbatim, do not retype [it] from memory" -- the values below
 * ARE that constant, not a paraphrase). Declared locally, not imported from
 * a shared frontend lib, per this task's file-ownership constraint.
 */
const REQUESTING_BODIES = ["BOARD", "CENTRAL_GOVERNMENT"] as const;
type RequestingBody = (typeof REQUESTING_BODIES)[number];

const REQUESTING_BODY_LABELS: Record<RequestingBody, string> = {
  BOARD: "Data Protection Board",
  CENTRAL_GOVERNMENT: "Central Government",
};

/**
 * Mirrors `PrincipalListItem`/the envelope `PrincipalsService.list` and
 * `PrincipalsPage.tsx` already use for `GET /api/principals` exactly
 * (`{ items, page, pageSize }`, `pageSize` fixed at
 * `PRINCIPALS_PAGE_SIZE = 25` server-side) -- declared locally here rather
 * than imported from `PrincipalsPage.tsx`, per this task's file-ownership
 * constraint (no shared lib, and no cross-page import onto a file another
 * agent may be editing concurrently).
 */
interface PrincipalListItem {
  id: string;
  displayName: string | null;
  reference: string;
}

interface PrincipalListResponse {
  items: PrincipalListItem[];
  page: number;
  pageSize: number;
}

export interface InformationRequestFormValues {
  requestingBody: RequestingBody | "";
  authorisedPersonRef: string;
  purposeCited: string;
  receivedAt: string;
  responseDueAt: string;
  nonDisclosureDirected: boolean;
  nonDisclosurePermissionRef: string;
  affectedPrincipalIds: string[];
}

export const EMPTY_INFORMATION_REQUEST_FORM: InformationRequestFormValues = {
  requestingBody: "",
  authorisedPersonRef: "",
  purposeCited: "",
  receivedAt: "",
  responseDueAt: "",
  nonDisclosureDirected: false,
  nonDisclosurePermissionRef: "",
  affectedPrincipalIds: [],
};

/**
 * Client-side check for the five fields that carry ordinary DTO decorators
 * with no legal citation attached to their rejection (`@IsIn`, `@IsString`
 * + `@MinLength`, `@IsDateString` on `CreateInformationRequestDto`) -- a
 * bare "this is required" is the whole of what the server would say for
 * any of these too, so blocking here is plain UX, not a swallowed
 * citation.
 *
 * Fix round 2 (Critical): `nonDisclosurePermissionRef` is deliberately
 * NOT checked here. `CreateInformationRequestDto` leaves it a bare
 * `@IsOptional() @IsString()` on purpose -- Rule 23(2)'s "a direction
 * needs its authorisation reference" is enforced by
 * `InformationRequestsService.assertDirectionHasAuthorisation`, whose
 * rejection carries the Rule 23(2) citation text. A client-side gate on
 * that field would swallow that citation and replace it with a generic
 * sentence composed in the browser -- the exact bug class this project
 * already shipped once
 * (Task 6's `@ValidateIf` DTO validator masking a 409 as a 400). The
 * missing-reference case is left to reach the server every time; `submit`
 * always POSTs regardless of `nonDisclosureDirected`/
 * `nonDisclosurePermissionRef`, and the citation comes back verbatim
 * through the existing `ApiError`-message toast path. The field still
 * carries `required` and inline guidance text in the JSX below -- that is
 * UI hinting, never an early return.
 */
export function isInformationRequestFormValid(values: InformationRequestFormValues): boolean {
  if (!values.requestingBody) return false;
  if (!values.authorisedPersonRef.trim()) return false;
  if (!values.purposeCited.trim()) return false;
  if (!values.receivedAt) return false;
  if (!values.responseDueAt) return false;
  return true;
}

/**
 * Builds the exact `CreateInformationRequestDto` shape from form state.
 * `nonDisclosurePermissionRef` and `affectedPrincipalIds` are optional on
 * the DTO, so they are only included when they carry a value -- an empty
 * string/array is omitted rather than sent.
 */
export function buildInformationRequestPayload(values: InformationRequestFormValues) {
  return {
    requestingBody: values.requestingBody,
    authorisedPersonRef: values.authorisedPersonRef.trim(),
    purposeCited: values.purposeCited.trim(),
    receivedAt: new Date(values.receivedAt).toISOString(),
    responseDueAt: new Date(values.responseDueAt).toISOString(),
    nonDisclosureDirected: values.nonDisclosureDirected,
    ...(values.nonDisclosureDirected
      ? { nonDisclosurePermissionRef: values.nonDisclosurePermissionRef.trim() }
      : {}),
    ...(values.affectedPrincipalIds.length > 0
      ? { affectedPrincipalIds: values.affectedPrincipalIds }
      : {}),
  };
}

/**
 * Same debounce convention `PrincipalsPage.tsx` already uses for its own
 * `q=` search box (300ms, a plain `setTimeout`/`useEffect` -- no new
 * dependency). Duplicated locally rather than imported: `PrincipalsPage.tsx`
 * does not export it, and it is not worth adding a shared-lib export for a
 * six-line hook while two other agents are editing this repo.
 */
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface InformationRequestFormProps {
  onDone: () => void;
}

/**
 * Create form for `POST /information-requests` (BD-01...BD-04, Rule 23 +
 * Seventh Schedule) -- Step 32: lets an operator record a Government
 * information request with a non-disclosure direction naming a specific
 * data principal. Follows the same toggle-panel-with-inline-form house
 * pattern as `ChildrenPage.tsx`'s `GuardianForm`/`ExemptionClaimForm`.
 *
 * Fix round 1: the affected-principals picker searches `GET
 * /principals?q=` (same endpoint/param `PrincipalsPage.tsx` uses) instead
 * of only ever showing the unfiltered first page of 25 -- with ~323
 * principals in the live demo data, a name like Aman was very unlikely to
 * be among the first 25 by default ordering. A principal, once selected,
 * is remembered in `selectedLabels` (id -> label) independent of the
 * current search result set, so narrowing the search to find a second
 * person never silently drops the first; the "Selected" list below the
 * search is the one place that always shows every current selection and
 * lets it be removed again. When a search returns a full page of results
 * (`items.length === pageSize`), there may be more matches than shown --
 * that is surfaced as an on-screen hint rather than silently truncated.
 */
export function InformationRequestForm({ onDone }: InformationRequestFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<InformationRequestFormValues>(EMPTY_INFORMATION_REQUEST_FORM);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>({});
  const [principalQuery, setPrincipalQuery] = useState("");
  const debouncedPrincipalQuery = useDebouncedValue(principalQuery, 300).trim();

  const { data: principalData, isLoading: principalsLoading } = useQuery({
    queryKey: ["information-requests", "principals", debouncedPrincipalQuery],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedPrincipalQuery.length > 0) params.set("q", debouncedPrincipalQuery);
      params.set("page", "1");
      return employeeApiClient.get<PrincipalListResponse>(`/principals?${params.toString()}`);
    },
  });
  const principalResults = principalData?.items ?? [];
  // Never re-render an already-selected principal a second time inside the
  // search results -- she has her own row in the "Selected" list below,
  // which is the one that survives a search-term change.
  const unselectedResults = principalResults.filter((principal) => !(principal.id in selectedLabels));
  const mayHaveMorePrincipalMatches =
    principalData !== undefined && principalData.items.length >= principalData.pageSize;
  const selectedEntries = Object.entries(selectedLabels);

  const create = useMutation({
    mutationFn: () =>
      employeeApiClient.post("/information-requests", buildInformationRequestPayload(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["information-requests"] });
      toast.success("Information request recorded.");
      onDone();
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof ApiError && error.message
          ? error.message
          : "Could not record the information request.",
      );
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Only the five plain-DTO-decorator fields are gated client-side (see
    // `isInformationRequestFormValid`'s doc comment). A missing non-
    // disclosure authorisation reference is deliberately NOT checked here
    // -- the POST always goes through, so the server's cited Rule 23(2)
    // rejection reaches the operator verbatim via the mutation's onError
    // toast below, instead of being replaced by a generic client message.
    if (!isInformationRequestFormValid(values)) {
      toast.error(
        "Requesting body, authorised person reference, purpose/citation, received date and " +
          "response due date are required.",
      );
      return;
    }
    create.mutate();
  }

  function toggleAffectedPrincipal(id: string, label: string) {
    const isSelected = values.affectedPrincipalIds.includes(id);
    if (isSelected) {
      setValues((c) => ({
        ...c,
        affectedPrincipalIds: c.affectedPrincipalIds.filter((existing) => existing !== id),
      }));
      setSelectedLabels((c) => {
        const next = { ...c };
        delete next[id];
        return next;
      });
    } else {
      setValues((c) => ({ ...c, affectedPrincipalIds: [...c.affectedPrincipalIds, id] }));
      setSelectedLabels((c) => ({ ...c, [id]: label }));
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ir-requesting-body">Requesting body</Label>
          <Select
            id="ir-requesting-body"
            value={values.requestingBody}
            onChange={(e) =>
              setValues((c) => ({ ...c, requestingBody: e.target.value as RequestingBody | "" }))
            }
          >
            <option value="">Select requesting body…</option>
            {REQUESTING_BODIES.map((body) => (
              <option key={body} value={body}>
                {REQUESTING_BODY_LABELS[body]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ir-authorised-person">Authorised person reference</Label>
          <Input
            id="ir-authorised-person"
            value={values.authorisedPersonRef}
            onChange={(e) => setValues((c) => ({ ...c, authorisedPersonRef: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ir-purpose">Purpose / citation</Label>
        <Textarea
          id="ir-purpose"
          value={values.purposeCited}
          onChange={(e) => setValues((c) => ({ ...c, purposeCited: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ir-received-at">Received</Label>
          <Input
            id="ir-received-at"
            type="date"
            value={values.receivedAt}
            onChange={(e) => setValues((c) => ({ ...c, receivedAt: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ir-response-due-at">Response due</Label>
          <Input
            id="ir-response-due-at"
            type="date"
            value={values.responseDueAt}
            onChange={(e) => setValues((c) => ({ ...c, responseDueAt: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <CheckboxOption
          id="ir-non-disclosure-directed"
          label="Non-disclosure direction (Rule 23(2))"
          checked={values.nonDisclosureDirected}
          onChange={(e) =>
            setValues((c) => ({
              ...c,
              nonDisclosureDirected: e.target.checked,
              nonDisclosurePermissionRef: e.target.checked ? c.nonDisclosurePermissionRef : "",
            }))
          }
        />
        {values.nonDisclosureDirected ? (
          <div className="space-y-1.5 pl-6">
            <Label htmlFor="ir-non-disclosure-ref">Authorisation reference</Label>
            <Input
              id="ir-non-disclosure-ref"
              required
              value={values.nonDisclosurePermissionRef}
              onChange={(e) =>
                setValues((c) => ({ ...c, nonDisclosurePermissionRef: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Required once a non-disclosure direction is on -- Rule 23(2) needs its own
              authorisation reference recorded.
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ir-principal-search">Affected data principals</Label>
        <Input
          id="ir-principal-search"
          placeholder="Search by name, email, phone or customer ID…"
          value={principalQuery}
          onChange={(e) => setPrincipalQuery(e.target.value)}
        />

        {selectedEntries.length > 0 ? (
          <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Selected ({selectedEntries.length})
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {selectedEntries.map(([id, label]) => (
                <CheckboxOption
                  key={id}
                  id={`ir-selected-principal-${id}`}
                  label={label}
                  checked
                  onChange={() => toggleAffectedPrincipal(id, label)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {principalsLoading ? (
          <p className="text-sm text-muted-foreground">Loading data principals…</p>
        ) : unselectedResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {debouncedPrincipalQuery.length > 0
              ? "No data principals match that search."
              : "No data principals are available to name."}
          </p>
        ) : (
          <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
            {unselectedResults.map((principal) => (
              <CheckboxOption
                key={principal.id}
                id={`ir-principal-${principal.id}`}
                label={principal.displayName ?? principal.reference}
                checked={false}
                onChange={() =>
                  toggleAffectedPrincipal(principal.id, principal.displayName ?? principal.reference)
                }
              />
            ))}
          </div>
        )}
        {mayHaveMorePrincipalMatches ? (
          <p role="status" className="text-xs text-amber-700">
            More than {principalData?.pageSize} data principals match -- refine the search to
            find a specific person; matches beyond this list are not shown.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Names the specific data principal(s) a non-disclosure direction covers -- suppressed
          from her portal, access report and evidence file when the direction is on.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Save request"}
        </Button>
      </div>
    </form>
  );
}
