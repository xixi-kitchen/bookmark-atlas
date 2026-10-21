/** Distribution must retain the entire dependency license, not just its name. */
export function assertLicenseNotice(notices, license) {
  if (typeof notices !== 'string' || typeof license !== 'string' || !license.trim() || !notices.includes(license.trim())) {
    throw new Error('Missing or incomplete bundled dependency license notice.');
  }
}
