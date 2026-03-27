import { useEffect } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, Shield, FileText, Loader2, KeyRound } from "lucide-react";
import { useGetProperty, useUpdateProperty } from "@workspace/api-client-react";

const hostSchema = z.object({
  content: z.string().min(1, "Il testo delle informazioni è obbligatorio"),
  hostPassword: z.string().min(1, "La password è obbligatoria"),
});

type HostFormValues = z.infer<typeof hostSchema>;

export default function HostPanel() {
  const { data: knowledge, isLoading } = useGetProperty("default");
  const { mutate: _updateProperty, isPending } = useUpdateProperty();
  const updateKnowledge = (vars: { data: HostFormValues }, options: Parameters<typeof _updateProperty>[1]) => {
    _updateProperty({ slug: "default", data: vars.data }, options);
  };

  const form = useForm<HostFormValues>({
    resolver: zodResolver(hostSchema),
    defaultValues: {
      content: "",
      hostPassword: "",
    },
  });

  // Update form when data loads
  useEffect(() => {
    if (knowledge?.content) {
      form.reset({
        content: knowledge.content,
        hostPassword: "", // Don't prepopulate password for security
      });
    }
  }, [knowledge, form]);

  const onSubmit = (data: HostFormValues) => {
    // 1. Chiudiamo la tastiera per evitare che intralci
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // 2. Mandiamo i dati a salvare
    updateKnowledge(
      { data },
      {
        onSuccess: () => {
          // 3. LA MAGIA: I dati sono salvi! 
          // Invece di provare a disegnare messaggini che fanno crashare l'iPhone,
          // forziamo un riavvio istantaneo della pagina (esattamente quello che facevi tu a mano!)
          window.location.reload();
        },
        onError: () => {
          // Se per caso c'è un errore vero (es. password sbagliata), mostriamo un avviso semplice
          alert("Errore di salvataggio: controlla la password o la connessione.");
        },
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col md:py-12 md:px-6">
        <div className="max-w-4xl w-full mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between mb-2 px-4 md:px-0">
          <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors py-2 px-4 -ml-4 rounded-full hover:bg-background/80">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-medium text-sm">Torna alla Chat</span>
          </Link>
        </div>

        <div className="glass-panel bg-card/95 rounded-3xl overflow-hidden">
          <div className="bg-primary/5 border-b border-border/50 px-8 py-8 md:py-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 rotate-3">
                <Shield className="w-6 h-6 -rotate-3" />
              </div>
              <div>
                <h1 className="text-3xl font-serif font-bold text-foreground">Pannello Host</h1>
                <p className="text-muted-foreground mt-1">Configura l'intelligenza artificiale per i tuoi ospiti.</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="content" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FileText className="w-4 h-4 text-primary" />
                    Knowledge Base dell'Appartamento
                  </label>
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Inserisci qui tutte le informazioni utili per i tuoi ospiti: regole della casa, password del Wi-Fi, istruzioni per l'uso degli elettrodomestici, smaltimento dei rifiuti, e consigli su ristoranti o trasporti. 
                  L'AI risponderà <strong>esclusivamente</strong> basandosi su questo testo.
                </p>

                <textarea
                  id="content"
                  {...form.register("content")}
                  disabled={isLoading}
                  placeholder="Es: Ciao! Benvenuti a casa nostra. La password del wifi è Guest2024. Il check-out è entro le 10:00. Per accendere l'aria condizionata, usa il telecomando sul tavolo..."
                  className="w-full min-h-[350px] p-6 rounded-2xl bg-background border-2 border-border/60 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all resize-y text-foreground placeholder:text-muted-foreground/60 leading-relaxed disabled:opacity-60"
                />
                {form.formState.errors.content && (
                  <p className="text-sm text-destructive font-medium mt-2">{form.formState.errors.content.message}</p>
                )}
              </div>

              <div className="pt-6 border-t border-border/50">
                <div className="max-w-md space-y-4">
                  <label htmlFor="hostPassword" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <KeyRound className="w-4 h-4 text-primary" />
                    Password di Sicurezza
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Necessaria per confermare le modifiche.
                  </p>
                  
                  <input
                    id="hostPassword"
                    type="password"
                    {...form.register("hostPassword")}
                    placeholder="Inserisci password host..."
                    className="w-full bg-background border-2 border-border/60 text-foreground px-5 py-3.5 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all"
                  />
                  <p className="text-[11px] text-muted-foreground/60 font-mono">
                    Hint: la password di default è <strong>host123</strong>
                  </p>
                  {form.formState.errors.hostPassword && (
                    <p className="text-sm text-destructive font-medium">{form.formState.errors.hostPassword.message}</p>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isPending || isLoading}
                  className="w-full md:w-auto px-8 py-4 rounded-xl font-semibold bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Salvataggio in corso...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Salva Configurazioni
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
        </div>
            </div>
          );
        }
