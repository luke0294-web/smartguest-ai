import { useState } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Home, KeyRound, Loader2, Save, CheckCircle2, AlertCircle,
  Wifi, MessageSquare, Phone, FileText,
} from "lucide-react";

const loginSchema = z.object({
  hostPassword: z.string().min(1, "Inserisci la password"),
});

const updateSchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  content: z.string().min(1, "Il regolamento è obbligatorio"),
  whatsappNumber: z.string().optional(),
});

type LoginValues = z.infer<typeof loginSchema>;
type UpdateValues = z.infer<typeof updateSchema>;

interface PropertyData {
  id: number;
  slug: string;
  name: string;
  content: string;
  whatsappNumber: string | null;
}

export default function HostDashboard() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";

  const [hostPassword, setHostPassword] = useState("");
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const updateForm = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
  });

  const handleLogin = async (data: LoginValues) => {
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await fetch(
        `${baseUrl}/api/host/${slug}?hostPassword=${encodeURIComponent(data.hostPassword)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setLoginError(json.error ?? "Accesso negato.");
        return;
      }
      setHostPassword(data.hostPassword);
      setProperty(json);
      updateForm.reset({
        name: json.name,
        content: json.content,
        whatsappNumber: json.whatsappNumber ?? "",
      });
    } catch {
      setLoginError("Errore di connessione. Riprova.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleUpdate = async (data: UpdateValues) => {
    setSaveSuccess(false);
    try {
      const res = await fetch(`${baseUrl}/api/host/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostPassword, ...data }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore nel salvataggio.");
      setProperty(json);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ── LOGIN SCREEN ──
  if (!property) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
        >
          {/* Top bar */}
          <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500" />

          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Home className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Pannello Host</h1>
            <p className="text-gray-400 text-sm mb-1">
              Gestione appartamento
            </p>
            <p className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 text-[12px] font-semibold px-3 py-1 rounded-full mb-8 font-mono">
              /guest/{slug}
            </p>

            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="flex flex-col gap-4 text-left">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1.5 block">
                  Password Host
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    placeholder="Inserisci la tua password"
                    {...loginForm.register("hostPassword")}
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                {loginForm.formState.errors.hostPassword && (
                  <p className="text-xs text-red-500 mt-1">{loginForm.formState.errors.hostPassword.message}</p>
                )}
              </div>

              {loginError && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accedi al Pannello"}
              </button>
            </form>
          </div>

          <div className="border-t border-gray-100 px-8 py-4 flex items-center justify-between">
            <Link href={`/guest/${slug}`} className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Vedi chat ospiti
            </Link>
            <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
              Home
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── DASHBOARD ──
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
              <h1 className="font-extrabold text-gray-900 text-[17px] leading-tight">{property.name}</h1>
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
            <button
              onClick={() => { setProperty(null); setHostPassword(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              Esci
            </button>
          </div>
        </motion.div>

        {/* Success banner */}
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
              <p className="text-[11px] text-gray-400">
                Scrivi tutto ciò che vuoi che Marco sappia. Più è dettagliato, meglio risponde agli ospiti.
              </p>
            </div>

            <button
              type="submit"
              disabled={updateForm.formState.isSubmitting || saveSuccess}
              className={`w-full active:scale-[0.99] text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 ${
                saveSuccess
                  ? "bg-emerald-500 shadow-emerald-100"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
              }`}
            >
              {updateForm.formState.isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
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

        <p className="text-center text-[11px] text-gray-300 pb-4">
          Powered by RomeGuest AI · Solo tu puoi modificare i tuoi dati
        </p>
      </div>
    </div>
  );
}
