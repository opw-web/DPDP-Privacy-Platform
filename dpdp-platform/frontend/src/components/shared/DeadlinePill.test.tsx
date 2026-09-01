import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DeadlinePill } from "./DeadlinePill";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoIn(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe("DeadlinePill", () => {
  it("renders neutral (secondary) with the day text when more than 50% of the window remains", () => {
    // 8-day window, 5 days (62.5%) left.
    render(<DeadlinePill windowStart={isoIn(-3 * DAY_MS)} dueAt={isoIn(5 * DAY_MS)} />);
    const pill = screen.getByText(/in 5 days/i);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain("bg-secondary");
  });

  it("renders amber with the day text between 50% and 20% of the window remaining", () => {
    // 10-day window, 3 days (30%) left.
    render(<DeadlinePill windowStart={isoIn(-7 * DAY_MS)} dueAt={isoIn(3 * DAY_MS)} />);
    const pill = screen.getByText(/in 3 days/i);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain("amber");
  });

  it("renders orange with the day text when under 20% of the window remains but is not yet past due", () => {
    // 20-day window, 2 days (10%) left.
    render(<DeadlinePill windowStart={isoIn(-18 * DAY_MS)} dueAt={isoIn(2 * DAY_MS)} />);
    const pill = screen.getByText(/in 2 days/i);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain("bg-orange");
  });

  it("renders red (destructive) with the overdue text once past due", () => {
    render(<DeadlinePill windowStart={isoIn(-10 * DAY_MS)} dueAt={isoIn(-3 * DAY_MS)} />);
    const pill = screen.getByText(/3 days overdue/i);
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain("bg-destructive");
  });

  it("always renders text alongside colour -- never a colour-only signal", () => {
    const { container } = render(
      <DeadlinePill windowStart={isoIn(-1 * DAY_MS)} dueAt={isoIn(-1 * DAY_MS)} />,
    );
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
  });
});
