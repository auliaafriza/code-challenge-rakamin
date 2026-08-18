import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/ui/toast";
import { vacanciesApi } from "@/services/vacancies";
import { readErrorMessage } from "@/services/portfolios";
import { Plus, Briefcase, ChevronRight, Trash2, CalendarClock } from "lucide-react";
import { formatDate, isExpired } from "@/utils/constants";
import type { Vacancy } from "@/types";

export default function VacancyListPage() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    vacanciesApi
      .list()
      .then((res) => setVacancies(res.data.vacancies))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (vacancy: Vacancy) => {
    try {
      await vacanciesApi.delete(vacancy.id);
      setVacancies((prev) => prev.filter((v) => v.id !== vacancy.id));
      toast.success(`Lowongan “${vacancy.role_title}” dihapus.`);
    } catch (e) {
      toast.error(await readErrorMessage(e, "Gagal menghapus lowongan."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Vacancies</h1>
        <Button onClick={() => navigate("/vacancies/new")}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> New Vacancy
        </Button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          Gagal memuat daftar lowongan.{" "}
          <button type="button" onClick={load} className="underline underline-offset-2">
            Coba lagi
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : vacancies.length === 0 ? (
        <div className="rounded-lg border p-12 text-center text-sm text-muted-foreground">
          <p className="mb-3">Belum ada lowongan.</p>
          <Button variant="outline" onClick={() => navigate("/vacancies/new")}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Buat lowongan pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {vacancies.map((v) => (
            <Card key={v.id} className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => navigate(`/vacancies/${v.id}/edit`)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{v.role_title}</span>
                    {v.closes_at && (
                      <span
                        className={`mt-0.5 flex items-center gap-1 text-xs ${
                          isExpired(v.closes_at) ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        {isExpired(v.closes_at) ? "Ditutup" : "Tutup"} {formatDate(v.closes_at)}
                      </span>
                    )}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  {/* The delete endpoint existed all along; nothing in the UI
                      called it, so a mistyped vacancy stayed forever. */}
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Hapus lowongan ${v.role_title}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    }
                    title="Hapus lowongan ini?"
                    description={
                      <>
                        <strong>{v.role_title}</strong> akan dihapus permanen beserta daftar skill
                        yang dibutuhkannya. Laporan Fit/Gap yang sudah dibuat terhadap lowongan ini
                        tidak akan bisa dihitung ulang.
                      </>
                    }
                    onConfirm={() => handleDelete(v)}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
