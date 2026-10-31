// The words of the viewer, the document preview and the gallery.

/**
 * @typedef {object} ViewerPreviewGalleryStrings
 * @property {string} viewerOpenNew  The viewer's "Open in a new tab" button (js/viewer.js) [kpadopt6-media]
 * @property {string} viewerDownload  The viewer's Download button [kpadopt6-media]
 * @property {string} viewerPrint  The viewer's Print button [kpadopt6-media]
 * @property {string} viewerCopyLink  The viewer's Copy link button [kpadopt6-media]
 * @property {string} viewerNoFile  The reason a viewer button is off when there is no file [kpadopt6-media]
 * @property {string} viewerLoading  The busy card's words while a file opens [kpadopt6-media]
 * @property {string} viewerFailedTitle  The failed stage's heading [kpadopt6-media]
 * @property {string} viewerFailedText  The failed stage's sentence when the server gave none [kpadopt6-media]
 * @property {string} viewerUnsupportedTitle  The heading of the stage that cannot show this kind of file here [kpadopt6-media]
 * @property {string} viewerUnsupportedText  Its sentence [kpadopt6-media]
 * @property {string} viewerRetry  The failed stage's Retry [kpadopt6-media]
 * @property {(index: number, total: number) => string} viewerPosition  The exact position in a set: "4 of 37" [kpadopt6-media]
 * @property {string} previewKeyGroup  The sheet's heading for the preview keys (js/docpreview.js) [kpadopt6-media]
 * @property {string} previewKeyOpen  The sheet's words for o [kpadopt6-media]
 * @property {string} previewKeyDownload  The sheet's words for d [kpadopt6-media]
 * @property {string} previewKeyPrint  The sheet's words for p [kpadopt6-media]
 * @property {string} previewKeyPrevious  The sheet's words for Left in a group of documents [kpadopt6-media]
 * @property {string} previewKeyNext  The sheet's words for Right in a group of documents [kpadopt6-media]
 * @property {string} previewTimeout  The sentence when a file takes too long to open [kpadopt6-media]
 * @property {string} previewGone  The sentence when the server says the file is gone [kpadopt6-media]
 * @property {(status: number) => string} previewServer  The sentence when the server answered with an error [kpadopt6-media]
 * @property {string} previewNoPdf  The sentence when this browser cannot show a PDF here [kpadopt6-media]
 * @property {string} previewShownByBrowser  The line under a PDF's title: how it is shown [kpadopt6-media]
 * @property {string} previewImage  The sentence when a picture would not load [kpadopt6-media]
 * @property {string} previewNoFile  The reason an opener is off when there is no file yet [kpadopt6-media]
 * @property {string} docKindImage  The facts word of a picture file [kpadopt6-media]
 * @property {string} docKindText  The facts word of a text file [kpadopt6-media]
 * @property {string} docMissing  The name of a document glyph whose file is missing [kpadopt6-media]
 * @property {(kind: string) => string} docKindName  The name of a document glyph: "PDF document" [kpadopt6-media]
 * @property {string} galleryContinue  The button that opens the picture last looked at (js/gallery.js) [kpadopt6-media]
 * @property {string} galleryFailed  The failed gallery's heading [kpadopt6-media]
 * @property {string} galleryFailedText  Its sentence [kpadopt6-media]
 * @property {string} galleryEmpty  The empty gallery's heading [kpadopt6-media]
 * @property {string} galleryEmptyText  Its sentence [kpadopt6-media]
 * @property {string} galleryEmptyAdd  Its sentence when pictures can be added [kpadopt6-media]
 * @property {string} galleryRetry  The Retry of a failed gallery or picture [kpadopt6-media]
 * @property {string} galleryAdd  The add tile's words [kpadopt6-media]
 * @property {string} galleryLoading  The busy card's words while the gallery loads [kpadopt6-media]
 * @property {string} galleryPicture  What a picture without a name is called [kpadopt6-media]
 * @property {(name: string) => string} galleryOpenPicture  The name of a tile that opens a picture [kpadopt6-media]
 * @property {(name: string) => string} galleryOpenVideo  The name of a tile that opens a video [kpadopt6-media]
 * @property {string} galleryPictureFailed  The heading of a picture that would not load [kpadopt6-media]
 * @property {string} galleryPictureFailedText  Its sentence in the lightbox [kpadopt6-media]
 * @property {(name: string) => string} galleryRetryPicture  The accessible name of a picture's Retry [kpadopt6-media]
 * @property {string} galleryPrevious  The lightbox's previous button [kpadopt6-media]
 * @property {string} galleryNext  The lightbox's next button [kpadopt6-media]
 * @property {string} galleryFirst  The reason previous is off at the first picture [kpadopt6-media]
 * @property {string} galleryLast  The reason next is off at the last picture [kpadopt6-media]
 * @property {string} galleryKeyGroup  The sheet's heading for the lightbox keys [kpadopt6-media]
 * @property {string} galleryKeyPrevious  The sheet's words for Left [kpadopt6-media]
 * @property {string} galleryKeyNext  The sheet's words for Right [kpadopt6-media]
 * @property {string} galleryKeyFirst  The sheet's words for Home [kpadopt6-media]
 * @property {string} galleryKeyLast  The sheet's words for End [kpadopt6-media]
 * @property {string} galleryKeyZoom  The sheet's words for z [kpadopt6-media]
 * @property {string} galleryKeyZoomIn  The sheet's words for + [kpadopt6-media]
 * @property {string} galleryKeyZoomOut  The sheet's words for - [kpadopt6-media]
 * @property {string} galleryKeyFull  The sheet's words for f [kpadopt6-media]
 */

/** @type {ViewerPreviewGalleryStrings} */
export const VIEWER_PREVIEW_GALLERY_STRINGS = {
    viewerOpenNew: 'Open in a new tab',
    viewerDownload: 'Download',
    viewerPrint: 'Print',
    viewerCopyLink: 'Copy link',
    viewerNoFile: 'No file yet',
    viewerLoading: 'Opening…',
    viewerFailedTitle: 'Could not open this file',
    viewerFailedText: 'Nothing was changed. You can still open it in a new tab or download it.',
    viewerUnsupportedTitle: 'This browser cannot show it here',
    viewerUnsupportedText: 'Open it in a new tab or download it instead.',
    viewerRetry: 'Retry',
    viewerPosition: (index, total) => `${index} of ${total}`,
    previewKeyGroup: 'In a document preview',
    previewKeyOpen: 'Open the file in a new tab',
    previewKeyDownload: 'Download the file',
    previewKeyPrint: 'Print the file',
    previewKeyPrevious: 'Previous document',
    previewKeyNext: 'Next document',
    previewTimeout: 'The file took too long to open.',
    previewGone: 'The server says this file is gone.',
    previewServer: (status) => `The server could not give the file (error ${status}).`,
    previewNoPdf: 'This browser cannot show PDFs here. Open the file in a new tab or download it.',
    previewShownByBrowser: "Shown by your browser's PDF viewer",
    previewImage: 'The picture could not be loaded.',
    previewNoFile: 'No file yet',
    docKindImage: 'Picture',
    docKindText: 'Text',
    docMissing: 'No file yet',
    docKindName: (kind) =>
        ({ pdf: 'PDF document', doc: 'Word document', sheet: 'Spreadsheet', image: 'Picture', text: 'Text file' })[kind] ?? 'Document',
    galleryContinue: 'Continue where you were',
    galleryFailed: 'The pictures could not be loaded',
    galleryFailedText: 'Nothing was changed. Try again in a moment.',
    galleryEmpty: 'No pictures yet',
    galleryEmptyText: 'Pictures added here will show up as small tiles.',
    galleryEmptyAdd: 'Add the first ones and they will show up as small tiles.',
    galleryRetry: 'Retry',
    galleryAdd: 'Add pictures',
    galleryLoading: 'Loading the pictures…',
    galleryPicture: 'Picture',
    galleryOpenPicture: (name) => `Open picture: ${name}`,
    galleryOpenVideo: (name) => `Play video: ${name}`,
    galleryPictureFailed: 'Could not load this picture',
    galleryPictureFailedText: 'The other pictures still work: use the arrows.',
    galleryRetryPicture: (name) => `Retry loading ${name}`,
    galleryPrevious: 'Previous picture',
    galleryNext: 'Next picture',
    galleryFirst: 'This is the first picture',
    galleryLast: 'This is the last picture',
    galleryKeyGroup: 'In the picture viewer',
    galleryKeyPrevious: 'Previous picture',
    galleryKeyNext: 'Next picture',
    galleryKeyFirst: 'First picture',
    galleryKeyLast: 'Last picture',
    galleryKeyZoom: 'Zoom to 100 % and back',
    galleryKeyZoomIn: 'Zoom in',
    galleryKeyZoomOut: 'Zoom out',
    galleryKeyFull: 'Full screen',
};
