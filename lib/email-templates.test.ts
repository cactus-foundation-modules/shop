import { describe, it, expect } from 'vitest'
import { shopEmailTemplates } from '@/modules/shop/lib/email-templates'

// Core fills these on every render, so no template declares them.
const SITE_TAGS = new Set(['siteName', 'siteUrl', 'logoUrl', 'year'])

function tagsIn(body: string): string[] {
  return [...body.matchAll(/\{\{(?:#if )?(\w+)\}\}/g)]
    .map((m) => m[1])
    .filter((tag): tag is string => Boolean(tag))
}

describe('shop email template defaults', () => {
  // The bug this exists for: shop.credit-note-issued carried a
  // {{#if hasReason}} block for months and nothing ever passed hasReason, so
  // the reason a refund was given was never once printed. A conditional whose
  // flag is missing drops silently, and no other check in the repo looks.
  it.each(shopEmailTemplates.map((t) => [t.key, t] as const))(
    '%s declares every tag its own default body uses',
    (_key, template) => {
      const undeclared = tagsIn(template.bodyHtml)
        .filter((tag) => !SITE_TAGS.has(tag))
        .filter((tag) => !template.mergeTags.includes(tag))
      expect(undeclared).toEqual([])
    },
  )

  it.each(shopEmailTemplates.map((t) => [t.key, t] as const))(
    '%s declares every tag its own subject uses',
    (_key, template) => {
      const undeclared = tagsIn(template.subject)
        .filter((tag) => !SITE_TAGS.has(tag))
        .filter((tag) => !template.mergeTags.includes(tag))
      expect(undeclared).toEqual([])
    },
  )

  // rawTags go into the body unescaped, so each one must actually be markup the
  // sending code assembles - never a value passed through from a form.
  it('only marks tags as raw that the template also merges', () => {
    for (const template of shopEmailTemplates) {
      for (const raw of template.rawTags ?? []) {
        expect(template.mergeTags, `${template.key} rawTags`).toContain(raw)
      }
    }
  })

  it('keeps every key inside the shop namespace', () => {
    for (const template of shopEmailTemplates) {
      expect(template.key.startsWith('shop.'), template.key).toBe(true)
    }
  })
})
