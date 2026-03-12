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

      if (textContent?.trim()) {
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
  const reactCode = formatJsxNode(sanitizedRoot).join("\n");

  return {
    ok: true,
    sanitizedSvg,
    reactCode,
    warnings: Array.from(warnings),
  };
}
