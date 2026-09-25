import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LanguageProvider";

interface InterviewTimerProps {
  totalSeconds: number;
  onExpired?: () => void;
  running: boolean;
  className?: string;
}

function formatTime(s: number) {
  const safe = Math.max(0, s);
  const m = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Menunjukkan seberapa jauh sesi sudah berjalan, bukan seberapa sedikit waktu
 * yang tersisa.
 *
 * Versi sebelumnya adalah hitung mundur yang berubah merah dan menetap di sana
 * selama satu menit terakhir. Kandidat yang melihatnya mempersingkat jawaban —
 * lalu dinilai "bukti tidak cukup" oleh model, karena jawabannya memang jadi
 * pendek. UI-nya yang menyebabkan temuan itu, bukan kompetensinya.
 *
 * Batang progres memberi informasi yang sama tanpa mendesak, dan peringatan
 * ditahan sampai dua menit terakhir — cukup untuk menutup satu jawaban.
 */
export default function InterviewTimer({
  totalSeconds,
  onExpired,
  running,
  className,
}: InterviewTimerProps) {
  const t = useT();

  // Sisa waktu dihitung dari tenggat, bukan dari pengurangan tiap detik.
  //
  // Rantai setTimeout kehilangan waktu: browser melambatkan timer di tab yang
  // tidak aktif, jadi kandidat yang sempat berpindah tab melihat timer yang
  // tertinggal dari jam sungguhan — lalu sesinya berakhir lebih awal daripada
  // yang tertulis di layarnya. Dalam sesi 45 menit selisihnya bukan sepele.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(totalSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    setRemaining(totalSeconds);
    setDeadline(null);
    expiredRef.current = false;
  }, [totalSeconds]);

  useEffect(() => {
    if (!running) return;

    // Tenggat dipasang saat timer benar-benar mulai berjalan, dan jeda
    // memindahkannya — waktu yang tidak berjalan tidak boleh ikut terhitung.
    const endsAt = deadline ?? Date.now() + remaining * 1000;
    if (deadline === null) setDeadline(endsAt);

    const tick = () => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpired?.();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running, deadline, remaining, onExpired]);

  useEffect(() => {
    if (!running) setDeadline(null);
  }, [running]);

  const elapsed = Math.min(Math.max(totalSeconds - remaining, 0), totalSeconds);
  const percent = totalSeconds > 0 ? (elapsed / totalSeconds) * 100 : 0;
  const nearlyDone = remaining <= 120;

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="timer"
      aria-label={t.timeElapsed}
    >
      <div
        className="h-1 w-16 overflow-hidden rounded-full bg-muted sm:w-24"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSeconds}
        aria-valuenow={elapsed}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-1000 ease-linear",
            nearlyDone ? "bg-amber-500" : "bg-primary/60"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          nearlyDone ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"
        )}
      >
        {t.timeLeftShort(formatTime(remaining))}
      </span>
    </div>
  );
}
