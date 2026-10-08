import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import { defaultProfile, type Profile } from "@/lib/profile";
import { useAccountStore } from "@/store/account-store";

export const PROFILE_STORAGE_KEY = "vantravel-profile-v1";

type ProfileState = {
  profile: Profile;
  hydrated: boolean;
  setProfile: (patch: Partial<Profile>) => void;
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: defaultProfile(),
      hydrated: false,
      setProfile: (patch) => set((prev) => ({ profile: { ...prev.profile, ...patch } })),
    }),
    {
      name: PROFILE_STORAGE_KEY,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({ profile: state.profile }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProfileState>;
        return {
          ...current,
          profile: { ...defaultProfile(), ...(p.profile ?? {}) },
          hydrated: true,
        };
      },
    },
  ),
);

/** Prénom courant pour `updatedBy`, lisible hors React : le profil local, sinon le prénom du compte. */
export function currentAuthor(): string {
  const local = useProfileStore.getState().profile.name.trim();
  if (local) return local;
  const account = useAccountStore.getState().user?.displayName.trim().split(/\s+/)[0];
  return account || "moi";
}
