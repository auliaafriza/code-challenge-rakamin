// Kamus untuk seluruh halaman kandidat.
//
// Sengaja tanpa pustaka i18n. Dua bahasa, satu berkas, dan `Strings` dipakai
// sebagai tipe untuk kamus kedua — jadi kunci yang hilang atau salah ketik
// adalah error saat kompilasi, bukan teks kosong di layar kandidat.
export const LANGUAGES = ["id", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

const id = {
  languageLabel: "Bahasa",

  // ── Layar sebelum mulai ───────────────────────────────────────────────
  interviewFor: "Wawancara untuk",
  minutes: (n: number | string) => `${n} menit`,
  briefVoice: "Ini wawancara suara. Pastikan kamu di tempat yang tenang.",
  briefFollowUp: "AI akan bertanya lanjutan — tidak ada daftar pertanyaan tetap.",
  briefDuration: (n: number | string) => `Sesi berlangsung maksimal ${n} menit.`,
  briefMic: "Mikrofon aktif selama sesi. Kamu bisa mengakhiri kapan saja.",
  hardwareReady: "Pemeriksaan perangkat lolos. Kamu siap mulai.",
  startInterview: "Mulai Wawancara",

  // ── Pemeriksaan perangkat ─────────────────────────────────────────────
  checkOsBrowser: "Sistem & browser",
  checkInternet: "Internet",
  checkCamera: "Kamera",
  checkMicrophone: "Mikrofon",
  checkAudio: "Suara keluar",
  stateChecking: "Memeriksa",
  statePassed: "Lolos",
  stateFailed: "Gagal",
  stateWaiting: "Menunggu",
  cameraInactive: "Kamera tidak aktif",
  retry: "Coba lagi",

  // ── Sesi berjalan ─────────────────────────────────────────────────────
  connecting: "Menyambungkan...",
  aiSpeaking: "AI sedang bicara",
  listening: "Mendengarkan...",
  youAreSpeaking: "Kamu sedang bicara",
  wrappingUp: "Menutup sesi...",
  currentQuestion: "Pertanyaan sekarang",
  timeElapsed: "Waktu berjalan",
  timeLeftShort: (t: string) => `sisa ${t}`,
  micOn: "Mikrofon aktif",
  micMuted: "Mikrofon mati",
  endInterview: "Akhiri wawancara",
  endConfirmTitle: "Akhiri wawancara?",
  endConfirmBody:
    "Wawancara akan ditutup dan tidak bisa dilanjutkan. Jawaban yang sudah terekam tetap tersimpan.",
  cancel: "Batal",

  // ── Koneksi ───────────────────────────────────────────────────────────
  connReconnecting: "Menyambung ulang sebentar — mohon tunggu.",
  connLost:
    "Koneksi belum pulih. Tetap di halaman ini; kalau terus begini, hubungi perekrut yang mengundangmu.",
  connRestored: 'Tersambung lagi — ucapkan "halo" atau lanjutkan jawabanmu.',
  connStatusConnected: "Tersambung",
  connStatusReconnecting: "Menyambung ulang",
  dismiss: "Tutup",

  // ── Selesai ───────────────────────────────────────────────────────────
  completeTitle: "Wawancara selesai",
  completeBody:
    "Terima kasih. Jawabanmu sudah terekam. Tim rekrutmen akan meninjau hasilnya dan menghubungimu.",

  // ── Link bermasalah ───────────────────────────────────────────────────
  errExpiredTitle: "Link wawancara ini sudah kedaluwarsa",
  errExpiredBody:
    "Tim rekrutmen sudah menutup asesmen ini. Balas email undangan yang kamu terima untuk meminta link baru — wawancaramu belum terpakai.",
  errUnknownTitle: "Wawancara ini tidak ditemukan",
  errUnknownBody:
    "Link-nya mungkin tersalin sebagian. Buka lagi email undanganmu dan klik linknya langsung, jangan disalin manual.",
  errUnreachableTitle: "Wawancara belum bisa dimuat",
  errUnreachableBody:
    "Ini masalah di sisi kami, bukan di link-mu. Wawancaramu belum dimulai, jadi tidak ada yang hilang.",
  errHelpHint: "Kalau masih gagal, balas email undangan yang kamu terima.",
};

// Tipe kamus. `en` harus punya setiap kunci di atas, dengan bentuk yang sama.
// Nilai sengaja dilebarkan ke `string`: tanpa ini, tiap kalimat bahasa Indonesia
// menjadi literal type dan tidak ada terjemahan yang bisa memenuhinya.
export type Strings = {
  [K in keyof typeof id]: (typeof id)[K] extends (...args: infer A) => string
    ? (...args: A) => string
    : string;
};

const en: Strings = {
  languageLabel: "Language",

  interviewFor: "Interview for",
  minutes: (n) => `${n} minutes`,
  briefVoice: "This is a voice interview. Make sure you are somewhere quiet.",
  briefFollowUp: "The AI asks follow-up questions — there is no fixed script.",
  briefDuration: (n) => `The session lasts up to ${n} minutes.`,
  briefMic: "Your microphone stays on. You can end the session at any time.",
  hardwareReady: "Device checks passed. You are ready to start.",
  startInterview: "Start interview",

  checkOsBrowser: "System & browser",
  checkInternet: "Internet",
  checkCamera: "Camera",
  checkMicrophone: "Microphone",
  checkAudio: "Audio output",
  stateChecking: "Checking",
  statePassed: "Passed",
  stateFailed: "Failed",
  stateWaiting: "Waiting",
  cameraInactive: "Camera not active",
  retry: "Try again",

  connecting: "Connecting...",
  aiSpeaking: "AI is speaking",
  listening: "Listening...",
  youAreSpeaking: "You are speaking",
  wrappingUp: "Wrapping up...",
  currentQuestion: "Current question",
  timeElapsed: "Time elapsed",
  timeLeftShort: (t) => `${t} left`,
  micOn: "Mic on",
  micMuted: "Mic muted",
  endInterview: "End interview",
  endConfirmTitle: "End the interview?",
  endConfirmBody:
    "The interview will close and cannot be resumed. Answers already recorded are kept.",
  cancel: "Cancel",

  connReconnecting: "Reconnecting briefly — please wait.",
  connLost:
    "The connection has not recovered. Stay on this page; if it continues, contact the recruiter who invited you.",
  connRestored: 'Reconnected — say "hello" or carry on with your answer.',
  connStatusConnected: "Connected",
  connStatusReconnecting: "Reconnecting",
  dismiss: "Dismiss",

  completeTitle: "Interview complete",
  completeBody:
    "Thank you. Your answers have been recorded. The hiring team will review them and follow up with you.",

  errExpiredTitle: "This interview link has expired",
  errExpiredBody:
    "The hiring team has closed this assessment. Reply to the invitation email you received to ask for a new link — your interview has not been used.",
  errUnknownTitle: "We could not find this interview",
  errUnknownBody:
    "The link may have been copied incompletely. Open your invitation email again and click the link directly rather than copying it by hand.",
  errUnreachableTitle: "We could not load your interview",
  errUnreachableBody:
    "This is a problem on our side, not with your link. Your interview has not started, so nothing has been lost.",
  errHelpHint: "If it keeps failing, reply to the invitation email you received.",
};

export const DICTIONARIES: Record<Language, Strings> = { id, en };

/** Bahasa yang didukung dari sebuah kode, atau null. Menerima "id-ID", "EN". */
export function normalizeLanguage(value?: string | null): Language | null {
  if (!value) return null;
  const base = value.toLowerCase().split("-")[0];
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : null;
}
