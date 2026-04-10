import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { MessageSquare, KeyRound, Mail, Loader2, AlertCircle, HelpCircle } from "lucide-react";
import { apiUrl } from "@/lib/apiUrl";
import { persistHostSession } from "@/lib/hostSession";

export default function HostLogin() {
  const [, navigate] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setError("Compila tutti i campi.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/host-login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      const json = await res.json();

      if (res.ok) {
        if (!json.sessionToken || typeof json.sessionToken !== "string") {
          setError("Risposta dal server non valida. Contatta il supporto.");
          return;
        }
        persistHostSession(json.email, json.sessionToken);
        navigate("/host/dashboard");
        return;
      }

      setError(json.error ?? "Email o password non corretti.");
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
          HeyCico
        </span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
      >
        {/* Top accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500" />

        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Accesso Host</h1>
            <p className="text-gray-400 text-sm">
              Accedi per gestire tutte le tue strutture
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Email field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Email Host
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="la-tua@email.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700">
                Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="La tua password"
                  autoComplete="current-password"
                  className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>

            {/* Error */}
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-60 mt-1"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Accedi alla Dashboard"
              )}
            </button>

            {/* Forgot password link */}
            <div className="text-center pt-1">
              <Link
                href="/forgot-password"
                className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-blue-600 transition-colors font-medium"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Hai dimenticato la password?
              </Link>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-4 text-center">
          <p className="text-xs text-gray-400">
            Non hai ancora le credenziali?{" "}
            <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
              Contattaci
            </Link>
          </p>
        </div>
      </motion.div>

      <p className="text-center text-[11px] text-gray-300 mt-6">
        Powered by HeyCico · Accesso sicuro
      </p>
    </div>
  );
}
