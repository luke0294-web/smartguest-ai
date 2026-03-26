import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { MessageSquare, KeyRound, Eye, EyeOff, ArrowLeft, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

export default function ResetPassword() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const [propertyName, setPropertyName] = useState("");
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [tokenError, setTokenError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successSlug, setSuccessSlug] = useState("");

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setTokenError("Token non presente nell'URL.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${baseUrl}/api/auth/reset-password/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok && data.valid) {
          setTokenValid(true);
          setPropertyName(data.propertyName ?? "");
        } else {
          setTokenValid(false);
          setTokenError(data.error ?? "Token non valido o già utilizzato.");
        }
      } catch {
        setTokenValid(false);
        setTokenError("Errore di connessione durante la verifica del token.");
      }
    })();
  }, [token, baseUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.trim().length < 4) {
      setError("La password deve essere di almeno 4 caratteri.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le due password non coincidono.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/auth/reset-password/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Errore durante il salvataggio.");
        return;
      }
      setSuccess(true);
      setSuccessSlug(data.slug ?? "");
    } catch {
      setError("Errore di connessione. Riprova tra qualche secondo.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4">

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
        transition={{ duration: 0.3 }}
        className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="h-1.5 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500" />

        <div className="p-8">
          {/* Loading state */}
          {tokenValid === null && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Verifica del link in corso…</p>
            </div>
          )}

          {/* Invalid token */}
          {tokenValid === false && (
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <ShieldAlert className="w-10 h-10 text-red-400" />
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Link Non Valido</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-4">{tokenError}</p>
              <Link
                href="/forgot-password"
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all"
              >
                Richiedi un Nuovo Link
              </Link>
            </div>
          )}

          {/* Valid token — show form */}
          {tokenValid === true && !success && (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <KeyRound className="w-8 h-8 text-blue-600" />
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900 mb-1">Nuova Password</h1>
                {propertyName && (
                  <p className="text-blue-600 text-sm font-semibold mb-1">{propertyName}</p>
                )}
                <p className="text-gray-400 text-sm">
                  Scegli una nuova password sicura per il tuo account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">Nuova Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPwd ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                      placeholder="Minimo 4 caratteri"
                      className="w-full border border-gray-200 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">Conferma Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPwd ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                      placeholder="Ripeti la password"
                      className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    />
                  </div>
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
                    "Salva Nuova Password"
                  )}
                </button>
              </form>
            </>
          )}

          {/* Success */}
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Password Aggiornata!</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                La tua nuova password è attiva. Puoi accedere subito al tuo pannello.
              </p>
              <Link
                href={successSlug ? `/host/${successSlug}` : "/login"}
                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-xl text-sm transition-all shadow-lg shadow-blue-100"
              >
                Accedi al Pannello
              </Link>
            </motion.div>
          )}
        </div>

        {tokenValid !== null && !success && (
          <div className="border-t border-gray-100 px-8 py-4 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 transition-colors font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Torna al Login
            </Link>
          </div>
        )}
      </motion.div>

      <p className="text-center text-[11px] text-gray-300 mt-6">
        Powered by RomeGuest AI · Link monouso sicuro
      </p>
    </div>
  );
}
