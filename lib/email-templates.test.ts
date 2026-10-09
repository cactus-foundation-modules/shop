import { describe, it, expect } from 'vitest'
import { shopEmailTemplates } from '@/modules/shop/lib/email-templates'
import { shopSmsTemplates } from '@/modules/shop/lib/sms-templates'

// Core fills these on every render, so no template declares them.
const SITE_TAGS = new Set(['siteName', 'siteUrl', 'logoUrl', 'year'])

function tagsIn(body: string): string[] {
  return [...body.matchAll(/\{\{(?:#if )?(\w+)\}\}/g)]
    .map((m) => m[1])
    .filter((tag): tag is string => Boolean(tag))
}

/** The first {{#if}} that core's applyConditionals would mangle, or null. It
 *  is a non-greedy regex, so an outer block closes at the first inner {{/if}}
 *  and the rest of it leaks into the email; a stray {{/if}} or an unclosed
 *  {{#if}} is never matched at all and goes out as typed. */
function nestedIf(text: string): string | null {
  let open: string | null = null
  for (const m of text.matchAll(/\{\{#if (\w+)\}\}|\{\{\/if\}\}/g)) {
    if (m[1]) {
      if (open) return `{{#if ${m[1]}}} inside {{#if ${open}}}`
      open = m[1]
    } else {
      if (!open) return 'stray {{/if}}'
      open = null
    }
  }
  return open ? `{{#if ${open}}} never closed` : null
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

  // shop.charge-raised nested its cancellation lines inside {{#if canCancel}}
  // and every customer got raw {{#if}} markers or a stray {{/if}}. Combine the
  // flags in the sender instead.
  it.each([
    ...shopEmailTemplates.flatMap((t) => [
      [`${t.key} subject`, t.subject],
      [`${t.key} body`, t.bodyHtml],
    ]),
    ...shopSmsTemplates.map((t) => [`${t.key} sms`, t.body]),
  ] as [string, string][])('%s has no nested or unbalanced {{#if}}', (_where, text) => {
    expect(nestedIf(text)).toBeNull()
  })
})
