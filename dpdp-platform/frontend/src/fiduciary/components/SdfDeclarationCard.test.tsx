import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SdfDeclarationCard, type SdfDeclarationFields } from "./SdfDeclarationCard";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const ORGANIZATION: SdfDeclarationFields = {
  isSignificantDataFiduciary: false,
  sdfNotifiedAt: null,
  sdfNotificationRef: null,
  thirdScheduleClass: "NONE",
  registeredUserCount: null,
  classDeclaredByEmployeeId: "emp1",
  classDeclaredAt: "2026-01-15T00:00:00.000Z",
};

function renderCard(organization: SdfDeclarationFields = ORGANIZATION) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SdfDeclarationCard organization={organization} />
    </QueryClientProvider>,
  );
}

describe("SdfDeclarationCard", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("always renders the 'this is your determination, not ours' disclaimer", () => {
    renderCard();
    expect(
      screen.getByText(/this is your organization's own determination, not ours/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the platform never infers significant data fiduciary status/i),
    ).toBeInTheDocument();
  });

  it("never claims the organization 'is compliant' with anything", () => {
    renderCard();
    expect(screen.queryByText(/is compliant/i)).not.toBeInTheDocument();
  });

  it("renders without an unauthenticated employee session -- no permission means read-only, not a crash", () => {
    // No login has happened in this test at all: `usePermission` resolves
    // against the default (empty) employee session, so this exercises the
    // exact same "no edit form" path an actor without
    // CAN_CHANGE_ORG_SETTINGS would see.
    renderCard();
    expect(screen.queryByRole("button", { name: /save declaration/i })).not.toBeInTheDocument();
    expect(screen.getByText("Not declared")).toBeInTheDocument();
  });

  it("shows who last declared the Third Schedule class and when, through <DateTime>", () => {
    renderCard();
    const timeElement = screen.getByText(/15 jan 2026/i);
    expect(timeElement.tagName.toLowerCase()).toBe("time");
    expect(timeElement).toHaveAttribute("dateTime", ORGANIZATION.classDeclaredAt);
    expect(screen.getByText(/employee emp1/i)).toBeInTheDocument();
  });
});
