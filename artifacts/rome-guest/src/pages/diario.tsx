import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Loader2, MessageCircle, Bot, Calendar, AlertTriangle, CheckCircle2 } from "lucide-react";
import { detectNeedsAttention } from "../lib/detectNeedsAttention";
import { apiUrl } from "@/lib/apiUrl";

interface ChatLog {
  id: number;
  propertySlug: string;
  guestMessage: string;
  marcoReply: string;
  createdAt: string;
  resolved: boolean;
}

const HOST_SESSION_KEY = "host_session";
const SESSION_TTL = 8 * 60 * 60 * 1000;

function readHostSession(): { sessionToken: string } | null {
  try {
    const raw = sessionStorage.getItem(HOST_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { sessionToken?: string; ts?: number };
    if (!s.sessionToken) {
      sessionStorage.removeItem(HOST_SESSION_KEY);
      return null;
    }
    if (typeof s.ts === "number" && Date.now() - s.ts > SESSION_TTL) {
      sessionStorage.removeItem(HOST_SESSION_KEY);
      return null;
    }
    return { sessionToken: s.sessionToken };
  } catch {
    return null;
  }
}

export default function DiarioDiBordo() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";

  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = () => {
    if (!slug) return;
    const auth = readHostSession();
    if (!auth) {
      navigate("/login");
      return;
    }
    setIsLoading(true);
    fetch(apiUrl(`/api/super-diario/${slug}`), {
      headers: { Authorization: `Bearer ${auth.sessionToken}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          sessionStorage.removeItem(HOST_SESSION_KEY);
          navigate("/login");
          throw new Error("Sessione scaduta. Accedi di nuovo.");
        }
        if (!res.ok) throw new Error(`Errore ${res.status}`);
        return res.json() as Promise<ChatLog[]>;
      })
      .then((data) => {
        setLogs(data.map((log) => ({ ...log, resolved: log.resolved ?? false })));
        setError("");
        setIsLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message ?? "Impossibile caricare il diario.");
        setIsLoading(false);
      });
  };

  useEffect(() => {
    if (!slug) return;
    const auth = readHostSession();
    if (!auth) {
      navigate("/login");
      return;
    }
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const markAsResolved = async (id: number) => {
    const auth = readHostSession();
    if (!auth) {
      navigate("/login");
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/super-diario/${slug}/resolve/${id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${auth.sessionToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem(HOST_SESSION_KEY);
        navigate("/login");
        return;
      }
      if (!res.ok) throw new Error("Errore nel salvataggio");
      setLogs(logs.map((log) => (log.id === id ? { ...log, resolved: true } : log)));
    } catch {
      // silently fail — UI will retain previous state
    }
  };

  const pendingLogs = logs.filter((l) => !l.resolved && detectNeedsAttention(l.marcoReply));
  const resolvedLogs = logs.filter((l) => l.resolved);
  const successLogs = logs.filter((l) => !l.resolved && !detectNeedsAttention(l.marcoReply));

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-gray-900 text-[16px] leading-tight">Diario di Bordo</h1>
              <p className="text-gray-400 text-[11px] font-mono">{slug}</p>
            </div>
          </div>
          <Link
            href={`/host/${slug}`}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="flex flex-col items-center gap-3 text-indigo-500">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm text-gray-400">Caricamento conversazioni...</p>
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className="bg-white rounded-3xl shadow-sm border border-red-100 p-8 text-center">
            <p className="text-red-500 font-medium">{error}</p>
            <Link href={`/host/${slug}`} className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
              Torna alla dashboard
            </Link>
          </div>
        )}

        {!isLoading && !error && logs.length === 0 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-indigo-300" />
            </div>
            <p className="text-gray-500 font-medium">Nessuna conversazione ancora.</p>
            <p className="text-gray-400 text-sm mt-1">Le chat degli ospiti appariranno qui.</p>
          </div>
        )}

        {!isLoading && !error && logs.length > 0 && (
          <div className="flex flex-col gap-4">

            {pendingLogs.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-1 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <p className="text-sm font-bold text-red-600">⚠️ Richieste in Sospeso</p>
                  <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">{pendingLogs.length}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {pendingLogs.map((log) => (
                    <div key={log.id} className="bg-white rounded-2xl shadow-sm border-2 border-red-300 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[11px] text-red-600 font-mono">{formatDate(log.createdAt)}</span>
                      </div>
                      <div className="p-5 flex flex-col gap-4">
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[11px] font-semibold text-blue-500 mb-1">Ospite</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{log.guestMessage}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[11px] font-semibold text-red-500 mb-1">Marco AI (Necessita azione)</p>
                            <p className="text-sm text-gray-600 leading-relaxed italic">{log.marcoReply}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => markAsResolved(log.id)}
                          className="mt-2 self-start flex items-center gap-1.5 text-xs font-semibold text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Segna come gestito
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              {(successLogs.length > 0 || resolvedLogs.length > 0) && (
                <p className="text-xs text-gray-400 font-medium px-1 mb-3">
                  {successLogs.length + resolvedLogs.length} conversazion{(successLogs.length + resolvedLogs.length) === 1 ? "e" : "i"} gestit{(successLogs.length + resolvedLogs.length) === 1 ? "a" : "e"}
                </p>
              )}
              <div className="flex flex-col gap-3">
                {[...successLogs, ...resolvedLogs].map((log) => (
                  <div key={log.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-[11px] text-gray-400 font-mono">{formatDate(log.createdAt)}</span>
                      {log.resolved && (
                        <span className="ml-auto text-[10px] text-green-600 font-semibold bg-green-50 px-2 py-0.5 rounded">Risolto</span>
                      )}
                    </div>
                    <div className="p-5 flex flex-col gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <MessageCircle className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-blue-500 mb-1">Ospite</p>
                          <p className="text-sm text-gray-700 leading-relaxed">{log.guestMessage}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-indigo-500 mb-1">Marco AI</p>
                          <p className="text-sm text-gray-600 leading-relaxed">{log.marcoReply}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
