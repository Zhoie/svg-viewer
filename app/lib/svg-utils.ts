const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const BLOCKED_TAGS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "style",
]);

type SanitizeResult =
  | {
      ok: true;
      sanitizedSvg: string;
      reactCode: string;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
    };

function quoteJsxText(value: string) {
  return `{${JSON.stringify(value)}}`;
}

function convertAttributeName(name: string) {
  if (name === "class") {
    return "className";
  }

  if (name === "for") {
    return "htmlFor";
  }

  if (name.startsWith("aria-") || name.startsWith("data-")) {
    return name;
  }

  return name.replace(/[:.-]([a-zA-Z0-9])/g, (_, character: string) =>
    character.toUpperCase(),
  );
}

function findTagEnd(source: string, startIndex: number) {
  let index = startIndex + 1;
  let activeQuote: string | null = null;

  while (index < source.length) {
    const character = source[index];

    if (activeQuote) {
      if (character === activeQuote) {
        activeQuote = null;
      }

      index += 1;
      continue;
    }

    if (character === `"` || character === "'") {
      activeQuote = character;
      index += 1;
      continue;
    }

    if (character === ">") {
      return index;
    }

    index += 1;
  }

  return source.length - 1;
}

function transformTagSegment(segment: string) {
  if (
    segment.startsWith("</") ||
    segment.startsWith("<?") ||
    segment.startsWith("<!")
  ) {
    return segment;
  }

  let index = 1;
  let result = "<";
  const tagNameStart = index;

  while (
    index < segment.length &&
    !/\s/.test(segment[index]) &&
    segment[index] !== ">" &&
    segment[index] !== "/"
  ) {
    index += 1;
  }

  result += segment.slice(tagNameStart, index);

  while (index < segment.length) {
    if (segment.startsWith("/>", index)) {
      result += "/>";
      index += 2;
      continue;
    }

    const character = segment[index];

    if (character === ">") {
      result += ">";
      index += 1;
      continue;
    }

    if (/\s/.test(character)) {
      const whitespaceStart = index;

      while (index < segment.length && /\s/.test(segment[index])) {
        index += 1;
      }

      result += segment.slice(whitespaceStart, index);
      continue;
    }

    if (character === "=") {
      result += "=";
      index += 1;
      continue;
    }

    if (character === `"` || character === "'") {
      const quote = character;
      const valueStart = index;
      index += 1;

      while (index < segment.length && segment[index] !== quote) {
        index += 1;
      }

      if (index < segment.length) {
        index += 1;
      }

      result += segment.slice(valueStart, index);
      continue;
    }

    const attributeStart = index;

    while (
      index < segment.length &&
      !/\s/.test(segment[index]) &&
      segment[index] !== "=" &&
      segment[index] !== ">" &&
      segment[index] !== "/"
    ) {
      index += 1;
    }

    result += convertAttributeName(segment.slice(attributeStart, index));
  }

  return result;
}

function formatSourcePreservedJsx(source: string) {
  let index = 0;
  let result = "";

  while (index < source.length) {
    if (source.startsWith("<!--", index)) {
      const commentEnd = source.indexOf("-->", index + 4);
      const safeEnd = commentEnd === -1 ? source.length : commentEnd + 3;
      result += source.slice(index, safeEnd);
      index = safeEnd;
      continue;
    }

    if (source[index] !== "<") {
      result += source[index];
      index += 1;
      continue;
    }

    const tagEnd = findTagEnd(source, index);
    result += transformTagSegment(source.slice(index, tagEnd + 1));
    index = tagEnd + 1;
  }

  return result;
}

function canPreserveSourceFormatting(
  source: string,
  sanitizedSvg: string,
  warnings: Set<string>,
  sourceRoot: Element,
) {
  if (warnings.size > 0 || !/^<svg(?=[\s>])/i.test(source)) {
    return false;
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(sourceRoot) === sanitizedSvg;
}

function formatJsxNode(node: Node, depth = 0): string[] {
  const indent = "  ".repeat(depth);

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim();
    return text ? [`${indent}${quoteJsxText(text)}`] : [];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as Element;
  const attributes = Array.from(element.attributes).map((attribute) => {
    const name = convertAttributeName(attribute.name);
    return `${name}=${JSON.stringify(attribute.value)}`;
  });
  const openTag = [`${indent}<${element.tagName}`, ...attributes]
    .join(attributes.length ? " " : "")
    .trimEnd();
  const children = Array.from(element.childNodes).flatMap((childNode) =>
    formatJsxNode(childNode, depth + 1),
  );

  if (children.length === 0) {
    return [`${openTag} />`];
  }

  return [
    `${openTag}>`,
    ...children,
    `${indent}</${element.tagName}>`,
  ];
}

function sanitizeElement(
  sourceElement: Element,
  targetDocument: XMLDocument,
  warnings: Set<string>,
): Element | null {
  const tagName = sourceElement.localName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    warnings.add(`Removed unsupported <${tagName}> content from the preview.`);
    return null;
  }

  const sanitizedElement = targetDocument.createElementNS(
    sourceElement.namespaceURI || SVG_NS,
    sourceElement.tagName,
  );

  for (const attribute of Array.from(sourceElement.attributes)) {
    const normalizedName = attribute.name.toLowerCase();
    const normalizedValue = attribute.value.trim().toLowerCase();

    if (normalizedName.startsWith("on")) {
      warnings.add("Removed inline event handlers from the SVG.");
      continue;
    }

    if (normalizedName === "style") {
      warnings.add("Inline style attributes were removed for safety.");
      continue;
    }

    if (
      (normalizedName === "href" ||
        normalizedName === "xlink:href" ||
        normalizedName === "src") &&
      attribute.value.trim() !== "" &&
      !attribute.value.trim().startsWith("#")
    ) {
      warnings.add("External resource references were removed for safety.");
      continue;
    }

    if (normalizedValue.startsWith("javascript:")) {
      warnings.add("Removed javascript: attributes from the SVG.");
      continue;
    }

    if (attribute.namespaceURI === XMLNS_NS) {
      sanitizedElement.setAttributeNS(XMLNS_NS, attribute.name, attribute.value);
      continue;
    }

    if (attribute.namespaceURI === XLINK_NS) {
      sanitizedElement.setAttributeNS(XLINK_NS, attribute.name, attribute.value);
      continue;
    }

    if (attribute.namespaceURI) {
      sanitizedElement.setAttributeNS(
        attribute.namespaceURI,
        attribute.name,
        attribute.value,
      );
      continue;
    }

    sanitizedElement.setAttribute(attribute.name, attribute.value);
  }

  for (const childNode of Array.from(sourceElement.childNodes)) {
    if (childNode.nodeType === Node.ELEMENT_NODE) {
      const childElement = sanitizeElement(
        childNode as Element,
        targetDocument,
        warnings,
      );

      if (childElement) {
        sanitizedElement.appendChild(childElement);
      }

      continue;
    }

    if (childNode.nodeType === Node.TEXT_NODE) {
      const textContent = childNode.textContent;

      if (textContent !== null) {
        sanitizedElement.appendChild(targetDocument.createTextNode(textContent));
      }
    }
  }

  return sanitizedElement;
}

export function sanitizeSvg(source: string): SanitizeResult {
  const trimmed = source.trim();

  if (!trimmed) {
    return { ok: false, error: "Paste an SVG to see the preview." };
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(trimmed, "image/svg+xml");

  if (
    parsedDocument.documentElement.nodeName.toLowerCase() === "parsererror" ||
    parsedDocument.querySelector("parsererror")
  ) {
    return { ok: false, error: "The SVG markup is malformed." };
  }

  const root = parsedDocument.documentElement;

  if (root.localName.toLowerCase() !== "svg") {
    return { ok: false, error: "The root element must be <svg>." };
  }

  const warnings = new Set<string>();
  const targetDocument = document.implementation.createDocument(
    SVG_NS,
    "svg",
    null,
  );
  const sanitizedRoot = sanitizeElement(root, targetDocument, warnings);

  if (!sanitizedRoot) {
    return { ok: false, error: "The SVG could not be sanitized." };
  }

  targetDocument.replaceChild(sanitizedRoot, targetDocument.documentElement);

  const serializer = new XMLSerializer();
  const sanitizedSvg = serializer.serializeToString(targetDocument);
  const reactCode = canPreserveSourceFormatting(
    trimmed,
    sanitizedSvg,
    warnings,
    root,
  )
    ? formatSourcePreservedJsx(trimmed)
    : formatJsxNode(sanitizedRoot).join("\n");

  return {
    ok: true,
    sanitizedSvg,
    reactCode,
    warnings: Array.from(warnings),
  };
}
