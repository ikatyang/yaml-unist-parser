import assert = require("assert");
import LinesAndColumns from "lines-and-columns";
import YAML from "yaml";
import { createAnchor } from "./factories/anchor";
import { createComment } from "./factories/comment";
import { createNonSpecificTag } from "./factories/non-specific-tag";
import { createShorthandTag } from "./factories/shorthand-tag";
import { createVerbatimTag } from "./factories/verbatim-tag";
import { tranformAlias } from "./transforms/alias";
import { tranformBlockFolded } from "./transforms/blockFolded";
import { tranformBlockLiteral } from "./transforms/blockLiteral";
import { transformComment } from "./transforms/comment";
import { transformDirective } from "./transforms/directive";
import { transformDocument } from "./transforms/document";
import { transformFlowMap } from "./transforms/flowMap";
import { transformFlowSeq } from "./transforms/flowSeq";
import { transformMap } from "./transforms/map";
import { transformMapKey } from "./transforms/mapKey";
import { transformMapValue } from "./transforms/mapValue";
import { transformPlain } from "./transforms/plain";
import { transformQuoteDouble } from "./transforms/quoteDouble";
import { transformQuoteSingle } from "./transforms/quoteSingle";
import { transformRange } from "./transforms/range";
import { transformSeq } from "./transforms/seq";
import { transformSeqItem } from "./transforms/seqItem";
import {
  Alias,
  BlockFolded,
  BlockLiteral,
  Comment,
  Content,
  Directive,
  Document,
  FlowMapping,
  FlowSequence,
  Mapping,
  MappingKey,
  MappingValue,
  Plain,
  Point,
  Position,
  QuoteDouble,
  QuoteSingle,
  Sequence,
  SequenceItem,
  YamlUnistNode,
} from "./types";
import { defineParent } from "./utils";

export type YamlNode =
  | null
  | YAML.cst.Alias
  | YAML.cst.BlockValue
  | YAML.cst.Comment
  | YAML.cst.Directive
  | YAML.cst.Document
  | YAML.cst.FlowCollection
  | YAML.cst.Map
  | YAML.cst.PlainValue
  | YAML.cst.QuoteValue
  | YAML.cst.Seq
  | YAML.cst.MapItem
  | YAML.cst.SeqItem;

// prettier-ignore
export type YamlToUnist<T extends YamlNode> =
  T extends null ? null :
  T extends YAML.cst.Alias ? Alias :
  T extends YAML.cst.BlockValue ? BlockLiteral | BlockFolded :
  T extends YAML.cst.Comment ? Comment :
  T extends YAML.cst.Directive ? Directive :
  T extends YAML.cst.Document ? Document :
  T extends YAML.cst.FlowCollection ? FlowMapping | FlowSequence :
  T extends YAML.cst.Map ? Mapping :
  T extends YAML.cst.PlainValue ? Plain :
  T extends YAML.cst.QuoteValue ? QuoteDouble | QuoteSingle :
  T extends YAML.cst.Seq ? Sequence :
  T extends YAML.cst.MapItem ? MappingKey | MappingValue :
  T extends YAML.cst.SeqItem ? SequenceItem :
  never;

export interface Context {
  text: string;
  comments: Comment[];
  locator: LinesAndColumns;
  transformNode: <T extends YamlNode>(node: T) => YamlToUnist<T>;
  transformRange: (range: { start: number; end: number }) => Position;
  transformOffset: (offset: number) => Point;
}

export function transformNode<T extends YamlNode>(
  node: T,
  context: Context,
): YamlToUnist<T>;
export function transformNode(node: YamlNode, context: Context): YamlUnistNode {
  if (node === null) {
    return null;
  }

  const transformedNode = _transformNode(node, context);

  if (transformedNode.type === "comment") {
    return transformedNode;
  }

  let newStartOffset = -1;
  const commentRanges: YAML.cst.Range[] = [];

  let tagRange: YAML.cst.Range | null = null;
  let anchorRange: YAML.cst.Range | null = null;

  node.props.forEach(prop => {
    const char = context.text[prop.start];
    switch (char) {
      case "!": // tag
      case "&": // anchor
        if (
          prop.start <
          (newStartOffset !== -1
            ? newStartOffset
            : transformedNode.position.start.offset)
        ) {
          newStartOffset = prop.start;
        }
        if (char === "!") {
          tagRange = prop;
        } else {
          anchorRange = prop;
        }
        break;
      case "#": // comment
        commentRanges.push(prop);
        break;
      // istanbul ignore next
      default:
        throw new Error(`Unexpected leading character ${JSON.stringify(char)}`);
    }
  });

  commentRanges.forEach(commentRange => {
    const { start, end } = commentRange;

    const comment = createComment(
      transformRange(commentRange, context),
      context.text.slice(commentRange.start + 1, commentRange.end),
    );

    if (
      "middleComments" in transformedNode &&
      newStartOffset !== -1 &&
      newStartOffset <= start &&
      transformedNode.position.start.offset >= end
    ) {
      defineParent(comment, transformedNode);
      transformedNode.middleComments.push(comment);
    } else if (
      (transformedNode.type === "blockFolded" ||
        transformedNode.type === "blockLiteral") &&
      (transformedNode.position.start.offset < start &&
        transformedNode.position.end.offset > end)
    ) {
      defineParent(comment, transformedNode);
      transformedNode.trailingComments.push(comment);
    }
    context.comments.push(comment);
  });

  if (tagRange) {
    assert("tag" in transformedNode);
    const tag = node.tag!;
    (transformedNode as Content).tag =
      "verbatim" in tag
        ? createVerbatimTag(context.transformRange(tagRange), tag.verbatim)
        : tag.handle === "!" && tag.suffix === ""
          ? createNonSpecificTag(context.transformRange(tagRange))
          : createShorthandTag(
              context.transformRange(tagRange),
              tag.handle,
              tag.suffix,
            );
  }

  if (anchorRange) {
    assert("anchor" in transformedNode);
    const anchor = node.anchor!;
    (transformedNode as Content).anchor = createAnchor(
      context.transformRange(anchorRange),
      anchor,
    );
  }

  return transformedNode;
}

function _transformNode(
  node: Exclude<YamlNode, null>,
  context: Context,
): Exclude<YamlUnistNode, null> {
  // prettier-ignore
  switch (node.type) {
    case "ALIAS": return tranformAlias(node, context);
    case "BLOCK_FOLDED": return tranformBlockFolded(node, context);
    case "BLOCK_LITERAL": return tranformBlockLiteral(node, context);
    case "COMMENT": return transformComment(node, context);
    case "DIRECTIVE": return transformDirective(node, context);
    case "DOCUMENT": return transformDocument(node, context);
    case "FLOW_MAP": return transformFlowMap(node, context);
    case "FLOW_SEQ": return transformFlowSeq(node, context);
    case "MAP": return transformMap(node, context);
    case "MAP_KEY": return transformMapKey(node, context);
    case "MAP_VALUE": return transformMapValue(node, context);
    case "PLAIN": return transformPlain(node, context);
    case "QUOTE_DOUBLE": return transformQuoteDouble(node, context);
    case "QUOTE_SINGLE": return transformQuoteSingle(node, context);
    case "SEQ": return transformSeq(node, context);
    case "SEQ_ITEM": return transformSeqItem(node, context);
    // istanbul ignore next
    default: throw new Error(`Unexpected node type ${(node as YAML.cst.Node).type}`);
  }
}
