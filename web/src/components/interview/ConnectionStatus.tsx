import { Loader2 } from "lucide-react";
import { useT } from "@/i18n/LanguageProvider";

interface ConnectionStatusProps {
  state: "connected" | "reconnecting" | "lost";
}

export default function ConnectionStatus({ state }: ConnectionStatusProps) {
  const t = useT();

  if (state === "connected") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
        {t.connStatusConnected}
      </div>
    );
  }
  if (state === "reconnecting") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {t.connStatusReconnecting}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-destructive">
      <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
      {t.connStatusReconnecting}
    </div>
  );
}
