import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row>[] = [{ accessorKey: "name", header: "Name" }];

const clickAction = { label: "Do something", onClick: () => {} };

describe("DataTable", () => {
  it("renders skeleton rows, never a spinner, while loading (spec line 872)", () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        isLoading
        emptyState={{ description: "x", action: clickAction }}
      />,
    );
    expect(screen.getByTestId("data-table-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders the empty state, with its explanation and a next action, when there is no data", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DataTable
          columns={columns}
          data={[]}
          emptyState={{
            description: "No data sources have been connected yet.",
            action: { label: "Connect a data source", to: "/app/data-sources/new" },
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("No data sources have been connected yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect a data source" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders one row per record once loaded", () => {
    render(
      <DataTable
        columns={columns}
        data={[
          { id: "1", name: "Marketing Database" },
          { id: "2", name: "Sales CRM" },
        ]}
        emptyState={{ description: "x", action: clickAction }}
        getRowId={(row) => row.id}
      />,
    );
    expect(screen.getByText("Marketing Database")).toBeInTheDocument();
    expect(screen.getByText("Sales CRM")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // 1 header + 2 data rows
  });
});
