import assert = require("assert");
import { Context } from "../transform";
import { SequenceItem } from "../types";
import {
  createCommentAttachableNode,
  createEndCommentAttachableNode,
} from "../utils";

export function transformSeqItem(
  seqItem: yaml.SeqItem,
  context: Context,
): SequenceItem {
  assert(seqItem.valueRange !== null);
  assert(seqItem.node === null || seqItem.node.type !== "COMMENT");

  const value = context.transformNode(seqItem.node as Exclude<
    typeof seqItem.node,
    yaml.Comment
  >);

  return {
    type: "sequenceItem",
    position: {
      start: context.transformOffset(seqItem.valueRange!.start),
      end:
        value.type === "null"
          ? context.transformOffset(seqItem.valueRange!.start + 1)
          : value.position.end,
    },
    children: [value],
    ...createCommentAttachableNode(),
    ...createEndCommentAttachableNode(),
  };
}
