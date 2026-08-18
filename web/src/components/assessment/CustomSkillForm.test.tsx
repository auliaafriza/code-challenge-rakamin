import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import CustomSkillForm from "./CustomSkillForm";
import type { AssessmentFormValues } from "@/pages/assessments/AssessmentNewPage";

/**
 * The custom skill form asks for seven required fields, every one of them a
 * definition the AI will grade a human being against. All seven were registered
 * `required: true` and not one of them rendered a message.
 *
 * The failure mode was not a missing error — it was a *silent* one: submit
 * blocked, button re-enabled, page unchanged. The assessor's only feedback that
 * anything had happened was that nothing had happened. These tests hold the
 * form to saying which field is wrong, and to saying it somewhere assistive
 * technology will announce.
 */
function Harness({ onSubmit }: { onSubmit?: () => void }) {
  const form = useForm<AssessmentFormValues>({
    defaultValues: {
      name: "",
      time_limit_min: 45,
      language: "en",
      expires_on: "",
      skills: [{ skill_label: "", is_custom: true, expected_level: 3, display_order: 0 }],
    },
  });

  return (
    <form onSubmit={form.handleSubmit(() => onSubmit?.())}>
      <CustomSkillForm index={0} form={form} />
      <button type="submit">Save</button>
    </form>
  );
}

describe("CustomSkillForm", () => {
  it("names every field it is blocking on, instead of failing silently", async () => {
    const user = userEvent.setup();
    let submitted = false;
    render(<Harness onSubmit={() => (submitted = true)} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(submitted).toBe(false);

    // One message per blocked field: name, scope, and five anchors.
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(7);
    expect(screen.getByText("Nama skill wajib diisi.")).toBeTruthy();
    expect(screen.getByText(/Anchor L1 wajib diisi/)).toBeTruthy();
    expect(screen.getByText(/Anchor L5 wajib diisi/)).toBeTruthy();
  });

  it("links each message to its own field so a screen reader reads them together", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findAllByRole("alert");

    const nameInput = screen.getByLabelText(/^Name/);
    expect(nameInput).toHaveAttribute("aria-invalid", "true");
    expect(nameInput).toHaveAttribute("aria-describedby", "skills.0.skill_label-error");
    expect(document.getElementById("skills.0.skill_label-error")).toBeTruthy();
  });

  it("marks the required fields as required rather than relying on an asterisk alone", () => {
    render(<Harness />);
    // The asterisk is aria-hidden; the words are what actually get announced.
    expect(screen.getAllByText("(wajib diisi)", { exact: false }).length).toBeGreaterThanOrEqual(7);
  });

  it("clears the message once the field is filled in", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Nama skill wajib diisi.")).toBeTruthy();

    await user.type(screen.getByLabelText(/^Name/), "Communication");

    expect(screen.queryByText("Nama skill wajib diisi.")).toBeNull();
  });
});
