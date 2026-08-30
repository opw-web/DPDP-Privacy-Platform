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
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
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
    </div>
  );
}
