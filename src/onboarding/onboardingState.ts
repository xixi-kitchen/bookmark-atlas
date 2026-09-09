export type OnboardingSurface = 'onboarding' | 'whats-new';

export type GuideStartup = {
  surface: OnboardingSurface;
  source: 'pending' | 'manual';
};

type InstallReason = 'install' | 'update' | string;

type OnboardingStorage = {
  onboardingCompleted?: boolean;
  onboardingSkipped?: boolean;
  pendingOnboarding?: boolean;
  pendingWhatsNewVersion?: string;
  seenWhatsNewVersion?: string;
  installedVersion?: string;
  updatedFromVersion?: string;
};

export const ONBOARDING_STORAGE_KEY = 'bookmark-atlas:onboarding:v1';
const LOCAL_STATE_EVENT = 'bookmark-atlas:onboarding-state-changed';

export async function recordInstallationEvent(details: {
  reason: InstallReason;
  version: string;
  previousVersion?: string;
}) {
  const current = await readOnboardingState();
  if (details.reason === 'install') {
    await writeOnboardingState({
      ...current,
      installedVersion: details.version,
      pendingOnboarding: !current.onboardingCompleted && !current.onboardingSkipped,
    });
    return;
  }

  if (details.reason === 'update' && details.previousVersion !== details.version) {
    await writeOnboardingState({
      ...current,
      installedVersion: current.installedVersion ?? details.version,
      updatedFromVersion: details.previousVersion,
      pendingWhatsNewVersion: details.version,
      pendingOnboarding: false,
    });
  }
}

export async function getGuideStartup(version: string): Promise<GuideStartup | null> {
  const current = await readOnboardingState();
  if (current.pendingOnboarding && !current.onboardingCompleted && !current.onboardingSkipped) {
    return { surface: 'onboarding', source: 'pending' };
  }
  if (current.pendingWhatsNewVersion === version && current.seenWhatsNewVersion !== version) {
    return { surface: 'whats-new', source: 'pending' };
  }
  return null;
}

export async function completeOnboarding() {
  const current = await readOnboardingState();
  await writeOnboardingState({
    ...current,
    onboardingCompleted: true,
    onboardingSkipped: false,
    pendingOnboarding: false,
  });
}

export async function skipOnboarding() {
  const current = await readOnboardingState();
  await writeOnboardingState({
    ...current,
    onboardingSkipped: true,
    pendingOnboarding: false,
  });
}

export async function dismissWhatsNew(version: string) {
  const current = await readOnboardingState();
  await writeOnboardingState({
    ...current,
    seenWhatsNewVersion: version,
    pendingWhatsNewVersion: undefined,
  });
}

export async function readOnboardingState(): Promise<OnboardingStorage> {
  if (globalThis.chrome?.storage?.local) {
    const result = await globalThis.chrome.storage.local.get(ONBOARDING_STORAGE_KEY);
    return normalizeState(result[ONBOARDING_STORAGE_KEY]);
  }
  try {
    const raw = globalThis.localStorage?.getItem(ONBOARDING_STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function subscribeToGuideState(listener: () => void) {
  const storageEvent = globalThis.chrome?.storage?.onChanged;
  const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && changes[ONBOARDING_STORAGE_KEY]) listener();
  };
  storageEvent?.addListener(handleStorageChange);

  const handleLocalChange = () => listener();
  globalThis.window?.addEventListener(LOCAL_STATE_EVENT, handleLocalChange);

  return () => {
    storageEvent?.removeListener(handleStorageChange);
    globalThis.window?.removeEventListener(LOCAL_STATE_EVENT, handleLocalChange);
  };
}

async function writeOnboardingState(state: OnboardingStorage) {
  const normalized = normalizeState(state);
  if (globalThis.chrome?.storage?.local) {
    await globalThis.chrome.storage.local.set({ [ONBOARDING_STORAGE_KEY]: normalized });
    return;
  }
  globalThis.localStorage?.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(normalized));
  globalThis.window?.dispatchEvent(new Event(LOCAL_STATE_EVENT));
}

function normalizeState(value: unknown): OnboardingStorage {
  if (!value || typeof value !== 'object') return {};
  const state = value as OnboardingStorage;
  return {
    onboardingCompleted: state.onboardingCompleted === true,
    onboardingSkipped: state.onboardingSkipped === true,
    pendingOnboarding: state.pendingOnboarding === true,
    pendingWhatsNewVersion: typeof state.pendingWhatsNewVersion === 'string' ? state.pendingWhatsNewVersion : undefined,
    seenWhatsNewVersion: typeof state.seenWhatsNewVersion === 'string' ? state.seenWhatsNewVersion : undefined,
    installedVersion: typeof state.installedVersion === 'string' ? state.installedVersion : undefined,
    updatedFromVersion: typeof state.updatedFromVersion === 'string' ? state.updatedFromVersion : undefined,
  };
}
