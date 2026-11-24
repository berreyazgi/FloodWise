"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, postJson } from "@/lib/client/api";
import { TooltipProvider } from "@/components/ui/tooltip";

type Role = "citizen" | "operator";
interface AppState { role: Role; setRole: (r: Role) => void; locationId: string; setLocationId: (id: string) => void }
const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside Providers");
  return v;
};

const LOC_KEY = "fw_location";

function AppStateProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => api<{ role: Role }>("/api/session") });
  const setRoleM = useMutation({ mutationFn: (role: Role) => postJson("/api/session", { role }), onSuccess: () => qc.invalidateQueries() });
  const [locationId, setLoc] = useState("loc-ayamama");
  useEffect(() => {
    // hydrate from storage after mount (server render has no storage → avoids hydration mismatch)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const v = localStorage.getItem(LOC_KEY); if (v) setLoc(v); } catch { /* storage unavailable */ }
  }, []);
  const setLocationId = (id: string) => {
    setLoc(id);
    try { localStorage.setItem(LOC_KEY, id); } catch { /* storage unavailable */ }
  };
  return (
    <Ctx.Provider value={{ role: session.data?.role ?? "citizen", setRole: (r) => setRoleM.mutate(r), locationId, setLocationId }}>
      {children}
    </Ctx.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <AppStateProvider>{children}</AppStateProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
