// Page settings for the shop's document layouts - the invoice, the credit note
// and the proforma - and the region the PDF footer is rendered into.
//
// ALL OF IT IS CORE'S NOW (lib/documents/page-settings.tsx). What used to be
// written out here was copied wholesale into Quote for Shop, and would have been
// copied a third time by the first module to print anything else; an invoice, a
// quote and a purchase order are one filing cabinet, and none of them should
// have to bring its own idea of what A4 is.
//
// This file stays, as a set of aliases, for one reason and it is not sentiment:
// the generated lib/puck/module-layout-roots.ts imports `shopDocPageSettings`
// FROM HERE by name, from this module's own manifest, and half a dozen files
// across shop and Quote for Shop import the rest. Renaming all of that to point
// at core would be a large diff whose only effect is a different import path.
//
// The footer's own aliases have gone: `shopDocumentFooter` retired into core's
// `documentFooter` (migration 030), so nothing names them any more and core's
// own exports are what a footer reaches for.
//
// CLIENT-SAFE, and it has to stay that way: reached from the Puck editor bundle
// as well as from the server.

export {
  PDF_FOOTER_REGION_ID,
  DOC_PAGE_DEFAULTS,
  docPageSetup,
  docPageSetupFromLayout,
  DocumentFooterRegion as PdfFooterRegion,
  DocumentPageStyle as ShopDocPageStyle,
  documentPageSettings as shopDocPageSettings,
  type DocPageProps,
  type DocPageSetup,
} from '@/lib/documents/page-settings'
