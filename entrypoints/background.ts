import { defineBackground } from 'wxt/sandbox';
import { recordInstallationEvent } from '../src/onboarding/onboardingState';
import { installCaptureMessageListener } from '../src/capture/captureBackground';

export default defineBackground(() => {
  installCaptureMessageListener();
  chrome.runtime.onInstalled.addListener((details) => {
    const version = chrome.runtime.getManifest().version;
    void recordInstallationEvent({
      reason: details.reason,
      version,
      previousVersion: details.previousVersion,
    }).catch((error) => {
      console.warn('Unable to record the Bookmark Atlas install/update state.', error);
    });
  });
});
