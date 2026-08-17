import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  userId: string | null;
  displayName: string | null;
  isAuthenticated: boolean;

  setAuth: (token: string, userId: string, displayName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      displayName: null,
      isAuthenticated: false,

      setAuth: (token, userId, displayName) =>
        set({
          token,
          userId,
          displayName,
          isAuthenticated: true,
        }),

      logout: () =>
        set({
          token: null,
          userId: null,
          displayName: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'offerpilot-auth',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
