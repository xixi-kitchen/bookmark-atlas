# Edge 0.9.7 dependency review

Date: 2026-10-26. Scope: the production candidate and its locked dependency tree. This is a bounded maintenance assessment, not store security certification or an assertion of zero vulnerabilities.

## Changes before packaging

- Override DOMPurify to **3.4.17** and lodash-es to **4.18.1**, retaining the existing Excalidraw, Mermaid, WXT and Vitest versions.
- Comparing the old and new lockfiles showed only those two dependency-version changes, plus the root package version0.9.6→0.9.7. No new direct dependency or browser permission.
- DOMPurify3.4.13 was present in the previous Edge chunks, so its advisory could not be dismissed as build-only. The [upstream3.4.17 release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17) fixes the [SAFE_FOR_TEMPLATES/shadow-root issue](https://github.com/advisories/GHSA-cg2g-xh64-v4q7). Mermaid's normal string-in/string-out sanitize options did not use that advisory's full trigger combination; the compatible patch was nevertheless applied.
- Some consumers pin lodash-es4.17.21 exactly, so a targeted override was required. [Upstream template-import injection](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) and [unset/omit pollution](https://github.com/advisories/GHSA-f23m-r3pf-42rh) fixes are included. No inspected production consumer used those three named imports; that was exposure evidence, not a substitute for the patch.

## Residual findings

Fresh `npm audit --omit=dev` after installation reports **6 aggregated entries: 0 critical, 2 high, 2 moderate, 2 low**. Aggregated parent/child entries are not six independent confirmed exploits.

- **nanoid3.3.3/4.0.2:** included in Excalidraw's production chain. Inspected calls use default `nanoid()` or fixed `nanoid(40)`; no user-controlled size, customAlphabet/customRandom or non-secure generator call was found. Invalid-size advisory conditions were not observed. Exact upstream pins, and absence of a fixed4.x release, require a separately tested migration; no forced major upgrade was made. This is current-use mitigation evidence, not zero risk. [Invalid size](https://github.com/advisories/GHSA-mwcw-c2x4-8c55), [negative non-secure size](https://github.com/advisories/GHSA-28wg-ghj8-5hjv).
- **KaTeX0.16.47:** [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) is low, CVSS4 2.1; it needs pre-existing renderer-options/prototype pollution and attacker-controlled math. KaTeX does not itself create that pollution. Mermaid does not explicitly set trust; it applies DOMPurify before insertion. Isolated jsdom/real-Mermaid string tests removed a tested javascript href in MathML and legacy paths even after simulated inherited trust; an includegraphics HTTPS URL survived. Therefore the sanitizer is not proof against all externally loaded resources if trust has already been polluted. No reachable application pollution entry was found in this review. No resource was requested in these tests. The0.18.2 fix is outside the upstream0.16 range and remains a compatibility follow-up.
- **source-map-js1.2.1:** marked production in the install tree via Excalidraw→Sass, but used in a build chain. Its [indexed source-map denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) needs malicious section offsets to be processed. No application source-map input path or matching consumer implementation marker was found in the Edge chunks. Do not call that absence a proof of universal non-reachability. Compatible1.2.2 is a future tooling-maintenance option.
- Other critical entries in the full development-tree audit belong to WXT/Vitest tooling rather than browser payload. Validation uses `vitest run`, not an exposed Vitest UI/API server. They remain tracked development-dependency maintenance; no `npm audit fix --force` or untested toolchain major upgrade was executed.

## Verification boundary

Fresh locked installs, typecheck, full tests and Edge packaging are release-owner checks. The independent dependency reviewer inspected actual imports/options and produced the harmless string experiments above; it did not perform user device acceptance or certify the store package. Two-device Edge synchronization remains a separate pending owner test.

The already published Chrome0.9.6 package was not replaced. These source-level fixes can be considered for a separately authorized Chrome release.

## Rejected interim candidate

Independent review caught that lodash-es4.18.0 was deprecated as a bad module build. That interim ZIP (SHA256530ad6101c43b88c93e9eaeb3816cfc6da9db06a9167da45025133c16c5384b8) was not uploaded. The [official4.18.1 release](https://github.com/lodash/lodash/releases/tag/4.18.1) repairs the module regression while retaining the security fixes. Final verification must use4.18.1; do not restore the deprecated interim archive.
