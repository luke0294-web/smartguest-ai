import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Home,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
  Wifi,
  MessageSquare,
  Phone,
  FileText,
  Mic,
  MicOff,
  Camera,
  Sparkles,
  ArrowLeft,
  BookOpen,
} from "lucide-react";
import { apiUrl, getAiSecurityHeaders } from "@/lib/apiUrl";
import { getHostSession, type HostSession } from "@/lib/hostSession";

const DEFAULT_MANUAL_TEMPLATE = `🏠 MANUALE DI BENVENUTO - [NOME APPARTAMENTO]
Benvenuti! Ecco tutte le informazioni essenziali per il vostro soggiorno.

📶 WI-FI
Rete: [Inserisci Nome Rete]
Password: [Inserisci Password]

🔑 CHECK-IN E CHECK-OUT
Check-out: Tassativamente entro le ore [10:00].
Istruzioni: Al check-out, chiudere bene le finestre, spegnere luci/clima e lasciare le chiavi [sul tavolo / nella lockbox].

🚗 PARCHEGGIO E ZTL
ZTL: L'appartamento si trova [fuori / dentro] la ZTL.
Parcheggio: Consigliamo di parcheggiare in [Nome Via / Parcheggio a pagamento], a [X] minuti a piedi.

🗑️ RIFIUTI E RACCOLTA DIFFERENZIATA
Non lasciare rifiuti in casa al check-out. I bidoni si trovano [uscendo a destra / nel cortile].
- Plastica/Lattine: [Sacco Giallo]
- Carta: [Bidone Bianco]
- Umido: [Bidoncino Marrone]
- Vetro: [Campana in strada]

❄️ CLIMA E RISCALDAMENTO
Temperatura consigliata: 20°C in inverno, 24°C in estate. Vi chiediamo di spegnere i condizionatori quando uscite di casa.

🚭 REGOLE DELLA CASA E VICINATO
- Fumo: Rigorosamente VIETATO in casa. Consentito solo [sul balcone con posacenere].
- Ospiti: Accesso vietato a persone non registrate.
- Silenzio: Rispetto totale del vicinato dalle 22:00 alle 08:00 e dalle 14:00 alle 16:00.

🍳 CUCINA
Vi preghiamo di lasciare le stoviglie pulite (o lavastoviglie avviata) e svuotare il frigo prima della partenza.

🧴 DOVE TROVO...
- Phon per capelli: [Nel cassetto del bagno]
- Ferro da stiro: [Nell'armadio della camera]
- Lavatrice: [In bagno, detersivo sotto il lavandino]`;

const updateSchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  content: z.string().min(1, "Il regolamento è obbligatorio"),
  whatsappNumber: z.string().optional(),
  referralLinks: z.string().max(2000, "Massimo 2000 caratteri").optional(),
});

type UpdateValues = z.infer<typeof updateSchema>;

interface PropertyData {
  id: number;
  slug: string;
  name: string;
  content: string;
  whatsappNumber: string | null;
  pendingQuestionsCount: number;
  referralLinks?: string | null;
}

type AiState =
  | { type: "idle" }
  | { type: "recording" }
  | { type: "transcribing" }
  | { type: "scanning" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function HostDashboard() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";

  const [session, setSession] = useState<HostSession | null>(null);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [aiState, setAiState] = useState<AiState>({ type: "idle" });
  const [pendingCount, setPendingCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema as any),
    defaultValues: { name: "", content: "", whatsappNumber: "", referralLinks: "" },
  });

  useEffect(() => {
    if (!slug) return;
    const s = getHostSession();
    if (!s) {
      navigate(`/login`);
      return;
    }
    setSession(s);
    loadProperty(s);
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const loadProperty = async (s: HostSession) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const res = await fetch(apiUrl(`/api/host/${slug}`), {
        headers: { Authorization: `Bearer ${s.sessionToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setLoadError(json.error ?? "Accesso non autorizzato.");
        } else {
          setLoadError(json.error ?? "Struttura non trovata.");
        }
        return;
      }
      setProperty(json);
      setPendingCount(Number(json.pendingQuestionsCount ?? 0));

      const initialContent =
        json.content && json.content.trim() !== ""
          ? json.content
          : DEFAULT_MANUAL_TEMPLATE;

      updateForm.reset({
        name: json.name,
        content: initialContent,
        whatsappNumber: json.whatsappNumber ?? "",
        referralLinks: json.referralLinks ?? "",
      });
    } catch {
      setLoadError("Errore di connessione. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  /** Keep badge in sync when DB updates (guests chatting) without full page reload. */
  useEffect(() => {
    if (!slug || !session) return;

    const refreshPendingCount = async () => {
      try {
        const res = await fetch(apiUrl(`/api/host/${slug}`), {
          headers: { Authorization: `Bearer ${session.sessionToken}` },
        });
        if (res.status === 401 || res.status === 403) return;
        if (!res.ok) return;
        const json = await res.json();
        const n = Number(json.pendingQuestionsCount ?? 0);
        setPendingCount(n);
        setProperty((prev) => (prev ? { ...prev, pendingQuestionsCount: n } : prev));
      } catch {
        /* network errors — keep last known count */
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshPendingCount();
    }, 15_000);

    const onWindowFocus = () => {
      void refreshPendingCount();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshPendingCount();
    };

    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [slug, session]);

  const handleOpenDiario = async () => {
    if (!session) {
      navigate("/login");
      return;
    }
    try {
      await fetch(apiUrl(`/api/host/${slug}/reset-pending-questions`), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.sessionToken}` },
      });
      setPendingCount(0);
    } catch {
      // If reset fails, still let host open Diario.
    } finally {
      navigate(`/diario/${slug}`);
    }
  };

  const handleUpdate = async (data: UpdateValues) => {
    if (!session) return;
    setIsSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/host/${slug}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.sessionToken}`,
        },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nel salvataggio.");
      updateForm.reset(data);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      setIsSaved(true);
      savedTimerRef.current = setTimeout(() => setIsSaved(false), 3000);
    } catch (err: any) {
      alert(err?.message ?? "Errore nel salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };


  const appendToContent = (text: string) => {
    // NON usare shouldValidate: true — farebbe girare Zod ad ogni append e bloccherebbe l'UI
    const current = updateForm.getValues("content") ?? "";
    const separator = current.trim() ? "\n\n" : "";
    updateForm.setValue("content", current + separator + text, {
      shouldDirty: true,
    });
  };

  const startRecording = async () => {
    setAiState({ type: "recording" });
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await sendAudioForTranscription(
          new Blob(audioChunksRef.current, { type: mimeType }),
          mimeType,
        );
      };
      recorder.start(250);
    } catch {
      setAiState({
        type: "error",
        message: "Microfono non disponibile. Controlla i permessi del browser.",
      });
      setTimeout(() => setAiState({ type: "idle" }), 4000);
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setAiState({ type: "transcribing" });
    }
  };

  const sendAudioForTranscription = async (blob: Blob, mimeType: string) => {
    setAiState({ type: "transcribing" });
    try {
      const formData = new FormData();
      const ext = mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("mp4")
          ? "mp4"
          : "webm";
      formData.append("audio", blob, `recording.${ext}`);
      const res = await fetch(apiUrl("/api/ai/transcribe"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.sessionToken ?? ""}`,
          ...getAiSecurityHeaders(),
        },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nella trascrizione.");
      appendToContent(json.text);
      setAiState({ type: "success", message: "Testo vocale aggiunto!" });
    } catch (err: any) {
      setAiState({ type: "error", message: err.message });
    } finally {
      setTimeout(() => setAiState({ type: "idle" }), 3500);
    }
  };

  const handleImageSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAiState({ type: "scanning" });
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(apiUrl("/api/ai/vision"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.sessionToken ?? ""}`,
          ...getAiSecurityHeaders(),
        },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error ?? "Errore nell'analisi dell'immagine.");
      appendToContent(json.text);
      setAiState({
        type: "success",
        message: "Informazioni estratte e aggiunte!",
      });
    } catch (err: any) {
      setAiState({ type: "error", message: err.message });
    } finally {
      setTimeout(() => setAiState({ type: "idle" }), 3500);
    }
  };

  // ── LOADING SCREEN ──
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-blue-600">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="font-medium text-gray-500">Caricamento struttura...</p>
        </div>
      </div>
    );
  }

  // ── ERROR SCREEN ──
  if (loadError || !property) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8 text-center"
        >
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="font-bold text-gray-900 text-xl mb-2">
            Accesso negato
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {loadError || "Struttura non trovata."}
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/host/dashboard"
              className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl text-sm hover:bg-blue-700 transition-colors"
            >
              ← Dashboard
            </Link>
            <Link
              href="/login"
              className="px-5 py-2.5 bg-gray-100 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-200 transition-colors"
            >
              Accedi
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── DASHBOARD ──
  const isAiBusy =
    aiState.type === "recording" ||
    aiState.type === "transcribing" ||
    aiState.type === "scanning";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4 overflow-x-hidden">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-extrabold text-gray-900 text-sm sm:text-base leading-tight truncate">
                {property?.name || "Caricamento..."}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Diario di Bordo */}
            <button
              type="button"
              onClick={handleOpenDiario}
              className={`relative flex items-center gap-1 text-xs sm:text-sm font-bold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                pendingCount > 0
                  ? "text-red-700 bg-red-50 hover:bg-red-100 border border-red-200"
                  : "text-blue-700 bg-blue-50 hover:bg-blue-100"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="hidden sm:inline">Diario</span>
              {pendingCount > 0 && (
                <span
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-xs font-bold leading-none shadow-sm"
                  aria-hidden
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>
            <Link
              href={`/guest/${slug}`}
              className="text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors shadow-sm shadow-blue-200"
            >
              Chat
            </Link>
            <Link
              href="/host/dashboard"
              className="text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>
        </motion.div>

        {/* Edit form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="font-bold text-gray-900">Modifica i tuoi dati</h2>
          </div>

          <form
            onSubmit={updateForm.handleSubmit(handleUpdate)}
            className="p-6 flex flex-col gap-5"
          >
            {/* Nome struttura */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Home className="w-3.5 h-3.5 text-gray-400" />
                Nome della Struttura
              </label>
              <input
                {...updateForm.register("name")}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {updateForm.formState.errors.name && (
                <p className="text-xs text-red-500">
                  {updateForm.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* WhatsApp */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                Numero WhatsApp per gli ospiti
              </label>
              <input
                {...updateForm.register("whatsappNumber")}
                placeholder="es. 393901234567"
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <p className="text-[11px] text-gray-400">
                Solo numeri, senza spazi o + (es: 393901234567)
              </p>
            </div>

            {/* Knowledge base */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wifi className="w-3.5 h-3.5 text-blue-500" />
                  Regolamento e Informazioni
                </span>
                <span className="text-[10px] font-normal text-gray-400 uppercase tracking-wider">
                  Visibile a Marco AI
                </span>
              </label>
              <textarea
                {...updateForm.register("content")}
                rows={12}
                placeholder={`Inserisci tutte le informazioni utili per i tuoi ospiti:\n\nWiFi: Nome rete: ..., Password: ...\nCheck-in: dalle ore ...\nCheck-out: entro le ore ...\nRaccolta rifiuti: ...\nParcheggio: ...\nRistoranti consigliati: ...`}
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all font-sans"
              />
              {updateForm.formState.errors.content && (
                <p className="text-xs text-red-500">
                  {updateForm.formState.errors.content.message}
                </p>
              )}

              <div className="flex flex-col gap-1.5 pt-2 border-t border-gray-100">
                <label className="text-sm font-semibold text-gray-700">
                  🔗 Link Referral &amp; Partnership
                </label>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Inserisci i tuoi link affiliati (es. noleggio auto, tour, ristoranti convenzionati). Cico li
                  consiglierà quando gli ospiti chiedono suggerimenti. Formato consigliato:
                  <br />
                  <span className="font-mono text-[10px] text-gray-400">
                    - Auto: https://...
                    <br />- Tour Colosseo: https://...
                  </span>
                </p>
                <textarea
                  {...updateForm.register("referralLinks")}
                  rows={4}
                  maxLength={2000}
                  placeholder="- Noleggio auto: https://...\n- Tour: https://..."
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all font-sans"
                />
                {updateForm.formState.errors.referralLinks && (
                  <p className="text-xs text-red-500">
                    {updateForm.formState.errors.referralLinks.message}
                  </p>
                )}
              </div>

              {/* ── AI TOOLS ── */}
              <div className="mt-1 flex flex-col gap-2">
                {aiState.type !== "idle" && (
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border ${
                      aiState.type === "recording"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : aiState.type === "transcribing"
                          ? "bg-blue-50 border-blue-200 text-blue-700"
                          : aiState.type === "scanning"
                            ? "bg-violet-50 border-violet-200 text-violet-700"
                            : aiState.type === "success"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-red-50 border-red-200 text-red-700"
                    }`}
                  >
                    {aiState.type === "recording" && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        Registrazione in corso... Premi stop quando finisci.
                      </>
                    )}
                    {aiState.type === "transcribing" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        L'IA sta trascrivendo l'audio...
                      </>
                    )}
                    {aiState.type === "scanning" && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                        L'IA sta analizzando l'immagine...
                      </>
                    )}
                    {aiState.type === "success" && (
                      <>
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        {aiState.message}
                      </>
                    )}
                    {aiState.type === "error" && (
                      <>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {aiState.message}
                      </>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {aiState.type === "recording" ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-all shadow-sm shadow-red-200 animate-pulse"
                    >
                      <MicOff className="w-4 h-4" />⏹ Stop Registrazione
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isAiBusy}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white transition-all shadow-sm shadow-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiState.type === "transcribing" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                      🎤 Registra Vocale
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isAiBusy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white transition-all shadow-sm shadow-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiState.type === "scanning" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    📷 Scansiona Foto
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelected}
                  />
                </div>

                <div className="flex gap-2 text-[10px] text-gray-400">
                  <span className="flex-1 text-center">
                    Parla per dettare il regolamento — il testo apparirà nella
                    textarea.
                  </span>
                  <span className="flex-1 text-center">
                    Scatta o carica la foto di un cartello WiFi o manuale — l'IA
                    lo legge.
                  </span>
                </div>

                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-300 pt-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  Powered by HeyCico
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={(!updateForm.formState.isDirty && !isSaved) || isSaving}
              className={`flex items-center justify-center gap-2 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg disabled:cursor-not-allowed ${
                isSaving
                  ? "bg-gray-400 text-white shadow-gray-100"
                  : isSaved
                    ? "bg-emerald-500 text-white shadow-emerald-100 cursor-default"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100 disabled:opacity-50"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvataggio...
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Salvato!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salva Modifiche
                </>
              )}
            </button>
          </form>
        </motion.div>

        <p className="text-center text-[11px] text-gray-300 uppercase tracking-widest">
          Powered by HeyCico
        </p>
      </div>
    </div>
  );
}
