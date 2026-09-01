import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UnreviewedRuleChip } from "./UnreviewedRuleChip";

function renderWithRouter(isReviewed: boolean) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UnreviewedRuleChip isReviewed={isReviewed} />
    </MemoryRouter>,
  );
}

describe("UnreviewedRuleChip -- matches NotReviewedChip's 'absence is the reviewed state' convention", () => {
  it("renders the amber chip, linking to /app/settings/compliance, when not reviewed", () => {
    renderWithRouter(false);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/app/settings/compliance");
    expect(screen.getByText(/not yet reviewed/i)).toBeInTheDocument();
  });

  it("renders nothing once the rule has been reviewed", () => {
    const { container } = renderWithRouter(true);
    expect(container).toBeEmptyDOMElement();
  });
});
