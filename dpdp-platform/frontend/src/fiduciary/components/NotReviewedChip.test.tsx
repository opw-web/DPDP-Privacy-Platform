import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotReviewedChip } from "./NotReviewedChip";

describe("NotReviewedChip -- spec lines 739-748: amber chip until reviewedByEmployeeId is set", () => {
  it("renders the amber 'Not yet reviewed' chip when isReviewed is false", () => {
    render(<NotReviewedChip isReviewed={false} />);
    expect(screen.getByText("Not yet reviewed")).toBeInTheDocument();
  });

  it("renders nothing once the purpose has been reviewed", () => {
    const { container } = render(<NotReviewedChip isReviewed={true} />);
    expect(container).toBeEmptyDOMElement();
  });
});
