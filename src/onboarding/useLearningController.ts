import { useCallback, useEffect, useRef, useState } from 'react';
import { completeOnboarding, dismissWhatsNew, getGuideStartup, markAIOrganizationIntroSeen, readOnboardingState, skipOnboarding, subscribeToGuideState } from './onboardingState';
import { advanceLearning, beginAIConfiguration, pauseLearning, readLearningProgress, resumeLearning, startLearning, subscribeLearningProgress, type LearningChapter, type LearningProgress } from './learningState';
import { subscribeLearningEvents } from './learningEvents';
import { claimReleaseInvitation, dismissReleaseInvitation, getReleaseEducation, markReleaseFeatureUsed, markReleaseNotesRead, readReleaseNotice, recordReleaseEducation, subscribeReleaseEducation } from './releaseEducation';
import { acquireLearningPresentation } from './learningPresentation';

/** Keeps optional education separate from canvas state, configuration and syncing. */
export function useLearningController(version: string, blocked: boolean) {
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [newFeatures, setNewFeatures] = useState<LearningChapter[]>([]);
  const [expiresAt, setExpiresAt] = useState<number>();
  const [invitation, setInvitation] = useState<LearningChapter | null>(null);
  const [aiIntroOpen, setAIIntroOpen] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const openRef = useRef(false);
  const notesOpenRef = useRef(false);
  const invitationRef = useRef<LearningChapter | null>(null);
  const aiIntroRef = useRef(false);
  const aiIntroDismissed = useRef(false);
  const owner = useRef<(() => void) | null>(null);
  const claiming = useRef(false);
  const dismissed = useRef(false);
  const refreshRef = useRef<() => void>(() => undefined);

  const release = useCallback(() => { owner.current?.(); owner.current = null; }, []);
  const own = useCallback(async () => {
    if (owner.current) return true;
    if (claiming.current) return false;
    claiming.current = true;
    try {
      const relinquish = await acquireLearningPresentation();
      if (!mounted.current) { relinquish?.(); return false; }
      owner.current = relinquish;
      return Boolean(relinquish);
    } finally { claiming.current = false; }
  }, []);
  const finishLegacy = useCallback(async (next: LearningProgress | null) => {
    if (next?.completedChapters.includes('basics') && !(await readOnboardingState()).onboardingCompleted) await completeOnboarding();
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let refreshing = false;
    let again = false;
    const refresh = async () => {
      if (refreshing) { again = true; return; }
      refreshing = true;
      try {
        const startup = await getGuideStartup(version);
        if (startup?.surface === 'whats-new') await recordReleaseEducation(getReleaseEducation(version));
        const [next, notice, onboarding] = await Promise.all([readLearningProgress(), readReleaseNotice(version), readOnboardingState()]);
        if (cancelled) return;
        setProgress(next); setUnread(notice.unread); setExpiresAt(notice.expiresAt); setNewFeatures(notice.featureChapters ?? []);
        await finishLegacy(next);
        if (cancelled || blockedRef.current || dismissed.current || openRef.current || notesOpenRef.current || invitationRef.current || aiIntroRef.current
          || document.visibilityState === 'hidden') return;
        const introPending = onboarding.aiOrganizationIntro === 'pending' && !aiIntroDismissed.current;
        if (startup?.surface !== 'onboarding' && next?.status !== 'active' && !notice.invitationChapter && !introPending) return;
        if (!await own()) return;
        if (cancelled || blockedRef.current || dismissed.current || notesOpenRef.current) { release(); return; }
        // Re-read after acquiring the lock; another tab may just have paused it.
        const [liveStartup, liveProgress, liveOnboarding] = await Promise.all([getGuideStartup(version), readLearningProgress(), readOnboardingState()]);
        if (cancelled || blockedRef.current || dismissed.current || notesOpenRef.current) { release(); return; }
        if (liveStartup?.surface === 'onboarding' || liveProgress?.status === 'active') {
          setProgress(liveProgress); openRef.current = true; setOpen(true);
        } else if (liveOnboarding.aiOrganizationIntro === 'pending' && !aiIntroDismissed.current) {
          aiIntroRef.current = true; setAIIntroOpen(true);
        } else {
          const chapter = await claimReleaseInvitation(version);
          if (cancelled) { release(); return; }
          invitationRef.current = chapter; setInvitation(chapter);
          if (!chapter) release();
        }
      } catch { if (!openRef.current && !invitationRef.current && !aiIntroRef.current) release(); if (!cancelled) setError(true); }
      finally { refreshing = false; if (again && !cancelled) { again = false; void refresh(); } }
    };
    refreshRef.current = () => { void refresh(); };
    const stops = [subscribeToGuideState(refreshRef.current), subscribeLearningProgress(refreshRef.current), subscribeReleaseEducation(refreshRef.current)];
    const onFocus = () => refreshRef.current();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    void refresh();
    return () => {
      cancelled = true; mounted.current = false; stops.forEach((stop) => stop());
      window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus);
      refreshRef.current = () => undefined; release();
    };
  }, [version, finishLegacy, own, release]);

  useEffect(() => { if (!blocked) refreshRef.current(); }, [blocked]);
  useEffect(() => {
    if (!unread || !expiresAt) return;
    const timer = window.setTimeout(() => refreshRef.current(), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [unread, expiresAt]);
  useEffect(() => subscribeLearningEvents((event) => {
    const used = event.type === 'ai-previewed' ? 'ai' : event.type === 'presentation-changed' ? 'basics' : null;
    if (used) void markReleaseFeatureUsed(version, used).catch(() => undefined);
    if (!openRef.current || !owner.current) return;
    void advanceLearning(event).then(async (next) => {
      if (!mounted.current) return;
      setProgress(next); await finishLegacy(next);
    }).catch(() => { if (mounted.current) setError(true); });
  }), [finishLegacy, version]);

  const show = useCallback(async () => {
    if (!await own()) { if (mounted.current) setError(true); return; }
    try {
      const next = await readLearningProgress();
      if (!mounted.current) { release(); return; }
      dismissed.current = false; openRef.current = true;
      invitationRef.current = null; setInvitation(null); notesOpenRef.current = false; setNotesOpen(false);
      setProgress(next); setOpen(true); setError(false);
    } catch { release(); if (mounted.current) setError(true); }
  }, [own, release]);
  const start = useCallback(async (chapter: LearningChapter) => {
    if (!await own()) { if (mounted.current) setError(true); return false; }
    try {
      const next = await startLearning(chapter);
      if (!mounted.current) { release(); return false; }
      dismissed.current = false; openRef.current = true; invitationRef.current = null;
      setProgress(next); setInvitation(null); setOpen(true); setError(false);
      return true;
    } catch { if (mounted.current) setError(true); return false; }
  }, [own, release]);
  const resume = useCallback(async () => {
    try { const next = await resumeLearning(); if (mounted.current) { setProgress(next); setError(false); } }
    catch { if (mounted.current) setError(true); }
  }, []);
  const configureAI = useCallback(async () => {
    try { const next = await beginAIConfiguration(); if (mounted.current) setProgress(next); }
    catch { if (mounted.current) setError(true); }
  }, []);
  const pause = useCallback(async () => {
    dismissed.current = true; openRef.current = false; setOpen(false);
    try {
      const next = await pauseLearning();
      if ((await readOnboardingState()).pendingOnboarding) await skipOnboarding();
      if (mounted.current) setProgress(next);
    } catch { if (mounted.current) setError(true); }
    finally { release(); }
  }, [release]);
  const showNotes = useCallback(async () => {
    notesOpenRef.current = true;
    setNotesOpen(true);
    // Reading an update does not mark any tutorial task complete.
    try { await markReleaseNotesRead(version); await dismissWhatsNew(version); if (mounted.current) setUnread(false); }
    catch { if (mounted.current) setError(true); }
  }, [version]);
  const closeNotes = () => {
    notesOpenRef.current = false;
    setNotesOpen(false);
    refreshRef.current();
  };
  const deferInvitation = useCallback(async () => {
    invitationRef.current = null; setInvitation(null);
    try { await dismissReleaseInvitation(version); }
    catch { if (mounted.current) setError(true); }
    finally { release(); }
  }, [version, release]);
  const dismissAIIntro = useCallback(async () => {
    const wasOpen = aiIntroRef.current;
    aiIntroDismissed.current = true;
    setAIIntroOpen(false);
    try { await markAIOrganizationIntroSeen(); }
    catch { if (mounted.current) setError(true); }
    finally {
      aiIntroRef.current = false;
      if (wasOpen) release();
      refreshRef.current();
    }
  }, [release]);

  return { progress, open, notesOpen, unread, newFeatures, invitation, aiIntroOpen, dismissAIIntro, error, show, start, resume, pause,
    showNotes, closeNotes, deferInvitation, configureAI, clearError: () => setError(false) };
}
