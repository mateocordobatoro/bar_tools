# Dependency security review

Reviewed on 2026-09-17 during development setup.

The initial audit reported two affected packages: direct dependency
`next@15.5.25` (moderate, inherited from PostCSS) and transitive dependency
`postcss@8.4.31` (high). The dependency path was
`barthings → next@15.5.25 → postcss@8.4.31`.

PostCSS was affected by four advisories:

| Advisory | Severity | Vulnerability | First patched version |
| --- | --- | --- | --- |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | Moderate | Unescaped `</style>` in CSS output can enable XSS when embedded in HTML. | 8.5.10 |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | High | Attacker-controlled CSS source-map annotations can read local files and disclose content. | 8.5.12 |
| [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) | High | Source-map path traversal can disclose arbitrary `.map` files. | 8.5.18 |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | Moderate | An incomplete fix permits arbitrary `.map` reads when `from` is unset. | 8.5.23 |

## Fix and maintenance

Next.js 15.5.25 pins PostCSS to 8.4.31. npm's proposed automatic fix was
Next.js 16.3.5, a major upgrade. Instead, `package.json` overrides Next.js's
PostCSS dependency to 8.5.23, which addresses all four advisories while staying
within PostCSS 8. No major dependency upgrades or forced audit fixes were used.
The lockfile records the patched version. Revisit the override when upgrading
Next.js; remove it once the upstream dependency is patched and audit is clean.

## Exposure in this scaffold

PostCSS is installed through a production dependency, so it is included in npm's
production dependency audit. Its observed use here is Next.js CSS compilation
during development and production builds. The application uses repository-owned
CSS and has no route that accepts or transforms user-supplied CSS. Based on the
current code, these were build/development-tooling exposures, with no identified
application request-time exploit path. Reassess if runtime CSS processing or
untrusted stylesheet inputs are added.

## Validation

After the override, `npm ci`, `npm run typecheck`, and `npm run build` passed.
`npm audit` reported zero vulnerabilities across the full dependency tree.
`npm ls next postcss` confirmed Next.js 15.5.25 uses PostCSS 8.5.23. No known
audit findings remain in either runtime dependencies or development tooling.
