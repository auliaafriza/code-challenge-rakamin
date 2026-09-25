import { LANGUAGES, LANGUAGE_LABELS } from "./strings";
import { useLanguage } from "./LanguageProvider";
import { cn } from "@/lib/utils";

/**
 * Dua tombol, bukan dropdown.
 *
 * Kandidat yang salah bahasa tidak bisa membaca label dropdown-nya untuk
 * menemukan jalan keluar. Dua pilihan yang keduanya terlihat selalu bisa
 * ditekan, apa pun bahasa yang sedang aktif.
 */
export default function LanguageToggle({ className }: { className?: string }) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={t.languageLabel}
    >
      {LANGUAGES.map((code) => {
        const active = code === language;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLanguage(code)}
            aria-pressed={active}
            lang={code}
            title={LANGUAGE_LABELS[code]}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
