import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Cashier = Tables<"cashiers">;

const EMAIL_DOMAIN = "cashiers.local";

export function loginToEmail(login: string) {
  return `${login.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

/**
 * In-memory cache of the currently signed-in cashier's display name, kept in
 * sync by useCurrentCashier(). Used by the cash-register data layer so mutation
 * functions (which are plain async functions, not components) can attribute
 * journal entries without threading the name through every call site.
 */
let cachedCashierName: string | null = null;

export function getCachedCashierName(): string {
  return cachedCashierName ?? "Кассир";
}

function setCachedCashierName(name: string | null) {
  cachedCashierName = name;
}

/* ============== Session ============== */

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useCurrentCashier(userId: string | undefined) {
  const query = useQuery({
    queryKey: ["current-cashier", userId],
    queryFn: async (): Promise<Cashier | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("cashiers")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    setCachedCashierName(query.data?.name ?? null);
  }, [query.data]);

  return query;
}

/* ============== Login / logout ============== */

export function useLogin() {
  return useMutation({
    mutationFn: async (vars: { login: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginToEmail(vars.login),
        password: vars.password,
      });
      if (error) {
        throw new Error("Неверный логин или пароль");
      }
      return data;
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      setCachedCashierName(null);
      qc.clear();
    },
  });
}

/* ============== Cashier management ============== */

export function useCashiers() {
  return useQuery({
    queryKey: ["cashiers-list"],
    queryFn: async (): Promise<Cashier[]> => {
      const { data, error } = await supabase
        .from("cashiers")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddCashier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { login: string; password: string; name: string }) => {
      const login = vars.login.trim().toLowerCase();
      const name = vars.name.trim();
      if (!login || !name) throw new Error("Заполните логин и имя");
      if (vars.password.length < 6) throw new Error("Пароль должен быть не короче 6 символов");

      const { data: existing } = await supabase
        .from("cashiers")
        .select("id")
        .eq("login", login)
        .maybeSingle();
      if (existing) throw new Error("Такой логин уже занят");

      // Preserve the current (admin) session — supabase.auth.signUp() switches
      // the client's active session to the newly created user, since there is
      // no backend available to safely use the service-role Admin API.
      const { data: currentSessionData } = await supabase.auth.getSession();
      const currentSession = currentSessionData.session;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: loginToEmail(login),
        password: vars.password,
      });
      if (signUpError) throw new Error("Не удалось создать кассира: " + signUpError.message);
      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("Не удалось создать кассира");

      if (currentSession) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
      }

      const { error: insertError } = await supabase.from("cashiers").insert({
        user_id: newUserId,
        login,
        name,
      });
      if (insertError) throw new Error("Не удалось сохранить кассира: " + insertError.message);

      return { userId: newUserId, login, name };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashiers-list"] });
    },
  });
}
