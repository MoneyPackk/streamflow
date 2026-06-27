import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User { id: string; email: string; displayName?: string; }

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
  logout: () => void;
  setSubscription: (sub: SubscriptionInfo | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      subscription: null,
      isLoading: false,
      login: async (email) => {
        set({ isLoading: true });
        await new Promise((r) => setTimeout(r, 800));
        set({ user: { id: `u_${Date.now()}`, email, displayName: email.split("@")[0] }, isLoading: false });
      },
      register: async (email, _pw, displayName) => {
        set({ isLoading: true });
        await new Promise((r) => setTimeout(r, 800));
        set({ user: { id: `u_${Date.now()}`, email, displayName }, isLoading: false });
      },
      logout: () => set({ user: null, subscription: null }),
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
