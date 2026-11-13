import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import OutputPanel from "../components/OutputPanel";

describe("OutputPanel", () => {
  it("shows a placeholder when there is no output yet", () => {
    render(<OutputPanel output={null} />);
    expect(screen.getByText(/Click "Run Code" to see the output here/i)).toBeInTheDocument();
  });

  it("displays stdout when execution succeeds", () => {
    render(<OutputPanel output={{ success: true, output: "[0, 1]" }} />);
    expect(screen.getByText("[0, 1]")).toBeInTheDocument();
  });

  it("displays the error message when execution fails", () => {
    render(
      <OutputPanel
        output={{ success: false, error: "NameError: name 'x' is not defined" }}
      />
    );
    expect(screen.getByText(/NameError/)).toBeInTheDocument();
  });
});
