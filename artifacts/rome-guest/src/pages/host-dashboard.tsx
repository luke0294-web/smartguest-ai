import { useState, useEffect, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Home, Loader2, Save, CheckCircle2, AlertCircle,
  Wifi, MessageSquare, Phone, FileText, Mic, MicOff, Camera,
  Sparkles, ArrowLeft,
} from "lucide-react";

const HOST_SESSION_KEY = "host_session";
const SESSION_TTL = 8 * 60 * 60 * 1000;

interface Session { email: string; password: string; ts: number }

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (Date.now() - s.ts > SESSION_TTL) { sessionStorage.removeItem(HOST_SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

const updateSchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  content: z.string().min(1, "Il regolamento è obbligatorio"),
  whatsappNumber: z.string().optional(),
});

type UpdateValues = z.infer<typeof updateSchema>;

interface PropertyData {
  id: number; slug: string; name: string; content: string; whatsappNumber: string | null;
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

  const [session, setSession] = useState<Session | null>(null);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiState, setAiState] = useState<AiState>({ type: "idle" });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: { name: "", content: "", whatsappNumber: "" },
  });

  useEffect(() => {
    if (!slug) return;
    const s = readSession();
    if (!s) {
      navigate(`/login`);
      return;
    }
    setSession(s);
    loadProperty(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => setSaveSuccess(false), 2500);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  const loadProperty = async (s: Session) => {
    setIsLoading(true);
    setLoadError("");
    try {
      const res = await fetch(
        `${baseUrl}/api/host/${slug}?email=${encodeURIComponent(s.email)}&hostPassword=${encodeURIComponent(s.password)}`
      );
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
      updateForm.reset({
        name: json.name,
        content: json.content,
        whatsappNumber: json.whatsappNumber ?? "",
      });
    } catch {
      setLoadError("Errore di connessione. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (data: UpdateValues) => {
    if (!session) return;
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      const res = await fetch(`${baseUrl}/api/host/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.email,
          hostPassword: session.password,
          ...data,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nel salvataggio.");
      
      // Safely update property and state
      if (json && typeof json === "object") {
        setProperty(json);
      }
      setSaveSuccess(true);
    } catch (err: any) {
      alert(err?.message ?? "Errore nel salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── AI TOOLS ───────────────────────────────────────────────────────────────

  const appendToContent = (text: string) => {
    try {
      const current = updateForm.getValues?.("content") ?? "";
      if (typeof current === "string") {
        const separator = current.trim() ? "\n\n" : "";
        updateForm.setValue?.("content", current + separator + text, { shouldValidate: true, shouldDirty: true });
      }
    } catch (err) {
      // Silent fail on mobile if form methods are unavailable
      console.error("Form append failed:", err);
    }
  };

  const startRecording = async () => {
    setAiState({ type: "recording" });
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await sendAudioForTranscription(new Blob(audioChunksRef.current, { type: mimeType }), mimeType);
      };
      recorder.start(250);
    } catch {
      setAiState({ type: "error", message: "Microfono non disponibile. Controlla i permessi del browser." });
      setTimeout(() => setAiState({ type: "idle" }), 4000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setAiState({ type: "transcribing" });
    }
  };

  const sendAudioForTranscription = async (blob: Blob, mimeType: string) => {
    setAiState({ type: "transcribing" });
    try {
      const formData = new FormData();
      const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
      formData.append("audio", blob, `recording.${ext}`);
      const res = await fetch(`${baseUrl}/api/ai/transcribe`, { method: "POST", body: formData });
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

  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAiState({ type: "scanning" });
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(`${baseUrl}/api/ai/vision`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nell'analisi dell'immagine.");
      appendToContent(json.text);
      setAiState({ type: "success", message: "Informazioni estratte e aggiunte!" });
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
          <h2 className="font-bold text-gray-900 text-xl mb-2">Accesso negato</h2>
          <p className="text-gray-400 text-sm mb-6">{loadError || "Struttura non trovata."}</p>
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
  const isAiBusy = aiState.type === "recording" || aiState.type === "transcribing" || aiState.type === "scanning";

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-gray-100 px-6 py-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-gray-900 text-[17px] leading-tight">{property?.name || "Caricamento..."}</h1>
              <p className="text-gray-400 text-[12px] font-mono mt-0.5">/guest/{slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/guest/${slug}`}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </Link>
            <Link
              href="/host/dashboard"
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
          </div>
        </motion.div>

        {/* Save success banner */}
        <AnimatePresence>
          {saveSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-700 px-5 py-3.5 rounded-2xl"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-sm">Salvato con successo!</p>
                <p className="text-xs opacity-80">Le modifiche sono ora visibili agli ospiti.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

          <form onSubmit={updateForm.handleSubmit(handleUpdate)} className="p-6 flex flex-col gap-5">

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
                <p className="text-xs text-red-500">{updateForm.formState.errors.name.message}</p>
              )}
            </div>

            {/* WhatsApp */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                Numero WhatsApp SOS
              </label>
              <input
                {...updateForm.register("whatsappNumber")}
                placeholder="es. 393901234567"
                className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <p className="text-[11px] text-gray-400">Solo numeri, senza spazi o + (es: 393901234567)</p>
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
                <p className="text-xs text-red-500">{updateForm.formState.errors.content.message}</p>
              )}

              {/* ── AI TOOLS ── */}
              <div className="mt-1 flex flex-col gap-2">
                <AnimatePresence mode="wait">
                  {aiState.type !== "idle" && (
                    <motion.div
                      key={aiState.type}
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.2 }}
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
                        <><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />Registrazione in corso... Premi stop quando finisci.</>
                      )}
                      {aiState.type === "transcribing" && (
                        <><Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />L'IA sta trascrivendo l'audio...</>
                      )}
                      {aiState.type === "scanning" && (
                        <><Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />L'IA sta analizzando l'immagine...</>
                      )}
                      {aiState.type === "success" && (
                        <><CheckCircle2 className="w-4 h-4 flex-shrink-0" />{aiState.message}</>
                      )}
                      {aiState.type === "error" && (
                        <><AlertCircle className="w-4 h-4 flex-shrink-0" />{aiState.message}</>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2">
                  {aiState.type === "recording" ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-all shadow-sm shadow-red-200 animate-pulse"
                    >
                      <MicOff className="w-4 h-4" />
                      ⏹ Stop Registrazione
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isAiBusy}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white transition-all shadow-sm shadow-rose-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiState.type === "transcribing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                      🎤 Registra Vocale
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isAiBusy}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white transition-all shadow-sm shadow-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiState.type === "scanning" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    📷 Scansiona Foto
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelected} />
                </div>

                <div className="flex gap-2 text-[10px] text-gray-400">
                  <span className="flex-1 text-center">Parla per dettare il regolamento — il testo apparirà nella textarea.</span>
                  <span className="flex-1 text-center">Scatta o carica la foto di un cartello WiFi o manuale — l'IA lo legge.</span>
                </div>

                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-300 pt-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  Powered by SmartGuest AI
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={(!updateForm.formState.isDirty && !saveSuccess) || isSaving}
              className={`flex items-center justify-center gap-2 font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg disabled:cursor-not-allowed ${
                isSaving
                  ? "bg-gray-400 text-white shadow-gray-100"
                  : saveSuccess
                  ? "bg-green-500 hover:bg-green-600 text-white shadow-green-100"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100 disabled:opacity-50"
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvataggio...
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Salvato! ✅
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
          Powered by SmartGuest AI
        </p>
      </div>
    </div>
  );
}
