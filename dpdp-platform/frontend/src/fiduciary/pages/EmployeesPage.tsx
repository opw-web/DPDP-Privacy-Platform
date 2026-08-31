import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, ShieldOff, ShieldCheck, UserPlus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { DataTable } from "../../components/shared/DataTable";
import { DateTime } from "../../components/shared/DateTime";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { usePermission } from "../../lib/permissions";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

/** Mirrors `EmployeeStatus` in `prisma/schema.prisma` exactly. */
type EmployeeStatus = "INVITED" | "ACTIVE" | "DISABLED";

/** Mirrors `EMPLOYEE_PUBLIC_SELECT` in `employees.service.ts` exactly -- never a `passwordHash` field, because the backend never sends one. */
interface EmployeeRow {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  status: EmployeeStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors `RolesService.list()`'s response shape (`role.controller.ts` -> `GET /api/roles`). */
interface RoleRow {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}

const createEmployeeSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  fullName: z.string().min(1, "Full name is required"),
  roleId: z.string().min(1, "Select a role"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>;

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/**
 * Every write on this page (`POST /employees`, `PATCH /employees/:id`,
 * `POST /employees/:id/reset-password`) is `CAN_MANAGE_EMPLOYEES`-gated
 * server side. `<PermissionGate>` here is cosmetic only -- it saves an
 * actor without the permission a wasted round trip, it grants nothing.
 * A 403 from any of these calls (a stale client-side permission, or a
 * forged request bypassing the hidden UI entirely) is still handled here,
 * never assumed away.
 */
function describeMutationError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "You do not have permission to do this. Ask an administrator with Manage Employees access.";
    }
    if (error.message) {
      return error.message;
    }
  }
  return fallback;
}

function statusBadgeVariant(status: EmployeeStatus): NonNullable<BadgeProps["variant"]> {
  if (status === "ACTIVE") return "success";
  if (status === "DISABLED") return "destructive";
  return "secondary";
}

/**
 * All demo employee accounts and their shared password, transcribed
 * verbatim from `prisma/seed/demo-org.ts` (`DEMO_EMPLOYEES`,
 * `DEMO_PASSWORD`) for on-screen display only -- this page cannot import
 * that backend module, and these are intentionally public, non-secret
 * demo credentials, not something being newly disclosed here.
 */
const DEMO_EMPLOYEES: ReadonlyArray<{ email: string; roleLabel: string }> = [
  { email: "admin@acmeretail.demo", roleLabel: "Admin" },
  { email: "dpo@acmeretail.demo", roleLabel: "DPO" },
  { email: "compliance@acmeretail.demo", roleLabel: "Compliance Manager" },
  { email: "employee@acmeretail.demo", roleLabel: "Employee" },
  { email: "auditor@acmeretail.demo", roleLabel: "Auditor" },
];
const DEMO_PASSWORD = "Password123!";

/** Whether the demo-credentials banner should render -- a pure function of the build's PROD flag so it can be tested without stubbing `import.meta.env`. */
export function shouldShowDemoCredentials(isProductionBuild: boolean): boolean {
  return !isProductionBuild;
}

function DemoCredentialsBanner() {
  if (!shouldShowDemoCredentials(import.meta.env.PROD)) {
    return null;
  }
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Demo accounts (non-production build only)</p>
      <p>
        All seeded demo employees share the password{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">{DEMO_PASSWORD}</code>:
      </p>
      <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {DEMO_EMPLOYEES.map((demo) => (
          <li key={demo.email}>
            <span className="font-mono">{demo.email}</span> — {demo.roleLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `/app/employees` -- list, create, disable/enable, role change and
 * password reset (spec line 858). Every write affordance is wrapped in
 * `<PermissionGate permission="CAN_MANAGE_EMPLOYEES">`: an actor without
 * it (e.g. an Auditor) sees the list but no button, select, or form that
 * would let them write -- not a disabled control, an absent one. The
 * server (`EmployeesController`, `@RequirePermission`) is the actual
 * enforcement point either way.
 */
export function EmployeesPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission("CAN_MANAGE_EMPLOYEES");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [resetPasswordFor, setResetPasswordFor] = useState<EmployeeRow | null>(null);

  const { data: employees, isLoading: isEmployeesLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => employeeApiClient.get<EmployeeRow[]>("/employees"),
  });

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => employeeApiClient.get<RoleRow[]>("/roles"),
  });

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const role of roles ?? []) {
      map.set(role.id, role.name);
    }
    return map;
  }, [roles]);

  const createForm = useForm<CreateEmployeeValues>({
    resolver: zodResolver(createEmployeeSchema),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateEmployeeValues) =>
      employeeApiClient.post<EmployeeRow>("/employees", values),
    onSuccess: () => {
      toast.success("Employee added.");
      createForm.reset();
      setShowCreateForm(false);
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      toast.error(describeMutationError(error, "Could not add this employee. Please try again."));
    },
  });

  const roleChangeMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      employeeApiClient.patch<EmployeeRow>(`/employees/${id}`, { roleId }),
    onSuccess: () => {
      toast.success("Role updated.");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      toast.error(describeMutationError(error, "Could not change this employee's role."));
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EmployeeStatus }) =>
      employeeApiClient.patch<EmployeeRow>(`/employees/${id}`, { status }),
    onSuccess: (_data, variables) => {
      toast.success(variables.status === "DISABLED" ? "Employee disabled." : "Employee re-enabled.");
      void queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      toast.error(describeMutationError(error, "Could not change this employee's status."));
    },
  });

  const resetPasswordForm = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      employeeApiClient.post(`/employees/${id}/reset-password`, { newPassword }),
    onSuccess: () => {
      toast.success("Password reset.");
      resetPasswordForm.reset();
      setResetPasswordFor(null);
    },
    onError: (error) => {
      toast.error(describeMutationError(error, "Could not reset this employee's password."));
    },
  });

  const columns = useMemo<ColumnDef<EmployeeRow>[]>(
    () => [
      { accessorKey: "fullName", header: "Name" },
      { accessorKey: "email", header: "Email" },
      {
        id: "role",
        header: "Role",
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <PermissionGate
              permission="CAN_MANAGE_EMPLOYEES"
              fallback={<span>{roleNameById.get(employee.roleId) ?? employee.roleId}</span>}
            >
              <select
                aria-label={`Role for ${employee.fullName}`}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={employee.roleId}
                disabled={roleChangeMutation.isPending}
                onChange={(event) => {
                  roleChangeMutation.mutate({ id: employee.id, roleId: event.target.value });
                }}
              >
                {(roles ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </PermissionGate>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={statusBadgeVariant(row.original.status)}>{row.original.status}</Badge>
        ),
      },
      {
        id: "lastLoginAt",
        header: "Last login",
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <DateTime value={row.original.lastLoginAt} className="text-sm text-muted-foreground" />
          ) : (
            <span className="text-sm text-muted-foreground">Never</span>
          ),
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const employee = row.original;
          return (
            <PermissionGate
              permission="CAN_MANAGE_EMPLOYEES"
              fallback={<span className="text-xs text-muted-foreground">No access</span>}
            >
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setResetPasswordFor(employee)}
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Reset password
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={statusMutation.isPending}
                  onClick={() =>
                    statusMutation.mutate({
                      id: employee.id,
                      status: employee.status === "DISABLED" ? "ACTIVE" : "DISABLED",
                    })
                  }
                >
                  {employee.status === "DISABLED" ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Enable
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                      Disable
                    </>
                  )}
                </Button>
              </div>
            </PermissionGate>
          );
        },
      },
    ],
    [roleNameById, roleChangeMutation, roles, statusMutation],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">
            Accounts that can sign in to this organization's console, their role and status.
          </p>
        </div>
        <PermissionGate permission="CAN_MANAGE_EMPLOYEES">
          <Button
            type="button"
            className="gap-2"
            onClick={() => setShowCreateForm((current) => !current)}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add employee
          </Button>
        </PermissionGate>
      </div>

      <DemoCredentialsBanner />

      {showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add employee</CardTitle>
            <CardDescription>
              Creates an account with an initial password. There is no invite-email flow in MVP
              1 -- share the password with them directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="new-employee-email">Email</Label>
                <Input id="new-employee-email" type="email" {...createForm.register("email")} />
                {createForm.formState.errors.email ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-employee-name">Full name</Label>
                <Input id="new-employee-name" {...createForm.register("fullName")} />
                {createForm.formState.errors.fullName ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.fullName.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-employee-role">Role</Label>
                <select
                  id="new-employee-role"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  defaultValue=""
                  {...createForm.register("roleId")}
                >
                  <option value="" disabled>
                    Select a role
                  </option>
                  {(roles ?? []).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {createForm.formState.errors.roleId ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.roleId.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-employee-password">Initial password</Label>
                <Input
                  id="new-employee-password"
                  type="password"
                  autoComplete="new-password"
                  {...createForm.register("password")}
                />
                {createForm.formState.errors.password ? (
                  <p className="text-sm text-destructive">
                    {createForm.formState.errors.password.message}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add employee"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    createForm.reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {resetPasswordFor ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reset password for {resetPasswordFor.fullName}</CardTitle>
            <CardDescription>
              Sets a new password immediately. Share it with {resetPasswordFor.fullName} directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={resetPasswordForm.handleSubmit((values) =>
                resetPasswordMutation.mutate({ id: resetPasswordFor.id, newPassword: values.newPassword }),
              )}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="reset-password-new">New password</Label>
                <Input
                  id="reset-password-new"
                  type="password"
                  autoComplete="new-password"
                  {...resetPasswordForm.register("newPassword")}
                />
                {resetPasswordForm.formState.errors.newPassword ? (
                  <p className="text-sm text-destructive">
                    {resetPasswordForm.formState.errors.newPassword.message}
                  </p>
                ) : null}
              </div>
              <Button type="submit" disabled={resetPasswordMutation.isPending}>
                {resetPasswordMutation.isPending ? "Resetting..." : "Set password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setResetPasswordFor(null);
                  resetPasswordForm.reset();
                }}
              >
                Cancel
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={employees ?? []}
        isLoading={isEmployeesLoading}
        getRowId={(row) => row.id}
        emptyState={{
          description: "No employees yet. Add the first account to give someone access.",
          action: canManage
            ? { label: "Add employee", onClick: () => setShowCreateForm(true) }
            : {
                label: "Ask an administrator",
                onClick: () =>
                  toast.info("Ask an administrator with Manage Employees access to add accounts."),
              },
        }}
      />
    </div>
  );
}
