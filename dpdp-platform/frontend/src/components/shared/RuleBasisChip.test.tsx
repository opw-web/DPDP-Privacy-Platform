import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RuleBasisChip } from "./RuleBasisChip";

describe("RuleBasisChip", () => {
  it("shows the legal citation in a tooltip for a STATUTORY row", async () => {
    render(<RuleBasisChip basis="STATUTORY" citation="Rule 7(3)" />);
    expect(screen.getByText("Statutory")).toBeInTheDocument();
    expect(await screen.findByText("Rule 7(3)")).toBeInTheDocument();
  });

  it("shows the legal citation in a tooltip for a SECTORAL row", async () => {
    render(<RuleBasisChip basis="SECTORAL" citation="RBI Master Direction, para 12" />);
    expect(await screen.findByText("RBI Master Direction, para 12")).toBeInTheDocument();
  });

  it("never renders the word 'statutory' for an ORG_POLICY row, even when a citation-shaped string is passed", async () => {
    render(<RuleBasisChip basis="ORG_POLICY" citation="Internal SLA v3" />);
    expect(screen.getByText("Org policy")).toBeInTheDocument();
    expect(screen.queryByText(/statutory/i)).not.toBeInTheDocument();

    expect(await screen.findByText(/not a legal requirement/i)).toBeInTheDocument();
    // The reference remains discoverable, but is explicitly not presented as law.
    expect(screen.getByText(/organization reference: internal sla v3/i)).toBeInTheDocument();
    expect(screen.queryByText(/statutory/i)).not.toBeInTheDocument();
  });

  it("never renders the word 'statutory' for an INTERNAL_TARGET row", async () => {
    render(<RuleBasisChip basis="INTERNAL_TARGET" />);
    expect(screen.getByText("Internal target")).toBeInTheDocument();
    expect(screen.queryByText(/statutory/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/not a legal requirement/i)).toBeInTheDocument();
  });
});
