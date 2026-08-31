import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DateTime, OrgTimezoneProvider } from "./DateTime";

describe("DateTime", () => {
  it("renders without throwing when mounted with NO TooltipProvider ancestor at all", () => {
    // Regression test for the crash a reviewer found: PortalShell (and any
    // bare mount, e.g. in a future test or a page that forgets the
    // wrapper) does not wrap its tree in <TooltipProvider>. `<DateTime>`
    // must be safe to render there without the caller knowing or
    // remembering anything -- this test intentionally supplies NO
    // provider of any kind.
    expect(() => render(<DateTime value="2024-01-01T00:00:00.000Z" />)).not.toThrow();
  });

  it("shows the org-timezone display and carries the UTC instant as the dateTime attribute, with no ancestor provider", () => {
    render(<DateTime value="2024-01-01T00:00:00.000Z" />);
    const time = screen.getByText("01 Jan 2024, 00:00");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2024-01-01T00:00:00.000Z");
  });

  it("still converts using an ancestor OrgTimezoneProvider when one is present", () => {
    render(
      <OrgTimezoneProvider value="Asia/Kolkata">
        <DateTime value="2024-01-01T00:00:00.000Z" />
      </OrgTimezoneProvider>,
    );
    expect(screen.getByText("01 Jan 2024, 05:30")).toBeInTheDocument();
  });
});
