import { defineBackground } from 'wxt/sandbox';
import { installNativeOrganizationListener } from '../src/bookmarks/organization/background';
import { recordInstallationEvent } from '../src/onboarding/onboardingState';
import { installCaptureMessageListener } from '../src/capture/captureBackground';

export default defineBackground(() => {
  installCaptureMessageListener();
  installNativeOrganizationListener();
  chrome.runtime.onInstalled.addListener((details) => {
    const { version, version_name: displayVersion } = chrome.runtime.getManifest();
    // Unpacked test builds share the same numeric version across revisions.
    const isTestBuild = displayVersion?.startsWith(`${version}-test.`) === true;
    void recordInstallationEvent({
      reason: details.reason,
      version,
      previousVersion: details.previousVersion,
      announceAIOrganization: details.reason === 'install'
        || (details.reason === 'update' && (isTestBuild || details.previousVersion !== version)),
    }).catch((error) => {
      console.warn('Unable to record the Bookmark Atlas install/update state.', error);
    });
  });
});
