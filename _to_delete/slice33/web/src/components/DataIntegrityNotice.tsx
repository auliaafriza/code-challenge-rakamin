import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isContractError } from "@/services/schemas";

interface DataIntegrityNoticeProps {
  error: unknown;
  onRetry?: () => void;
  /** What the user was trying to look at, in their words. */
  subject?: string;
}

/**
 * What the user sees when a response does not match the contract.
 *
 * The failure this replaces was silent: a renamed field produced `undefined`,
 * React rendered `undefined` as nothing, and a blank cell in a hiring report
 * looked like a deliberate design choice. Refusing to render is the safer
 * outcome — a decision-maker who sees "this report is incomplete" will ask,
 * where one who sees a tidy blank cell will not.
 */
export default function DataIntegrityNotice({
  error,
  onRetry,
  subject = "data ini",
}: DataIntegrityNoticeProps) {
  const contract = isContractError(error) ? error : null;

  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-destructive">
            {contract ? `Data ${subject} tidak lengkap` : `Gagal memuat ${subject}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {contract
              ? "Server mengirim data dengan bentuk yang tidak sesuai kontrak, jadi laporan ini sengaja tidak ditampilkan daripada menampilkan angka yang menyesatkan. Laporkan ke tim teknis dengan detail di bawah."
              : "Terjadi kesalahan saat mengambil data. Ini kemungkinan sementara."}
          </p>
        </div>
      </div>

      {contract && contract.issues.length > 0 && (
        <ul className="ml-7 space-y-0.5 font-mono text-xs text-muted-foreground">
          {contract.issues.slice(0, 6).map((issue, i) => (
            <li key={i}>
              <span className="text-destructive">{issue.path}</span> — {issue.message}
            </li>
          ))}
          {contract.issues.length > 6 && (
            <li>…dan {contract.issues.length - 6} masalah lain</li>
          )}
        </ul>
      )}

      {onRetry && (
        <div className="ml-7">
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      )}
    </div>
  );
}
