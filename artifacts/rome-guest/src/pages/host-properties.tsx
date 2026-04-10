import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import {
  Building, MessageSquare, Settings, LogOut, Loader2,
  AlertCircle, Home, ArrowRight, BookOpen,
} from "lucide-react";
import { apiUrl } from "@/lib/apiUrl";
import { clearHostSession, getHostSession, type HostSession } from "@/lib/hostSession";

interface PropertySummary {
  id: number;
  slug: string;
  name: string;
  whatsappNumber: string | null;
}

export default function HostProperties() {
  const [, navigate] = useLocation();
  const [session, setSession] = useState<HostSession | null>(null);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getHostSession();
    if (!s) {
      navigate("/login");
      return;
    }
    setSession(s);
    loadProperties(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProperties = async (s: HostSession) => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/auth/host/me"), {
        headers: { Authorization: `Bearer ${s.sessionToken}` },
      });
      const json = await res.json();
      if (!res.ok) {
        clearHostSession();
        navigate("/login");
        return;
      }
      setProperties(json.properties ?? []);
    } catch {
      setError("Errore di connessione. Riprova.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    clearHostSession();
    navigate("/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-blue-600">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="font-medium text-gray-500">Caricamento strutture...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl shadow-sm border border-gray-100 px-6 py-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-gray-900 text-[17px] leading-tight">Le mie Strutture</h1>
              <p className="text-gray-400 text-[12px] mt-0.5 truncate max-w-[220px]">{session?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Esci
          </button>
        </motion.div>

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 text-red-600 px-5 py-4 rounded-2xl">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {!error && properties.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 text-center"
          >
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Home className="w-8 h-8 text-blue-300" />
            </div>
            <h2 className="font-bold text-gray-700 text-lg mb-2">Nessuna struttura assegnata</h2>
            <p className="text-gray-400 text-sm max-w-xs mx-auto">
              Contatta il supporto HeyCico per associare le tue strutture a questo account.
            </p>
          </motion.div>
        )}

        {properties.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {properties.map((prop, idx) => (
              <motion.div
                key={prop.slug}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Home className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-gray-900 text-[15px] leading-tight truncate">{prop.name}</h2>
                    <p className="text-[11px] text-gray-400 font-mono mt-0.5">/guest/{prop.slug}</p>
                  </div>
                </div>

                <div className="flex gap-2 mt-auto pt-2 border-t border-gray-50">
                  <Link
                    href={`/guest/${prop.slug}`}
                    className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 py-2.5 px-3 rounded-xl transition-colors"
                    title="Vai alla chat ospiti"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href={`/diario/${prop.slug}`}
                    className="flex items-center justify-center gap-1.5 text-[13px] font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 py-2.5 px-3 rounded-xl transition-colors"
                    title="Diario di Bordo"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href={`/host/${prop.slug}`}
                    className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold text-white bg-blue-600 hover:bg-blue-700 py-2.5 rounded-xl transition-colors shadow-sm shadow-blue-200"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Gestisci
                    <ArrowRight className="w-3 h-3 opacity-70" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-300 mt-2 uppercase tracking-widest">
          Powered by HeyCico
        </p>
      </div>
    </div>
  );
}
