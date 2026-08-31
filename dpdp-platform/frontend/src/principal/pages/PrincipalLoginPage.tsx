import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { principalLogin, usePrincipalAuth } from "../../lib/auth";
import { ApiError } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

const loginSchema = z.object({
  email: z.string().min(1, "Enter your email address").email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * The five personas `prisma/seed-principals.ts` claims accounts for
 * (`DEMO_PRINCIPALS_TO_CLAIM`), transcribed verbatim for on-screen display
 * only -- this page cannot import that backend module, and these are
 * intentionally public, non-secret demo credentials, not something being
 * newly disclosed here. Matches `EmployeesPage.tsx`'s `DEMO_EMPLOYEES`
 * transcription pattern exactly.
 */
const DEMO_PRINCIPALS: ReadonlyArray<{ email: string; label: string }> = [
  { email: "aman.sharma@gmail.com", label: "Aman Sharma" },
  { email: "neha.rao@example.com", label: "Neha Rao" },
  { email: "raj.patel@gmail.com", label: "Raj Patel" },
  { email: "sara.khan@example.com", label: "Sara Khan" },
  { email: "vikram.n@gmail.com", label: "Vikram Nair" },
];
const DEMO_PASSWORD = "Password123!";

/** Whether the demo-credentials banner should render -- a pure function of the build's PROD flag so it can be tested without stubbing `import.meta.env`. Mirrors `EmployeesPage.tsx`'s `shouldShowDemoCredentials` exactly. */
export function shouldShowDemoCredentials(isProductionBuild: boolean): boolean {
  return !isProductionBuild;
}

function DemoCredentialsBanner() {
  if (!shouldShowDemoCredentials(import.meta.env.PROD)) {
    return null;
  }
  return (
    <div className="mt-4 w-full max-w-sm rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Demo accounts (non-production build only)</p>
      <p>
        Every claimed demo account shares the password{" "}
        <code className="rounded bg-muted px-1 py-0.5 font-mono">{DEMO_PASSWORD}</code>:
      </p>
      <ul className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {DEMO_PRINCIPALS.map((demo) => (
          <li key={demo.email}>
            <span className="font-mono">{demo.email}</span> — {demo.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `/me/login` -- plainer language, larger type; this is read by members of the public, not compliance staff. */
export function PrincipalLoginPage() {
  const { status } = usePrincipalAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  if (status === "authenticated") {
    return <Navigate to="/me" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      await principalLogin(values.email, values.password);
      navigate("/me", { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 401
          ? "That email or password isn't right. Please try again."
          : "We couldn't sign you in right now. Please try again.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Your Privacy Portal</CardTitle>
          <CardDescription className="text-base">
            Sign in to see the personal data this organization holds about you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-base">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                className="h-11 text-base"
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-base">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="h-11 text-base"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : null}
            </div>
            <Button type="submit" size="lg" className="w-full text-base" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <DemoCredentialsBanner />
    </div>
  );
}
