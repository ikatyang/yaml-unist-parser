import assert = require("assert");
import YAML from "yaml";
import { createDocument } from "../factories/document";
import { createDocumentBody } from "../factories/document-body";
import { createDocumentHead } from "../factories/document-head";
import { createPosition } from "../factories/position";
import { Context } from "../transform";
import { Document, Position } from "../types";
import { defineParent, getLast } from "../utils";

export function transformDocument(
  document: YAML.cst.Document,
  context: Context,
): Document {
  assert(document.valueRange !== null);

  const directives = document.directives.map(context.transformNode);
  const lastContinuousCommentCount = directives.reduce(
    (reduced, node) => (node.type === "comment" ? reduced + 1 : 0),
    0,
  );
  const directivesWithoutNonTrailingComments = directives.filter(
    (node, index) => {
      if (
        index < directives.length - lastContinuousCommentCount &&
        node.type === "comment"
      ) {
        context.comments.push(node);
        return false;
      }
      return true;
    },
  );

  const contents = document.contents.map(context.transformNode);
  const contentsWithoutComments = contents.filter(node => {
    if (node.type === "comment") {
      context.comments.push(node);
      return false;
    }
    return true;
  });

  assert(contentsWithoutComments.length <= 1);

  const headPosition: Position = (text => {
    const match = text.match(/(^|\n)---\s*$/);
    const marker = "---";
    const markerIndex = match ? context.text.indexOf(marker, match.index) : -1;
    const start =
      directives.length !== 0
        ? directives[0].position.start.offset
        : !match
          ? document.valueRange!.start
          : markerIndex;
    const end = match
      ? markerIndex + marker.length
      : document.valueRange!.start;
    return context.transformRange({ start, end });
  })(context.text.slice(0, document.valueRange!.start));

  const bodyPosition: Position = (text => {
    const match = text.match(/^\s*\.\.\.(\s*(#[^\n]*)?\n|$)/);
    const marker = "...";
    const markerIndex = match
      ? context.text.indexOf(marker, document.valueRange!.end + match.index!)
      : -1;
    const start =
      contents.length !== 0
        ? contents[0].position.start.offset
        : document.valueRange!.start;
    const end = match
      ? markerIndex + marker.length
      : contents.length !== 0
        ? getLast(contents)!.position.end.offset
        : document.valueRange!.start;
    return context.transformRange({ start, end });
  })(context.text.slice(document.valueRange!.end));

  const position = createPosition(headPosition.start, bodyPosition.end);

  const documentHead = createDocumentHead(headPosition, []);
  documentHead.children = directivesWithoutNonTrailingComments.map(
    directive => {
      if (directive.type === "comment") {
        context.comments.push(directive);
        defineParent(directive, documentHead);
      }
      return directive;
    },
  );

  return createDocument(
    position,
    documentHead,
    createDocumentBody(
      bodyPosition,
      contentsWithoutComments, // handle standalone comment in attach
    ),
  );
}
