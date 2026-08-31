import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("always shows a one-line explanation (spec line 872)", () => {
    render(
      <EmptyState
        description="No data sources have been connected yet."
        action={{ label: "Connect a data source", onClick: () => {} }}
      />,
    );
    expect(screen.getByText("No data sources have been connected yet.")).toBeInTheDocument();
  });

  it("fires the next action when it is a click handler", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <EmptyState
        description="No data sources have been connected yet."
        action={{ label: "Connect a data source", onClick }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Connect a data source" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders the next action as a route link when given `to`", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <EmptyState
          description="No data sources have been connected yet."
          action={{ label: "Connect a data source", to: "/app/data-sources/new" }}
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Connect a data source" });
    expect(link).toHaveAttribute("href", "/app/data-sources/new");
  });
});
