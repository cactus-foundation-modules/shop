-- The shop's own PDF footer layout type retires into core's.
--
-- `shopDocumentFooter` was the shop's, from before core had a document footer at
-- all. Core has one now - `documentFooter` - and every module that prints
-- paperwork shares it, so the shop's copy was a second entry in the Layouts
-- screen printing on exactly the same documents as the first. An owner looking
-- at "Document Footer" and "PDF footer" side by side has a choice nobody can
-- make correctly.
--
-- So the type goes, and anything designed under it comes with it. Without this,
-- an owner's footer would still be sat in the Layout table under a type no
-- editor can open and no document resolves: invisible everywhere but the
-- database, which is the worst place for a thing somebody spent an afternoon on.
--
-- The blocks on it need nothing done. `ShopInvoiceFooter`, `ShopInvoicePageNumber`
-- and the rest are registered for `documentFooter` as well, so the saved
-- builderData renders on the new type exactly as it did on the old one.
--
-- Idempotent: run twice and the second pass matches no rows.

-- A published footer under the OLD type only wins if there is not already a
-- published one under the new type. Two published layouts of the same type both
-- matching "entire site" is a coin toss decided by priority and update time, and
-- an owner who has already built the replacement should not have yesterday's
-- turn up alongside it. Theirs stays published; the old one arrives as a draft,
-- still there to look at, no longer printing.
UPDATE "Layout"
SET "type" = 'documentFooter',
    "status" = CASE
      WHEN "status" = 'published'::"PageStatus"
       AND EXISTS (
         SELECT 1 FROM "Layout" existing
         WHERE existing."type" = 'documentFooter' AND existing."status" = 'published'::"PageStatus"
       )
      THEN 'draft'::"PageStatus"
      ELSE "status"
    END
WHERE "type" = 'shopDocumentFooter';
