import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import VoiceBars from "@/components/interview/VoiceBars";
import InterviewTimer from "@/components/interview/InterviewTimer";
import ConnectionStatus from "@/components/interview/ConnectionStatus";
import TranscriptBubble from "@/components/interview/TranscriptBubble";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useAudioWebSocket } from "@/hooks/useAudioWebSocket";
import { sessionsApi } from "@/services/sessions";
import HardwareCheck from "@/components/HardwareCheck";
import { CheckCircle2, LinkIcon, Mic, MicOff, ServerCrash, TimerOff } from "lucide-react";
import { useT, useLanguage } from "@/i18n/LanguageProvider";
import { useCandidateChrome } from "@/components/layout/CandidateLayout";
import type { CandidateInfo, InterviewState, InterviewSpeaker, TranscriptTurn } from "@/types";

export default function InterviewPage() {
  const { token } = useParams<{ token: string }>();
  const t = useT();
  const { setInterviewLanguage } = useLanguage();
  const { setRoleTitle } = useCandidateChrome();
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [interviewState, setInterviewState] = useState<InterviewState>("idle");
  const [speaker, setSpeaker] = useState<InterviewSpeaker>(null);
  const [transcript, setTranscript] = useState<Pick<TranscriptTurn, "speaker" | "text">[]>([]);
  const [hardwareCheckDone, setHardwareCheckDone] = useState(false); // kept for green banner
  const [connectionLostLong, setConnectionLostLong] = useState(false);
  const [reconnectedPrompt, setReconnectedPrompt] = useState(false);
  const reconnectedPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionLostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [linkError, setLinkError] = useState<"expired" | "unknown" | "unreachable" | null>(null);
  const micMutedRef = useRef(false);

  // Fetch candidate info
  const loadCandidateInfo = useCallback(() => {
    if (!token) return;
    setLinkError(null);

    sessionsApi.getCandidateInfo(token)
      .then((res) => {
        setCandidateInfo(res.data);
        setSessionId(res.data.session_id);
        setRoleTitle(res.data.role_title ?? null);
        // Halaman mengikuti bahasa yang akan diucapkan AI, kecuali kandidat
        // sudah memilih sendiri — pilihannya selalu menang.
        setInterviewLanguage(res.data.language);
        if (res.data.session_status === "ended") setInterviewState("complete");
      })
      .catch((e) => {
        // Semua kegagalan dulu berakhir di layar "Interview Complete". Kandidat
        // yang belum memulai apa pun diberi tahu wawancaranya sudah selesai,
        // lalu menutup tab dan menunggu hasil yang tidak akan pernah ada —
        // sementara sesinya tetap tercatat "pending" dan tidak ada yang tahu.
        const status = e?.response?.status;
        if (status === 410) {
          setLinkError("expired");
        } else if (status === 404) {
          setLinkError("unknown");
        } else {
          setLinkError("unreachable");
        }
      });
  }, [token, setRoleTitle, setInterviewLanguage]);

  useEffect(() => {
    loadCandidateInfo();
  }, [loadCandidateInfo]);

  const muteRef = useRef<(() => void) | null>(null);
  const unmuteRef = useRef<(() => void) | null>(null);

  const handleStateChange = useCallback((state: InterviewState) => {
    setInterviewState(state);

    if (state === "draining_audio") {
      muteRef.current?.();
      audioCompleteCalledRef.current = false;
      // Safety timeout: call audio_complete after 10s even if drain never fires
      audioCompleteSafetyTimerRef.current = setTimeout(() => {
        callAudioComplete();
      }, 10_000);
      waitForDrain(() => callAudioComplete());
      return;
    }

    if (state === "reconnecting") {
      muteRef.current?.();
      connectionLostTimerRef.current = setTimeout(() => {
        setConnectionLostLong(true);
      }, 60_000);
    } else {
      if (connectionLostTimerRef.current) {
        clearTimeout(connectionLostTimerRef.current);
        connectionLostTimerRef.current = null;
      }
      setConnectionLostLong(false);
      if (state === "active" && !micMutedRef.current) unmuteRef.current?.();
    }
  }, []);

  const handleReconnected = useCallback(() => {
    if (reconnectedPromptTimerRef.current) clearTimeout(reconnectedPromptTimerRef.current);
    setReconnectedPrompt(true);
    reconnectedPromptTimerRef.current = setTimeout(() => setReconnectedPrompt(false), 10_000);
  }, []);

  const handleTranscript = useCallback((turn: Pick<TranscriptTurn, "speaker" | "text">) => {
    setTranscript((prev) => [...prev.slice(-9), turn]); // keep last 10
  }, []);

  const { playChunk, stop: stopPlayback, scheduleAfterPlayback, waitForDrain, cancelDrain } = useAudioPlayback();
  const audioCompleteCalledRef = useRef(false);
  const audioCompleteSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callAudioComplete = useCallback(async () => {
    if (audioCompleteCalledRef.current || !token) return;
    audioCompleteCalledRef.current = true;
    cancelDrain();
    if (audioCompleteSafetyTimerRef.current) {
      clearTimeout(audioCompleteSafetyTimerRef.current);
      audioCompleteSafetyTimerRef.current = null;
    }
    const attempt = async (delay: number) => {
      try {
        await sessionsApi.audioComplete(token);
      } catch {
        setTimeout(() => attempt(Math.min(delay * 2, 8000)), delay);
      }
    };
    attempt(2000);
  }, [token, cancelDrain]);

  const handleSpeakerChange = useCallback((newSpeaker: InterviewSpeaker) => {
    if (newSpeaker === "ai") {
      setSpeaker("ai");
      muteRef.current?.();
    } else if (newSpeaker === "candidate") {
      scheduleAfterPlayback(() => {
        setSpeaker("candidate");
        if (!micMutedRef.current) unmuteRef.current?.();
      });
    }
  }, [scheduleAfterPlayback]);

  const { connect, send, sendJson, disconnect, connectionState } = useAudioWebSocket({
    sessionId: sessionId ?? 0,
    token,
    onAudioChunk: playChunk,
    onTranscript: handleTranscript,
    onStateChange: handleStateChange,
    onSpeakerChange: handleSpeakerChange,
    onReconnected: handleReconnected,
  });

  const { start: startCapture, stop: stopCapture, mute, unmute } = useAudioCapture({
    onFrame: send,
  });

  muteRef.current = mute;
  unmuteRef.current = unmute;

  const toggleMic = useCallback(() => {
    if (micMutedRef.current) {
      micMutedRef.current = false;
      setMicMuted(false);
      unmute();
    } else {
      micMutedRef.current = true;
      setMicMuted(true);
      mute();
    }
  }, [mute, unmute]);

  const startInterview = useCallback(async () => {
    if (!sessionId) return;
    setInterviewState("connecting");
    connect();
    await startCapture();
    muteRef.current?.();
  }, [sessionId, connect, startCapture]);

  const endInterview = useCallback(async () => {
    setInterviewState("ending");
    if (reconnectedPromptTimerRef.current) clearTimeout(reconnectedPromptTimerRef.current);
    stopCapture();
    stopPlayback();
    sendJson({ type: "end_session" });
    disconnect();
    setInterviewState("complete");
  }, [stopCapture, stopPlayback, sendJson, disconnect]);

  const wsConnectionStatus =
    interviewState === "reconnecting"
      ? connectionLostLong ? "lost" : "reconnecting"
      : connectionState === "connected"
      ? "connected"
      : "reconnecting";

  // ── Link tidak bisa dipakai ─────────────────────────────────────────────
  if (linkError) {
    // Ikon dibedakan per penyebab, dan bukan emoji: emoji berubah bentuk di
    // tiap sistem operasi, dan ini satu-satunya elemen visual di layar paling
    // menegangkan dalam produk ini.
    const copy = {
      expired: {
        Icon: TimerOff,
        title: t.errExpiredTitle,
        body: t.errExpiredBody,
        retry: false,
      },
      unknown: {
        Icon: LinkIcon,
        title: t.errUnknownTitle,
        body: t.errUnknownBody,
        retry: false,
      },
      unreachable: {
        Icon: ServerCrash,
        title: t.errUnreachableTitle,
        body: t.errUnreachableBody,
        retry: true,
      },
    }[linkError];

    const { Icon } = copy;

    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-16 text-center">
        <Icon className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
        {copy.retry && (
          <div className="space-y-3">
            <Button variant="outline" onClick={loadCandidateInfo}>
              {t.retry}
            </Button>
            <p className="text-xs text-muted-foreground">{t.errHelpHint}</p>
          </div>
        )}
      </div>
    );
  }

  // ── State A: Pre-start ──────────────────────────────────────────────────
  if (interviewState === "idle") {
    return (
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">{candidateInfo?.role_title ?? "AI Interview"}</h1>
          {candidateInfo && (
            <p className="text-sm text-muted-foreground">
              {t.minutes(candidateInfo.time_limit_min)}
            </p>
          )}
        </div>

        {!hardwareCheckDone ? (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-1.5 text-muted-foreground">
              <p>• {t.briefVoice}</p>
              <p>• {t.briefFollowUp}</p>
              <p>• {t.briefDuration(candidateInfo?.time_limit_min ?? "—")}</p>
              <p>• {t.briefMic}</p>
            </div>
            <HardwareCheck onStart={() => { setHardwareCheckDone(true); startInterview(); }} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t.hardwareReady}</span>
            </div>
            <Button className="w-full" size="lg" onClick={startInterview}>
              <Mic className="h-4 w-4 mr-2" aria-hidden="true" />
              {t.startInterview}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── State F: Complete ───────────────────────────────────────────────────
  if (interviewState === "complete") {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <CheckCircle2
          className="mx-auto h-10 w-10 text-green-600 dark:text-green-500"
          aria-hidden="true"
        />
        <h2 className="text-xl font-semibold">{t.completeTitle}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t.completeBody}</p>
      </div>
    );
  }

  // ── States B/C/D/E: Active interview ────────────────────────────────────
  const aiSpeaking = speaker === "ai";
  const candidateSpeaking = speaker === "candidate";

  // Pertanyaan terakhir dari AI, ditahan di layar sampai ada pertanyaan baru.
  //
  // Sebelumnya ia ikut menggulung bersama transcript, jadi kandidat yang
  // menjawab panjang kehilangan pertanyaannya di tengah jalan lalu melantur.
  // Jawaban yang melantur dinilai rendah oleh model — dan penyebabnya UI,
  // bukan kompetensi orangnya.
  const currentQuestion = [...transcript].reverse().find((turn) => turn.speaker === "ai")?.text;

  return (
    <div className="max-w-xl mx-auto px-4 flex flex-col h-full">
      <div className="sticky top-12 z-10 flex items-center justify-between gap-3 border-b bg-background py-3">
        <span className="truncate text-sm font-medium">
          {candidateInfo?.role_title ?? "AI Interview"}
        </span>
        {candidateInfo && (
          <InterviewTimer
            totalSeconds={candidateInfo.time_limit_min * 60}
            running={interviewState === "active"}
            onExpired={endInterview}
          />
        )}
      </div>

      {interviewState === "reconnecting" && (
        connectionLostLong ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <span className="animate-pulse" aria-hidden="true">●</span>
            <span>{t.connLost}</span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <span className="animate-pulse" aria-hidden="true">●</span>
            <span>{t.connReconnecting}</span>
          </div>
        )
      )}

      {reconnectedPrompt && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <span>{t.connRestored}</span>
          <button
            type="button"
            className="shrink-0 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
            onClick={() => setReconnectedPrompt(false)}
          >
            <span className="sr-only">{t.dismiss}</span>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      {currentQuestion && interviewState !== "connecting" && (
        <div
          className="mt-3 rounded-lg border bg-card px-4 py-3"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t.currentQuestion}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{currentQuestion}</p>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
        {interviewState === "connecting" ? (
          <div className="animate-pulse text-sm text-muted-foreground">{t.connecting}</div>
        ) : interviewState === "draining_audio" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <VoiceBars active={true} label={t.aiSpeaking} variant="ai" />
            <p className="text-xs text-muted-foreground">{t.wrappingUp}</p>
          </div>
        ) : (
          <>
            <VoiceBars
              active={aiSpeaking}
              label={aiSpeaking ? t.aiSpeaking : t.listening}
              variant="ai"
            />

            {candidateSpeaking && (
              <VoiceBars active={true} label={t.youAreSpeaking} variant="candidate" />
            )}

            {transcript.length > 0 && (
              <div className="w-full space-y-2 overflow-y-auto max-h-[60vh]">
                {transcript.map((turn, i) => (
                  <TranscriptBubble key={i} speaker={turn.speaker} text={turn.text} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-4 border-t bg-background py-3">
        <ConnectionStatus state={wsConnectionStatus} />

        <div className="flex items-center gap-3">
          <Button
            variant={micMuted ? "destructive" : "outline"}
            size="sm"
            onClick={toggleMic}
          >
            {micMuted ? (
              <><MicOff className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> {t.micMuted}</>
            ) : (
              <><Mic className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> {t.micOn}</>
            )}
          </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm">{t.endInterview}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.endConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.endConfirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={endInterview}>{t.endInterview}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {import.meta.env.DEV && (
          <Button variant="outline" size="sm" className="text-xs opacity-50"
            onClick={() => sendJson({ type: "debug_force_reconnect" })}>
            ⚡ Force reconnect
          </Button>
        )}
        </div>
      </div>

    </div>
  );
}
