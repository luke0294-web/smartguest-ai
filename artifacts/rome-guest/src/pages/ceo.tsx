import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Building, Plus, Trash2, ExternalLink, KeyRound, Loader2, Save, Users, AlertCircle, Sparkles } from "lucide-react";
import { format } from "date-fns";

import { useListProperties, useCreateProperty, useDeleteProperty, getListPropertiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const createPropertySchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio"),
  slug: z.string().min(1, "Lo slug è obbligatorio").regex(/^[a-z0-9-]+$/, "Solo lettere minuscole, numeri e trattini"),
  whatsappNumber: z.string().optional(),
  content: z.string().min(1, "Il regolamento è obbligatorio"),
});

type CreatePropertyValues = z.infer<typeof createPropertySchema>;

export default function CeoPanel() {
  const [password, setPassword] = useState("");
  const [authAttempt, setAuthAttempt] = useState(false);
  const queryClient = useQueryClient();

  const { data: properties, isLoading: isListLoading, error: listError, refetch } = useListProperties(
    { ceoPassword: password },
    {
      query: {
        enabled: authAttempt && !!password,
        retry: false,
      }
    }
  );

  const { mutate: createProperty, isPending: isCreating } = useCreateProperty();
  const { mutate: deleteProperty, isPending: isDeleting } = useDeleteProperty();

  const form = useForm<CreatePropertyValues>({
    resolver: zodResolver(createPropertySchema),
    defaultValues: {
      name: "",
      slug: "",
      whatsappNumber: "",
      content: "",
    }
  });

  // Auto-generate slug from name
  const watchName = form.watch("name");
  useEffect(() => {
    if (watchName && !form.formState.touchedFields.slug) {
      const generated = watchName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      form.setValue("slug", generated, { shouldValidate: true });
    }
  }, [watchName, form]);

  // Handle authentication
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pwd = fd.get("password") as string;
    if (pwd) {
      setPassword(pwd);
      setAuthAttempt(true);
    }
  };

  // Logout / clear auth on 401
  useEffect(() => {
    if (listError && (listError as any).status === 401) {
      setAuthAttempt(false);
      setPassword("");
      alert("Password errata. Riprova.");
    }
  }, [listError]);

  const onSubmit = (data: CreatePropertyValues) => {
    createProperty(
      {
        data: {
          ceoPassword: password,
          ...data
        }
      },
      {
        onSuccess: () => {
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey({ ceoPassword: password }) });
          alert("Proprietà creata con successo!");
        },
        onError: (err: any) => {
          alert(`Errore: ${err.response?.data?.error || 'Impossibile creare la proprietà'}`);
        }
      }
    );
  };

  const handleDelete = (slug: string) => {
    if (window.confirm(`Sei sicuro di voler eliminare la proprietà ${slug}?`)) {
      deleteProperty(
        {
          slug,
          data: { ceoPassword: password }
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey({ ceoPassword: password }) });
          },
          onError: () => {
            alert("Errore durante l'eliminazione");
          }
        }
      );
    }
  };

  // ── AUTH SCREEN ──
  if (!authAttempt || (!properties && !isListLoading)) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 sm:p-12 rounded-[2rem] max-w-md w-full text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
          
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Building className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Professional Host Suite</h1>
          <p className="text-muted-foreground text-sm mb-8">Accesso riservato amministratori RomeGuest AI</p>
          
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                name="password"
                type="password"
                placeholder="Password Super-Admin"
                className="w-full bg-background border border-border pl-12 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all font-sans"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-primary text-primary-foreground font-medium py-3.5 rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
            >
              {isListLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Accedi al Pannello"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ── DASHBOARD SCREEN ──
  return (
    <div className="min-h-[100dvh] flex flex-col md:py-8 md:px-6">
      <div className="max-w-7xl w-full mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 sm:px-8 rounded-[2rem]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-foreground leading-tight">RomeGuest AI CEO</h1>
              <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-0.5">
                <Users className="w-3.5 h-3.5" /> Professional Host Suite
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/" className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-lg transition-colors">
              Esci
            </a>
          </div>
        </header>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* ── LEFT: PROPERTIES LIST ── */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xl font-serif font-semibold">Le mie proprietà ({properties?.length || 0})</h2>
              {isListLoading && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
            </div>

            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {properties?.map((prop) => (
                  <motion.div
                    key={prop.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="glass-panel p-6 rounded-3xl flex flex-col sm:flex-row gap-6 justify-between group hover:border-primary/30 transition-colors"
                  >
                    <div className="space-y-2 flex-1">
                      <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        {prop.name}
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold tracking-wide uppercase">
                          ATTIVA
                        </span>
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 font-mono bg-black/5 px-2 py-0.5 rounded-md text-[13px]">
                          /{prop.slug}
                        </span>
                        {prop.whatsappNumber && (
                          <span className="flex items-center gap-1">
                            WA: {prop.whatsappNumber}
                          </span>
                        )}
                        <span className="flex items-center gap-1 opacity-70">
                          Creata: {format(new Date(prop.createdAt), 'dd MMM yyyy')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex sm:flex-col items-center justify-end gap-2 shrink-0 border-t sm:border-t-0 sm:border-l border-border/50 pt-4 sm:pt-0 sm:pl-6">
                      <Link
                        href={`/guest/${prop.slug}`}
                        target="_blank"
                        className="w-full sm:w-auto px-4 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        Apri Chat <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(prop.slug)}
                        disabled={isDeleting}
                        className="w-full sm:w-auto px-4 py-2 text-destructive hover:bg-destructive hover:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Elimina
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {(!properties || properties.length === 0) && !isListLoading && (
                <div className="glass-panel p-12 rounded-3xl text-center flex flex-col items-center border-dashed">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Building className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Nessuna proprietà</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Non hai ancora creato alcun appartamento. Usa il form per aggiungere il tuo primo cliente.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: CREATE FORM ── */}
          <div className="lg:col-span-5 sticky top-8">
            <div className="glass-panel rounded-[2rem] overflow-hidden">
              <div className="bg-primary/5 px-6 py-5 border-b border-border/50 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-serif font-bold">Aggiungi Proprietà</h2>
              </div>
              
              <div className="p-6">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Nome Appartamento</label>
                    <input
                      {...form.register("name")}
                      placeholder="es. Fleming Suite 1"
                      className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-sans text-sm"
                    />
                    {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">URL Slug</label>
                      <input
                        {...form.register("slug")}
                        placeholder="es. fleming-1"
                        className="w-full bg-black/5 border border-transparent px-4 py-2.5 rounded-xl focus:bg-background focus:border-primary/50 focus:outline-none transition-all font-mono text-sm"
                      />
                      {form.formState.errors.slug && <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">WhatsApp Host</label>
                      <input
                        {...form.register("whatsappNumber")}
                        placeholder="+39 333..."
                        className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-sans text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                      Knowledge Base
                      <span className="text-[10px] font-normal text-muted-foreground uppercase tracking-wider">Regole e info</span>
                    </label>
                    <textarea
                      {...form.register("content")}
                      placeholder="Inserisci qui regolamento, WiFi, consigli..."
                      className="w-full h-[200px] resize-y bg-background border border-border px-4 py-3 rounded-xl focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all font-sans text-sm leading-relaxed"
                    />
                    {form.formState.errors.content && <p className="text-xs text-destructive">{form.formState.errors.content.message}</p>}
                  </div>

                  <button
                    type="submit"
                    disabled={isCreating}
                    className="w-full bg-primary text-primary-foreground font-medium py-3.5 rounded-xl shadow-md shadow-primary/20 hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                  >
                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Crea Nuova Proprietà</>}
                  </button>
                </form>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
