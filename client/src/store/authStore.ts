import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User { id: string; email: string; username: string; is_admin?: number; }

interface SubscriptionInfo {
  plan: string;
  status: string;
  current_period_end: string | null;
  canceled_at: string | null;
}

interface AuthState {
  user: User | null;
  subscription: SubscriptionInfo | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  setSubscription: (sub: SubscriptionInfo | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      subscription: null,
      isLoading: false,
      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Invalid email or password");
          }
          const { user } = await res.json();
          set({ user: { id: String(user.id), email: user.email, username: user.username, is_admin: user.is_admin }, isLoading: false });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },
      register: async (email, password, displayName) => {
        set({ isLoading: true });
        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: displayName, email, password }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Registration failed");
          }
          const { user } = await res.json();
          set({ user: { id: String(user.id), email: user.email, username: user.username, is_admin: user.is_admin }, isLoading: false });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },
      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        set({ user: null, subscription: null });
      },
      restoreSession: async () => {
        try {
          const res = await fetch("/api/auth/me");
          if (!res.ok) return;
          const data = await res.json();
          if (data.id) {
            set({
              user: { id: String(data.id), email: data.email, username: data.username, is_admin: data.is_admin },
              subscription: data.subscription || null,
            });
          }
        } catch {
          // Not logged in — ignore
        }
      },
      setSubscription: (sub) => set({ subscription: sub }),
    }),
    {
      name: "streamora-auth",
      partialize: (state) => ({ user: state.user, subscription: state.subscription }),
    }
  )
);

interface MovieStore {
  watchHistory: number[];
  myList: number[];
  addToWatchHistory: (id: number) => void;
  addToMyList: (id: number) => void;
  removeFromMyList: (id: number) => void;
  isInMyList: (id: number) => boolean;
}

export const useMovieStore = create<MovieStore>()(
  persist(
    (set, get) => ({
      watchHistory: [],
      myList: [],
      addToWatchHistory: (id) =>
        set((s) => ({ watchHistory: [id, ...s.watchHistory.filter((x) => x !== id)].slice(0, 50) })),
      addToMyList: (id) => set((s) => ({ myList: [...new Set([id, ...s.myList])] })),
      removeFromMyList: (id) => set((s) => ({ myList: s.myList.filter((x) => x !== id) })),
      isInMyList: (id) => get().myList.includes(id),
    }),
    { name: "streamora-movies" }
  )
);
