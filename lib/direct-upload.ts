import { MAX_DIRECT_UPLOAD_BYTES, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/lib/media/limits'

// ---------------------------------------------------------------------------
// Admin uploads too big to post through the site.
//
// Two shop uploads carry files an owner can reasonably have at more than 4 MB:
// the file a digital product sells, and a product sheet with long descriptions
// in it. Both are posted to a module route as a form, and the hosting platform
// refuses any request body over 4.5 MB before the route ever runs - so a 6 MB
// PDF could not be sold at all, whatever the route said about it.
//
// Core already has the way round this, built for the media library
// (app/api/admin/media/upload-url and /record): the site signs a short-lived
// token bound to one exact storage key, the browser PUTs the bytes straight to
// the media Worker, and only then comes back with the key and the token so the
// site can check what landed. The unified inbox uses the same door for large
// attachments. This is the shop's use of it, under a folder of its own.
//
// Files at or under the old ceiling still go the way they always have. The
// direct path needs S3-style storage and the media Worker, and a Worker deployed
// before opaque `.bin` objects were allowed refuses them; none of that should
// stop a small file that has always uploaded fine.
//
// Pure and free of server imports on purpose: the browser refuses a file before
// sending it and the routes refuse it again on arrival, and both have to give the
// same answer for the same reason.
// ---------------------------------------------------------------------------

/**
 * The shop's own folder in storage, under the provider's media prefix.
 *
 * Deliberately not "shop": that is what the media library's own Shop folder
 * becomes as a storage path, and these files are not library items. Keeping them
 * apart means a folder of product photographs never has somebody's sheet or
 * download sitting in it.
 */
export const SHOP_UPLOAD_FOLDER = 'shop-files'

/** What the upload is for, and so which sub-folder it lands in. */
export type ShopUploadPurpose = 'downloads' | 'imports'

/**
 * Directly uploaded files are stored as opaque bytes. The Worker types an object
 * by its key's extension and nothing else, and it only takes the extensions it
 * knows; `.bin` is the one it offers for this, and it serves one as an inert
 * download rather than rendering it. The file's real name and type live in the
 * shop's own row - see the digital-download route, which sends the row's type.
 */
export const DIRECT_UPLOAD_EXTENSION = 'bin'
export const DIRECT_UPLOAD_CONTENT_TYPE = 'application/octet-stream'

/**
 * The most a digital product's file may weigh. Set by the way DOWN rather than
 * the way up: a buyer's download streams through the shop's own route, which a
 * module route gets sixty seconds for (the gate that stops a download link being
 * passed round depends on it), so a file has to finish in that minute on an
 * ordinary connection. Twenty megabytes needs under 3 Mbit/s; the direct path's
 * own fifty would have cut off everybody on a slower line part-way through -
 * handing their go back, but never their file. Anything bigger is refused
 * before a byte moves.
 */
export const DIGITAL_FILE_MAX_BYTES = Math.min(20 * 1024 * 1024, MAX_DIRECT_UPLOAD_BYTES)
export const DIGITAL_FILE_MAX_MB = DIGITAL_FILE_MAX_BYTES / 1024 / 1024

/**
 * The most a product sheet may weigh.
 *
 * Lower than the direct path allows, because unlike a download a sheet is read
 * back into the function whole, turned into text and parsed - twice, once to
 * count the rows and once to import them - all inside the sixty seconds the
 * import shares with its request. Five times what the old route could carry is
 * a very long catalogue, and a bigger one is kinder split than half-imported.
 */
export const IMPORT_CSV_MAX_BYTES = 20 * 1024 * 1024
export const IMPORT_CSV_MAX_MB = IMPORT_CSV_MAX_BYTES / 1024 / 1024

/** Said after every "too big" about a sheet, because it is the fix. */
export const SPLIT_THE_SHEET = 'Split the sheet into smaller files and import them one after another.'

/**
 * Whether this file has to go straight to storage rather than through the site.
 * Anything the site's own request body can still carry goes the old way.
 */
export function needsDirectUpload(sizeBytes: number): boolean {
  return sizeBytes > MAX_UPLOAD_BYTES
}

/**
 * The part of the key that is the file's own name, cut down to characters that
 * survive a url unchanged.
 *
 * That last part is the whole point. The upload token signs the key as a string,
 * and the Worker checks it against the path it was sent to - so a space, an
 * accent or a plus sign that the browser percent-encodes on the way out arrives
 * as a different key from the one that was signed, and the upload is refused as
 * unauthorised. The name is only here so a person looking in the bucket can tell
 * one file from another; the owner's own spelling of it is kept in the shop's
 * row, not in the key.
 */
export function keyNameFor(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  const cleaned = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    // No leading dots or hyphens: a name that is all dots is a path segment
    // nobody should be building, and a hidden-file name helps nobody here.
    .replace(/^[.-]+/, '')
    .slice(0, 80)
    .replace(/[.-]+$/, '')
  return cleaned || 'file'
}

/** The folder one purpose's uploads land in, e.g. "media/R2/shop-files/downloads/". */
export function shopUploadDirectory(keyPrefix: string, purpose: ShopUploadPurpose): string {
  return `${keyPrefix}${SHOP_UPLOAD_FOLDER}/${purpose}/`
}

/**
 * The key a direct upload is signed for. `keyPrefix` is the provider's media
 * prefix (mediaKeyPrefix in lib/media/upload.ts), passed in so this file stays
 * clear of the server-side media code. The upload id is a random UUID, so the key
 * cannot be guessed: the Worker serves any key it holds to whoever asks for it,
 * and the gated download route is only a gate if nobody can find the file
 * without it.
 */
export function buildShopUploadKey(keyPrefix: string, purpose: ShopUploadPurpose, uploadId: string, filename: string): string {
  return `${shopUploadDirectory(keyPrefix, purpose)}${uploadId}-${keyNameFor(filename)}.${DIRECT_UPLOAD_EXTENSION}`
}

const UPLOAD_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether `key` is one this purpose would have signed for a file of this name.
 *
 * Checked before anything is asked of storage or written to a row, so a caller
 * cannot point the shop at an object somewhere else in the bucket - another
 * module's private file, a library photograph - or at a url off the site
 * entirely. The token proves the site issued the key; this proves it was issued
 * here, for this, and for this file.
 */
export function isShopUploadKey(key: string, keyPrefix: string, purpose: ShopUploadPurpose, filename: string): boolean {
  const directory = shopUploadDirectory(keyPrefix, purpose)
  if (!key.startsWith(directory)) return false
  const rest = key.slice(directory.length)
  const shape = new RegExp(`^${UPLOAD_ID}-${escapeRegExp(keyNameFor(filename))}\\.${DIRECT_UPLOAD_EXTENSION}$`)
  return shape.test(rest)
}

/** A size in the units a person uses, to one decimal place. */
function describeMb(sizeBytes: number): string {
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Why a file over the old ceiling cannot go up on this site at all: its storage
 * cannot take a file from the browser directly. Names the fix rather than just
 * the number, because the number is not the owner's problem to solve.
 */
export function directUnavailableMessage(file: { name: string; size: number }): string {
  return `"${file.name}" is ${describeMb(file.size)}. This site's file storage can only take files up to ${MAX_UPLOAD_MB} MB here - bigger ones need Cloudflare R2, Backblaze B2 or S3 storage with the media service deployed (see Settings → Media).`
}

/**
 * What an out-of-date media Worker means for the owner. One deployed before the
 * direct path took opaque files refuses them outright, and it only picks up new
 * code when somebody redeploys it.
 */
export const WORKER_OUTDATED_MESSAGE =
  'Your media service needs updating before it will take files this big. Go to Settings → Media and deploy the Worker again, then try once more.'
