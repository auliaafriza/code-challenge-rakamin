import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { LEVELS, LEVEL_LABELS, LEVEL_DESCRIPTIONS } from "@/utils/constants";
import { cn } from "@/lib/utils";

interface LevelRadioProps {
  value: number;
  onChange: (level: number) => void;
  disabled?: boolean;
  className?: string;
  /** Names the group, so a screen reader says which skill is being rated. */
  label?: string;
}

/**
 * Three things this component was getting wrong, all invisible until you look.
 *
 * 1. Every instance rendered the same five DOM ids — `level-1` … `level-5`. A
 *    form with three skills therefore had three elements called `level-3`, and
 *    `<label for="level-3">` binds to the *first* one in the document. Clicking
 *    the L3 label on the third skill card moved the radio on the first. `useId`
 *    scopes the ids per instance.
 * 2. The levels came from a bare `[1,2,3,4,5]` literal, which indexes
 *    `Record<Level, string>` as `any` — the label maps and the iteration order
 *    could drift apart with nothing to catch it. `LEVELS` is the single source.
 * 3. Each option's accessible name was "L3" and nothing else. The chip stays
 *    short for density, but the announced name now carries the meaning.
 */
export default function LevelRadio({ value, onChange, disabled, className, label }: LevelRadioProps) {
  const groupId = useId();

  return (
    <RadioGroup
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
      aria-label={label ?? "Expected level"}
      className={cn("flex items-center gap-3", className)}
    >
      {LEVELS.map((level) => {
        const optionId = `${groupId}-level-${level}`;
        return (
          <div key={level} className="flex items-center gap-1">
            <RadioGroupItem
              value={String(level)}
              id={optionId}
              aria-label={`${LEVEL_LABELS[level]} — ${LEVEL_DESCRIPTIONS[level]}`}
            />
            <Label htmlFor={optionId} className="cursor-pointer font-normal">
              {LEVEL_LABELS[level]}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
