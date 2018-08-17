import YAML from "yaml";
import { createDocument } from "../factories/document";
import { createPosition } from "../factories/position";
import { Context } from "../transform";
import { Document } from "../types";
import { clone } from "../utils/clone";
import { transformDocumentBody } from "./document-body";
import { transformDocumentHead } from "./document-head";

export function transformDocument(
  document: YAML.ast.Document,
  context: Context,
): Document {
  const { documentHead } = transformDocumentHead(document, context);
  const { documentBody, documentTrailingComment } = transformDocumentBody(
    document,
    context,
  );

  if (documentTrailingComment) {
    context.comments.push(documentTrailingComment);
  }

  return createDocument(
    createPosition(
      clone(documentHead.position.start),
      clone(documentBody.position.end),
    ),
    documentHead,
    documentBody,
    documentTrailingComment,
  );
}
