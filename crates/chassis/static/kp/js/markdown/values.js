// The limit, the heading levels and the patterns of the markdown reader.

/** The longest note drawn, in characters. */
export const MARKDOWN_LIMIT = 40_000;
/** The deepest heading level HTML has. */
export const MAX_HEADING_LEVEL = 6;
/** The level a `#` heading is written at when the page names none. */
export const DEFAULT_HEADING_LEVEL = 4;
/** The width a tab counts as in a list's indent, in spaces. */
export const TAB_WIDTH = 4;

/** A list item: its indent, its marker and its text. */
export const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

/** The inline forms; the earliest in a line wins and what is left of it is text. */
export const INLINE_FORMS = [
    { name: 'code', re: /`([^`]+)`/ },
    { name: 'image', re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/ },
    { name: 'link', re: /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/ },
    { name: 'auto', re: /<((?:https?:\/\/|mailto:)[^>\s]+)>/ },
    { name: 'bold', re: /\*\*([^*]+)\*\*|__([^_]+)__/ },
    { name: 'italic', re: /(?<![\w*])\*([^*\s][^*]*)\*(?!\w)|(?<![\w_])_([^_\s][^_]*)_(?!\w)/ },
];
