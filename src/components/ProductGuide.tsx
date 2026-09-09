import { Check, ExternalLink, Github, HelpCircle, Search, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';
import type { OnboardingSurface } from '../onboarding/onboardingState';

type ProductGuideProps = {
  surface: OnboardingSurface;
  version: string;
  onFocusSearch: () => void;
  onOpenCanvas: () => void;
  onClose: () => void;
  onDone: () => void;
};

const GITHUB_RELEASES_URL = 'https://github.com/xixi-kitchen/bookmark-atlas/releases';

export function ProductGuide({ surface, version, onFocusSearch, onOpenCanvas, onClose, onDone }: ProductGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const isWhatsNew = surface === 'whats-new';
  const title = isWhatsNew ? t('guideWhatsNewTitle', version) : t('guideOnboardingTitle');
  const subtitle = isWhatsNew ? t('guideWhatsNewSubtitle') : t('guideOnboardingSubtitle');
  const steps = isWhatsNew ? [
    { icon: Sparkles, title: t('guideWhatsNewSyncTitle'), body: t('guideWhatsNewSyncBody'), actionLabel: undefined, action: undefined },
    { icon: Search, title: t('guideWhatsNewSearchTitle'), body: t('guideWhatsNewSearchBody'), actionLabel: undefined, action: undefined },
    { icon: HelpCircle, title: t('guideWhatsNewStoreTitle'), body: t('guideWhatsNewStoreBody'), actionLabel: undefined, action: undefined },
  ] : [
    { icon: Search, title: t('guideSearchTitle'), body: t('guideSearchBody'), actionLabel: t('guideActionFocusSearch'), action: onFocusSearch },
    { icon: Sparkles, title: t('guideCanvasTitle'), body: t('guideCanvasBody'), actionLabel: t('guideActionOpenCanvas'), action: onOpenCanvas },
    { icon: Check, title: t('guideSyncTitle'), body: t('guideSyncBody'), actionLabel: undefined, action: undefined },
  ];
  const activeStep = steps[stepIndex]!;
  const ActiveIcon = activeStep.icon;
  const nextLabel = stepIndex === steps.length - 1
    ? (isWhatsNew ? t('guideGotIt') : t('guideStartUsing'))
    : t('guideNextStep');
  const handlePrimary = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((index) => Math.min(steps.length - 1, index + 1));
      return;
    }
    onDone();
  };
  const handleStepAction = () => {
    activeStep.action?.();
    if (stepIndex < steps.length - 1) {
      setStepIndex((index) => Math.min(steps.length - 1, index + 1));
    }
  };

  return (
    <aside
      className="product-guide"
      role="dialog"
      aria-modal="false"
      aria-labelledby="product-guide-title"
    >
      <header className="product-guide__header">
        <div>
          <small>{isWhatsNew ? t('guideWhatsNewEyebrow') : t('guideOnboardingEyebrow')}</small>
          <h2 id="product-guide-title">{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={t('close')}>
          <X size={16} />
        </button>
      </header>

      <div className="product-guide__progress" aria-label={t('guideProgress', [String(stepIndex + 1), String(steps.length)])}>
        {steps.map((step, index) => (
          <button
            key={step.title}
            type="button"
            className={index === stepIndex ? 'is-active' : ''}
            aria-label={t('guideGoToStep', String(index + 1))}
            aria-current={index === stepIndex ? 'step' : undefined}
            onClick={() => setStepIndex(index)}
          />
        ))}
      </div>

      <ol className="product-guide__steps" aria-live="polite">
        <li>
          <span className="product-guide__step-icon"><ActiveIcon size={17} /></span>
          <span>
            <strong>{activeStep.title}</strong>
            <small>{activeStep.body}</small>
          </span>
        </li>
      </ol>

      <footer className="product-guide__footer">
        {!isWhatsNew && (
          <button className="product-guide__skip" type="button" onClick={onClose}>
            {t('guideSkipForNow')}
          </button>
        )}
        {isWhatsNew && (
          <a className="secondary-button" href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">
            <Github size={15} />
            {t('guideGithubReleases')}
            <ExternalLink size={13} />
          </a>
        )}
        {!isWhatsNew && activeStep.action && stepIndex === steps.length - 1 && (
          <button className="secondary-button" type="button" onClick={handleStepAction}>
            {activeStep.actionLabel}
          </button>
        )}
        {stepIndex > 0 && (
          <button className="secondary-button" type="button" onClick={() => setStepIndex((index) => Math.max(0, index - 1))}>
            {t('guidePreviousStep')}
          </button>
        )}
        {!isWhatsNew && activeStep.action && stepIndex < steps.length - 1 ? (
          <button className="primary-button" type="button" onClick={handleStepAction}>
            {activeStep.actionLabel}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={handlePrimary}>
            {nextLabel}
          </button>
        )}
      </footer>
    </aside>
  );
}
