import { describe, expect, it } from 'vitest';
import { assertLicenseNotice } from '../../scripts/lib/license-notice.mjs';

describe('bundled dependency license notice', () => {
  const license = 'The MIT License\n\nCopyright (c) Example Author\n\nPermission to distribute.';
  it('rejects a missing license instead of accepting just the dependency name', () => {
    expect(() => assertLicenseNotice('Driver.js: MIT', license)).toThrow('license notice');
  });
  it('rejects a truncated license even when copyright is present', () => {
    expect(() => assertLicenseNotice('The MIT License\n\nCopyright (c) Example Author', license)).toThrow('license notice');
  });
  it('accepts an intact license inside a human-readable attribution document', () => {
    expect(() => assertLicenseNotice(`Third-party component\n${license}\n`, license)).not.toThrow();
  });
});
