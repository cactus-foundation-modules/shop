/**
 * Tags out, entities in, whitespace collapsed.
 *
 * Shared by the three readers of a courier's tracking page rather than copied
 * into each: they are reading one document, and a copy that learns about one
 * more entity than its twin makes two parsers that disagree about what the same
 * page says.
 */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
