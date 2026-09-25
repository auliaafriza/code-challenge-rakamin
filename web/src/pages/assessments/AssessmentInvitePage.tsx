import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { RequiredMark } from "@/components/FormField";
import { useToast } from "@/components/ui/toast";
import { assessmentsApi } from "@/services/assessments";
import { sessionsApi } from "@/services/sessions";
import { readErrorMessage } from "@/services/portfolios";
import {
  LEVEL_LABELS,
  formatLanguage,
  formatDate,
  isExpired,
} from "@/utils/constants";
import {
  Copy,
  Check,
  Eye,
  Pencil,
  Clock,
  Plus,
  UserRound,
  Languages,
  CalendarClock,
  Trash2,
} from "lucide-react";
import type { Assessment, Session } from "@/types";

function SessionRow({
  session,
  index,
  assessmentId,
  onCopy,
  copiedId,
  onRename,
  onDelete,
}: {
  session: Session;
  index: number;
  assessmentId: string;
  onCopy: (id: number) => void;
  copiedId: number | null;
  onRename: (session: Session) => void;
  onDelete: (session: Session) => Promise<void>;
}) {
  const navigate = useNavigate();
  const isLive = session.status === "active";
  const isEnded = session.status === "ended";
  const isPending = session.status === "pending";
  const displayName = session.candidate_name || `Kandidat ${index} (tanpa nama)`;

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {index}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <button
              type="button"
              onClick={() => onRename(session)}
              aria-label={`Ubah nama kandidat ${displayName}`}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          {session.started_at && (
            <div className="text-xs text-muted-foreground">
              {new Date(session.started_at).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {isPending && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            Awaiting candidate
          </span>
        )}
        {isLive && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            Live
          </span>
        )}
        {isEnded && session.end_reason === "error" && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
            Failed
          </span>
        )}
        {isEnded && session.end_reason !== "error" && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
            Completed
          </span>
        )}

        <div className="flex items-center gap-1.5">
          {isPending && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onCopy(session.id)}>
              {copiedId === session.id ? (
                <>
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" aria-hidden="true" /> Copy link
                </>
              )}
            </Button>
          )}
          {isLive && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => navigate(`/assessments/${assessmentId}/sessions/${session.id}/monitor`)}
            >
              <Eye className="mr-1 h-3 w-3" aria-hidden="true" /> Monitor
            </Button>
          )}
          {isEnded && session.end_reason !== "error" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => navigate(`/assessments/${assessmentId}/sessions/${session.id}/portfolio`)}
            >
              Results
            </Button>
          )}
          {isPending && (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Hapus undangan untuk ${displayName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              }
              title="Hapus undangan ini?"
              description={
                <>
                  Link undangan untuk <strong>{displayName}</strong> akan berhenti berlaku. Undangan
                  yang sudah dipakai kandidat tidak bisa dihapus.
                </>
              }
              onConfirm={() => onDelete(session)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AssessmentInvitePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [newSession, setNewSession] = useState<Session | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [newSessionCopied, setNewSessionCopied] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [candidateNameInput, setCandidateNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  /** Non-null while renaming an existing session. */
  const [renaming, setRenaming] = useState<Session | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  const loadSessions = useCallback(async () => {
    const res = await assessmentsApi.getSessions(Number(id));
    setSessions(res.data.sessions);
  }, [id]);

  useEffect(() => {
    Promise.all([assessmentsApi.get(Number(id)), assessmentsApi.getSessions(Number(id))])
      .then(([aRes, sRes]) => {
        setAssessment(aRes.data.assessment);
        setSessions(sRes.data.sessions);
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const hasActive = sessions.some((s) => s.status !== "ended");
    if (!hasActive) return;
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [sessions, loadSessions]);

  const openInviteDialog = () => {
    setCandidateNameInput("");
    setNameError(null);
    setShowInviteDialog(true);
  };

  const handleInviteCandidate = async () => {
    const name = candidateNameInput.trim();
    if (name === "") {
      setNameError("Nama kandidat wajib diisi supaya sesi ini bisa ditelusuri nanti.");
      return;
    }
    setNameError(null);
    setCreatingSession(true);
    setNewSession(null);
    try {
      const res = await assessmentsApi.createSession(Number(id), name);
      const created = res.data.session;
      setShowInviteDialog(false);
      setNewSession(created);
      setSessions((prev) => [created, ...prev]);
      toast.success(`Link undangan untuk ${name} dibuat.`);
    } catch (e) {
      const message = await readErrorMessage(e, "Gagal membuat link undangan.");
      setNameError(message);
      toast.error(message);
    } finally {
      setCreatingSession(false);
    }
  };

  const openRename = (session: Session) => {
    setRenaming(session);
    setRenameInput(session.candidate_name ?? "");
  };

  const submitRename = async () => {
    if (!renaming) return;
    const name = renameInput.trim();
    if (name === "") return;
    setSavingName(true);
    try {
      const res = await sessionsApi.updateCandidate(renaming.id, name);
      const updated = res.data.session;
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
      setRenaming(null);
      toast.success("Nama kandidat diperbarui.");
    } catch (e) {
      toast.error(await readErrorMessage(e, "Gagal memperbarui nama kandidat."));
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteSession = async (session: Session) => {
    try {
      await sessionsApi.deleteSession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      if (newSession?.id === session.id) setNewSession(null);
      toast.success("Undangan dihapus.");
    } catch (e) {
      toast.error(await readErrorMessage(e, "Gagal menghapus undangan."));
    }
  };

  const copyLink = (session: Session, sid: number) => {
    navigator.clipboard.writeText(session.invite_url);
    setCopiedId(sid);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyNewSessionLink = () => {
    if (!newSession?.invite_url) return;
    navigator.clipboard.writeText(newSession.invite_url);
    setNewSessionCopied(true);
    setTimeout(() => setNewSessionCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader backTo="/assessments" crumbs={[{ label: "Assessments", to: "/assessments" }, { label: "Detail" }]} />
        <div role="alert" className="rounded-lg border border-destructive/40 p-6 text-sm text-destructive">
          Gagal memuat assessment ini.
        </div>
      </div>
    );
  }

  const expired = isExpired(assessment?.expires_at);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        backTo="/assessments"
        crumbs={[{ label: "Assessments", to: "/assessments" }, { label: assessment?.name ?? "Detail" }]}
        title={assessment?.name ?? "—"}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/assessments/${id}/edit`)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Edit
            </Button>
            <Button size="sm" onClick={openInviteDialog} disabled={creatingSession || expired}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {creatingSession ? "Creating..." : "Invite Candidate"}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {assessment?.time_limit_min} min · {assessment?.skills?.length ?? 0} skills
        </span>
        <span className="flex items-center gap-1">
          <Languages className="h-3 w-3" aria-hidden="true" />
          Bahasa wawancara: <strong className="font-medium text-foreground">{formatLanguage(assessment?.language)}</strong>
        </span>
        {assessment?.expires_at && (
          <span className={`flex items-center gap-1 ${expired ? "text-destructive" : ""}`}>
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
            {expired ? "Berakhir" : "Berlaku sampai"} {formatDate(assessment.expires_at)}
          </span>
        )}
      </div>

      {expired && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Assessment ini sudah lewat tanggal berlakunya. Link undangan baru tidak bisa dibuat dan
          link lama akan ditolak. Ubah tanggalnya di halaman Edit bila proses masih berjalan.
        </div>
      )}

      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite Candidate</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="candidate-name">
              Nama kandidat <RequiredMark />
            </Label>
            <Input
              id="candidate-name"
              placeholder="mis. Budi Santoso"
              value={candidateNameInput}
              onChange={(e) => {
                setCandidateNameInput(e.target.value);
                if (nameError) setNameError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleInviteCandidate()}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "candidate-name-error" : undefined}
              className={nameError ? "border-destructive focus-visible:ring-destructive" : undefined}
              autoFocus
            />
            {nameError ? (
              <p id="candidate-name-error" role="alert" className="text-xs text-destructive">
                {nameError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Dipakai untuk mengenali sesi ini dan laporan hasilnya. Bisa diubah setelahnya.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteCandidate} disabled={creatingSession}>
              Create Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ubah nama kandidat</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-candidate">
              Nama kandidat <RequiredMark />
            </Label>
            <Input
              id="rename-candidate"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Batal
            </Button>
            <Button onClick={submitRename} disabled={savingName || renameInput.trim() === ""}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {newSession && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-2 pt-4">
            <p className="text-sm font-medium">
              Link untuk <span className="font-semibold">{newSession.candidate_name}</span> siap —
              bagikan ke kandidat:
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
              <span className="flex-1 truncate font-mono text-sm text-muted-foreground">
                {newSession.invite_url}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={copyNewSessionLink} className="w-full">
              {newSessionCopied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Copy link
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">
          Candidates
          {sessions.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">({sessions.length})</span>
          )}
        </h2>

        {sessions.length === 0 ? (
          <div className="space-y-3 rounded-lg border p-10 text-center">
            <UserRound className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Belum ada kandidat</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Klik “Invite Candidate” untuk membuat link wawancara.
              </p>
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {sessions.map((session, i) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  index={sessions.length - i}
                  assessmentId={id!}
                  onCopy={(sid) => {
                    const s = sessions.find((x) => x.id === sid);
                    if (s) copyLink(s, sid);
                  }}
                  copiedId={copiedId}
                  onRename={openRename}
                  onDelete={handleDeleteSession}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {assessment?.skills && assessment.skills.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Skills assessed</h2>
            <ul className="space-y-1">
              {assessment.skills.map((s) => (
                <li
                  key={s.id ?? s.skill_label}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span aria-hidden="true">•</span>
                  <span>{s.skill_label}</span>
                  <span className="text-xs">(expected {LEVEL_LABELS[s.expected_level as 1 | 2 | 3 | 4 | 5]})</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
