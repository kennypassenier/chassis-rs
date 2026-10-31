// A small, safe markdown reader for release notes and changelogs [wish-1120, homelab 113].
//
// The text of a release note comes from somebody else's repository, so it is never put into the page as HTML: this module builds the
// DOM node by node from the text, and everything it does not know stays text. What it reads:
//
//   # Heading … ###### Heading      headings, written at a level of the page's choosing (`headings`, default 4: "#" becomes an h4)
//   a paragraph over lines          one `p`
//   - item  * item  + item  1. item  lists, nested by two or more spaces of indent
//   > quoted                        a blockquote
//   ```fenced code```               `pre > code`, the text as it stands
//   ---                             a rule
//   **bold**  *italic*  _italic_  `code`  [text](https://…)  <https://…>
//
// A link keeps its address only when it is `http`, `https` or `mailto`, or a relative or `#` address; `javascript:`, `data:` and the
// rest are left as the words they were written as. An external link opens in a new tab with `rel="noopener noreferrer"` and says so
// to a screen reader. An image is its alt text. Raw HTML is text. A note longer than `limit` characters is cut at a line and says so.
// Every word it adds is in js/strings.js. Nothing runs on import.

// The module is a facade [closure-pattern B, Kenny 2026-10-30]: the names and patterns, the inline reader, and the block reader
// (a MarkdownReader per text) live in js/markdown/, listed in js/README.md.

export { MARKDOWN_LIMIT } from './markdown/values.js';
export { safeHref } from './markdown/inline.js';
export { markdownFragment } from './markdown/reader.js';

/**
 * @typedef {object} MarkdownOptions
 * @property {number} [headings] the level a `#` heading is written at, 1 to 6 (default 4); deeper headings follow, to 6
 * @property {number} [limit] the most characters read (default 40 000); more is cut at a line with a sentence saying so
 */
