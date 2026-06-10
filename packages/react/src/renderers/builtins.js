import Markdown from "./Markdown.jsx";
import DataTable from "./DataTable.jsx";
import Cards from "./Cards.jsx";
import KeyValue from "./KeyValue.jsx";

/**
 * Built-in render kinds, keyed by content shape, not domain.
 * Value shapes are documented in docs/render-kinds.md.
 */
export const BUILTIN_RENDERERS = {
  markdown: Markdown,
  table: DataTable,
  cards: Cards,
  keyvalue: KeyValue,
};
