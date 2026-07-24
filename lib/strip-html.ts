// Reduces an HTML-bearing string to plain text for contexts that must never
// carry markup (JSON-LD description) - some Deskwell-imported product
// descriptions embed a supplier <iframe>/<script> block, and search engines
// should see the words, not the tags.
export function stripHtmlToPlainText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
