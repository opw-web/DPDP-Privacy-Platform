import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { employeeApiClient, ApiError } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { FieldShell, SelectControl, CheckboxOption } from "../form-controls";
import {
  AUTH_TYPE_VALUES,
  SYNC_FREQUENCY_VALUES,
  type AuthType,
  type PublicDataSource,
  type SyncFrequency,
} from "../../lib/data-sources-api";
import { humanizeEnum } from "../../lib/enum-options";

const connectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  systemType: z.string().trim().min(1, "System type is required, e.g. \"Shopify\"."),
  baseUrl: z.string().trim().min(1, "Base URL is required."),
  recordsPath: z.string().trim().min(1, "Records path is required, e.g. \"data\"."),
  externalIdField: z.string().trim().min(1, "The source system's primary key field is required."),
  authType: z.enum(AUTH_TYPE_VALUES as [AuthType, ...AuthType[]]),
  credential: z.string(),
  supportsIncremental: z.boolean(),
  incrementalParam: z.string(),
  paginationStyle: z.string().trim().min(1, "Pagination style is required."),
  pageSize: z.coerce.number().int().min(1, "Page size must be at least 1."),
  syncFrequency: z.enum(SYNC_FREQUENCY_VALUES as [SyncFrequency, ...SyncFrequency[]]),
});

type ConnectionFormValues = z.infer<typeof connectionSchema>;

function defaultsFor(dataSource?: PublicDataSource): ConnectionFormValues {
  return {
    name: dataSource?.name ?? "",
    systemType: dataSource?.systemType ?? "",
    baseUrl: dataSource?.baseUrl ?? "",
    recordsPath: dataSource?.recordsPath ?? "data",
    externalIdField: dataSource?.externalIdField ?? "id",
    authType: dataSource?.authType ?? "BEARER",
    // NEVER pre-filled from `dataSource.credentialHint` or anything else --
    // this API never returns the stored credential, and this field must
    // never look pre-populated even cosmetically. See `credentialHint`
    // rendered separately below.
    credential: "",
    supportsIncremental: dataSource?.supportsIncremental ?? false,
    incrementalParam: dataSource?.incrementalParam ?? "",
    paginationStyle: dataSource?.paginationStyle ?? "PAGE",
    pageSize: dataSource?.pageSize ?? 100,
    syncFrequency: dataSource?.syncFrequency ?? "MANUAL",
  };
}

interface TestConnectionResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  dataSource: PublicDataSource;
}

interface Step1ConnectionProps {
  /** Present once this source has been saved -- edit semantics (credential hidden behind "Replace credentials") apply whenever this is set, in the wizard just as much as on the detail page's Overview tab. */
  dataSource?: PublicDataSource;
  onSaved: (dataSource: PublicDataSource) => void;
}

/**
 * Step ① of the wizard, and the Overview tab's editable connection panel
 * on `/app/data-sources/:id` (same component, same file -- the brief
 * lists one `Step1Connection.tsx`). "Test connection" only enables once a
 * `dataSource` exists (a live id to call `/test-connection` against),
 * which for a brand-new source means "created" (a DRAFT row) rather than
 * "fully configured" -- the wizard always creates the row on this step's
 * first save.
 *
 * The credential field is NEVER pre-filled (task brief's hardest-attacked
 * requirement): `defaultsFor` above hard-codes `credential: ""`
 * regardless of `dataSource`, and once `dataSource` exists the input is
 * hidden behind a "Replace credentials" checkbox that starts unchecked --
 * only `credentialHint` (last 4 chars) is ever shown. The submitted
 * payload omits the `credential` key entirely unless that checkbox is on
 * AND a new value was typed, so an unchanged save can never overwrite (or
 * echo back) the stored secret.
 */
export function Step1Connection({ dataSource, onSaved }: Step1ConnectionProps) {
  const queryClient = useQueryClient();
  const [isReplacingCredential, setIsReplacingCredential] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: defaultsFor(dataSource),
  });

  const authType = watch("authType");

  const save = useMutation({
    mutationFn: async (values: ConnectionFormValues) => {
      const shared = {
        name: values.name,
        systemType: values.systemType,
        baseUrl: values.baseUrl,
        recordsPath: values.recordsPath,
        externalIdField: values.externalIdField,
        authType: values.authType,
        supportsIncremental: values.supportsIncremental,
        incrementalParam: values.incrementalParam || undefined,
        paginationStyle: values.paginationStyle,
        pageSize: values.pageSize,
        syncFrequency: values.syncFrequency,
      };
      const includeCredential =
        (!dataSource || isReplacingCredential) && values.credential.length > 0;
      const payload = includeCredential
        ? { ...shared, credential: values.credential }
        : shared;

      if (dataSource) {
        return employeeApiClient.patch<PublicDataSource>(
          `/data-sources/${dataSource.id}`,
          payload,
        );
      }
      return employeeApiClient.post<PublicDataSource>("/data-sources", payload);
    },
    onSuccess: async (saved) => {
      setIsReplacingCredential(false);
      await queryClient.invalidateQueries({ queryKey: ["data-source", saved.id] });
      await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      toast.success(dataSource ? "Connection details updated." : "Data source created.");
      onSaved(saved);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(`A data source with this name already exists.`);
        return;
      }
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not save this connection. Please try again.";
      toast.error(message);
    },
  });

  const testConnection = useMutation({
    mutationFn: () =>
      employeeApiClient.post<TestConnectionResult>(
        `/data-sources/${dataSource!.id}/test-connection`,
      ),
    onSuccess: async (result) => {
      setTestResult(result);
      await queryClient.invalidateQueries({ queryKey: ["data-source", dataSource!.id] });
      await queryClient.invalidateQueries({ queryKey: ["data-sources"] });
      if (!result.ok) {
        toast.error(`Connection test failed: ${result.message}`);
      } else {
        toast.success(`Connection succeeded (${result.latencyMs}ms).`);
      }
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not run the connection test. Please try again.";
      toast.error(message);
    },
  });

  const onSubmit = handleSubmit((values) => {
    save.mutate(values);
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Name" htmlFor="ds-name" error={errors.name?.message}>
          <Input id="ds-name" {...register("name")} />
        </FieldShell>
        <FieldShell label="System type" htmlFor="ds-system-type" error={errors.systemType?.message}>
          <Input id="ds-system-type" placeholder="Shopify" {...register("systemType")} />
        </FieldShell>
      </div>

      <FieldShell label="Base URL" htmlFor="ds-base-url" error={errors.baseUrl?.message}>
        <Input id="ds-base-url" placeholder="https://example.com/api/records" {...register("baseUrl")} />
      </FieldShell>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell
          label="Records path"
          htmlFor="ds-records-path"
          error={errors.recordsPath?.message}
          hint={<p className="text-xs text-muted-foreground">Dot-separated JSON path to the record array, e.g. "data".</p>}
        >
          <Input id="ds-records-path" {...register("recordsPath")} />
        </FieldShell>
        <FieldShell
          label="External ID field"
          htmlFor="ds-external-id"
          error={errors.externalIdField?.message}
        >
          <Input id="ds-external-id" {...register("externalIdField")} />
        </FieldShell>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldShell label="Auth type" htmlFor="ds-auth-type" error={errors.authType?.message}>
          <SelectControl id="ds-auth-type" {...register("authType")}>
            {AUTH_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {humanizeEnum(value)}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
        <FieldShell label="Sync frequency" htmlFor="ds-sync-frequency" error={errors.syncFrequency?.message}>
          <SelectControl id="ds-sync-frequency" {...register("syncFrequency")}>
            {SYNC_FREQUENCY_VALUES.map((value) => (
              <option key={value} value={value}>
                {humanizeEnum(value)}
              </option>
            ))}
          </SelectControl>
        </FieldShell>
      </div>

      {authType !== "NONE" ? (
        <div className="space-y-1.5">
          {dataSource ? (
            <>
              <p className="text-sm text-muted-foreground">
                {dataSource.credentialHint
                  ? `Current credential ends in ••••${dataSource.credentialHint}.`
                  : "No credential is currently configured."}
              </p>
              <CheckboxOption
                id="ds-replace-credential"
                label="Replace credentials"
                checked={isReplacingCredential}
                onChange={(event) => setIsReplacingCredential(event.target.checked)}
              />
              {isReplacingCredential ? (
                <FieldShell label="New credential" htmlFor="ds-credential">
                  <Input
                    id="ds-credential"
                    type="password"
                    autoComplete="off"
                    placeholder="Enter the new credential"
                    {...register("credential")}
                  />
                </FieldShell>
              ) : null}
            </>
          ) : (
            <FieldShell
              label="Credential"
              htmlFor="ds-credential"
              hint={<p className="text-xs text-muted-foreground">Bearer token, API key, or basic-auth "user:pass". Encrypted at rest; never returned by any API afterwards.</p>}
            >
              <Input id="ds-credential" type="password" autoComplete="off" {...register("credential")} />
            </FieldShell>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving..." : dataSource ? "Save changes" : "Create data source"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!dataSource || testConnection.isPending}
            onClick={() => testConnection.mutate()}
          >
            {testConnection.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Testing...
              </>
            ) : (
              "Test connection"
            )}
          </Button>
          {!dataSource ? (
            <span className="text-xs text-muted-foreground">Save the connection first to test it.</span>
          ) : null}
        </div>
      </div>

      {testResult ? (
        <div
          className={
            testResult.ok
              ? "flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
              : "flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          }
          role="status"
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {testResult.message} &middot; {testResult.latencyMs}ms
          </span>
        </div>
      ) : null}
    </form>
  );
}
