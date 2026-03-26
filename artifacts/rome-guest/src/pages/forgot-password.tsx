import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { MessageSquare, Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Inserisci un indirizzo email valido.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Errore. Riprova.");
        return;
      }
      setSent(true);
    } catch {
      setError("Errore di connessione. Riprova tra qualche secondo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4">

      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8 group">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm shadow-blue-200">
          <MessageSquare className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-[15px] tracking-tight text-gray-800 group-hover:text-blue-600 transition-colors">
          RomeGuest AI
        </span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500" />

        <div className="p-8">
          {!sent ? (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Recupero Accesso</h1>
                <p className="text-gray-400 text-sm">
                  Inserisci l'email associata al tuo appartamento. Ti invieremo le istruzioni.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">
                    Indirizzo Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      placeholder="tua@email.com"
                      autoComplete="email"
                      className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Usa la stessa email che hai comunicato al supporto RomeGuest al momento dell'attivazione.
                  </p>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-60 mt-1"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    "Invia Istruzioni di Recupero"
                  )}
                </button>
              </form>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Email Inviata!</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-2">
                Abbiamo inviato le istruzioni di recupero all'indirizzo:
              </p>
              <p className="font-semibold text-blue-600 mb-4">{email}</p>
              <p className="text-gray-400 text-xs leading-relaxed">
                Controlla anche la cartella spam. Il link è monouso e valido per il recupero della tua password.
              </p>
            </motion.div>
          )}
        </div>

        <div className="border-t border-gray-100 px-8 py-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Torna al Login
          </Link>
        </div>
      </motion.div>

      <p className="text-center text-[11px] text-gray-300 mt-6">
        Powered by RomeGuest AI · Accesso sicuro
      </p>
    </div>
  );
}
