import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { employeeLogin, useEmployeeAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Only ever redirects back to a same-app, single-leading-slash path
 * recovered from our own guard's `location.pathname` -- never used
 * unvalidated. react-router-dom 6.x (the locked major; see the frontend
 * report's concerns) has an open-redirect advisory for backslash-prefixed
 * targets passed to `<Navigate>`/`useNavigate`, unfixed on the 6.x line;
 * this guard is the belt-and-braces mitigation so a URL like
 * `/login` with a crafted `from` can never resolve to a protocol-relative
 * or external target.
 */
function sanitizeRedirectTarget(candidate: unknown): string {
  if (
    typeof candidate === "string" &&
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\")
  ) {
    return candidate;
  }
  return "/app";
}

/** `/login` -- email + password, no self-signup (spec line 843). Employee accounts are created by an administrator on `/app/employees`. */
export function LoginPage() {
  const { status } = useEmployeeAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  if (status === "authenticated") {
    const from = sanitizeRedirectTarget((location.state as { from?: unknown } | null)?.from);
    return <Navigate to={from} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      await employeeLogin(values.email, values.password);
      const from = sanitizeRedirectTarget((location.state as { from?: unknown } | null)?.from);
      navigate(from, { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 401
          ? "Incorrect email or password."
          : "Could not sign in. Please try again.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>DPDP Platform</CardTitle>
          <CardDescription>
            Sign in with your organization account. New accounts are created by your
            administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
