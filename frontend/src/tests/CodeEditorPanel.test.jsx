import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import CodeEditorPanel from "../components/CodeEditorPanel";

// Monaco Editor doesn't work in jsdom — stub it with a plain textarea
vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }) => (
    <textarea
      data-testid="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const baseProps = {
  selectedLanguage: "javascript",
  code: "console.log('hello')",
  isRunning: false,
  onLanguageChange: vi.fn(),
  onCodeChange: vi.fn(),
  onRunCode: vi.fn(),
};

describe("CodeEditorPanel", () => {
  it("renders a Run Code button", () => {
    render(<CodeEditorPanel {...baseProps} />);
    expect(screen.getByRole("button", { name: /run code/i })).toBeInTheDocument();
  });

  it("disables the button and shows 'Running...' while code is executing", () => {
    render(<CodeEditorPanel {...baseProps} isRunning={true} />);
    const btn = screen.getByRole("button", { name: /running/i });
    expect(btn).toBeDisabled();
  });

  it("calls onRunCode when Run Code is clicked", async () => {
    const onRunCode = vi.fn();
    render(<CodeEditorPanel {...baseProps} onRunCode={onRunCode} />);
    await userEvent.click(screen.getByRole("button", { name: /run code/i }));
    expect(onRunCode).toHaveBeenCalledOnce();
  });

  it("renders the language selector with all 3 supported languages", () => {
    render(<CodeEditorPanel {...baseProps} />);
    expect(screen.getByRole("option", { name: "JavaScript" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Python" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Java" })).toBeInTheDocument();
  });

  it("calls onLanguageChange when a different language is selected", async () => {
    const onLanguageChange = vi.fn();
    render(<CodeEditorPanel {...baseProps} onLanguageChange={onLanguageChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "python");
    expect(onLanguageChange).toHaveBeenCalled();
  });
});

