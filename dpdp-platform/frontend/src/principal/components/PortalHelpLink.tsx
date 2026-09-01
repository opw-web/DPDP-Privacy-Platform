import { Link } from "react-router-dom";

/**
 * The portal-wide escape hatch to the grievance form. Keeping it as a
 * component makes the required "Need help?" link hard to accidentally omit
 * when a new principal-facing screen is added.
 */
export function PortalHelpLink() {
  return (
    <p className="text-sm text-muted-foreground">
      Need help?{" "}
      <Link className="text-primary underline underline-offset-4" to="/me/requests?type=GRIEVANCE">
        Raise a grievance
      </Link>
      .
    </p>
  );
}
