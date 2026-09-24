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
