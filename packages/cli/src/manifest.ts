// A project's template.json, checked against the template manifest schema of
// the Content API contract (vendored as @backgold/contract, a private
// workspace package; tsup bundles the schema and zod into dist, so the
// published CLI depends on neither). `audience` places a template in
// BackGold's gallery, which a custom site is never in, so it is not checked.
import { siteTemplateManifestSchema } from '@backgold/contract/site-templates'

const customSiteManifestSchema = siteTemplateManifestSchema.omit({ audience: true })

/** Each problem with `manifest` as `path: message`, one per line; null when it parses. */
export function templateManifestProblems(manifest: unknown): string | null {
  const result = customSiteManifestSchema.safeParse(manifest)
  if (result.success) return null
  return result.error.issues.map((issue) => `${issue.path.length ? issue.path.join('.') : '(manifest)'}: ${issue.message}`).join('\n')
}
