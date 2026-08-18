import type { FieldError } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Required marks and validation messages that are actually rendered.
 *
 * Every form in this app destructured `formState.errors` and then displayed it
 * in exactly one place across the whole codebase. Everywhere else a field was
 * registered `required: true`, react-hook-form silently blocked the submit, the
 * button re-enabled, and nothing explained what was wrong — most painfully on
 * the custom skill form, where five long behavioural anchors are typed by hand
 * and one blank field stops the save with no indication which.
 */

/** The asterisk, with a screen-reader-visible word rather than punctuation alone. */
export function RequiredMark() {
  return (
    <span className="text-destructive">
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (wajib diisi)</span>
    </span>
  );
}

export function FieldMessage({ error, id }: { error?: FieldError; id?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {error.message || "Wajib diisi."}
    </p>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: FieldError;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + message, wired together so the message is announced. */
export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: FieldProps) {
  const messageId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label} {required && <RequiredMark />}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldMessage error={error} id={messageId} />
    </div>
  );
}

/** Applied to inputs so assistive tech links the control to its message. */
export function errorProps(error?: FieldError, id?: string) {
  if (!error) return {};
  return {
    "aria-invalid": true as const,
    "aria-describedby": id ? `${id}-error` : undefined,
    className: "border-destructive focus-visible:ring-destructive",
  };
}
