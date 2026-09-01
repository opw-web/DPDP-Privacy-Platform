import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoticeStandalonePreview } from "./NoticePreview";

describe("NoticeStandalonePreview", () => {
  it("renders the Rule 3 structure as a standalone notice with all three links", () => {
    render(<NoticeStandalonePreview bodyMarkdown="# Clear notice\nThis is understandable by itself." itemisedDataFields={[{ sourceFieldMappingId: "m1", canonicalField: "EMAIL", dataCategory: "CONTACT", label: "Your email address" }]} purposeStatements={[{ purposeId: "p1", purposeName: "Marketing", goodsOrServices: "Offers and services" }]} withdrawalUrl="https://example.test/withdraw" rightsUrl="https://example.test/rights" boardComplaintUrl="https://example.test/board" />);
    expect(screen.getByRole("article", { name: /standalone privacy notice/i })).toBeInTheDocument();
    expect(screen.getByText("Your email address")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /withdraw consent/i })).toHaveAttribute("href", "https://example.test/withdraw");
    expect(screen.getByRole("link", { name: /exercise your rights/i })).toHaveAttribute("href", "https://example.test/rights");
    expect(screen.getByRole("link", { name: /complain to the board/i })).toHaveAttribute("href", "https://example.test/board");
  });
});
