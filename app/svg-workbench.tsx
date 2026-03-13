"use client";

import NextImage from "next/image";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type UIEvent,
} from "react";

import { sanitizeSvg } from "./lib/svg-utils";

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image">
  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
  <circle cx="9" cy="9" r="2" />
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
</svg>`;
const DEFAULT_REACT = `import * as React from "react";

const SVGComponent = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image-icon lucide-image" {...props}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

export default SVGComponent;`;
const DEFAULT_STAGE_SIZE = {
  width: 360,
  height: 280,
};
const VISUAL_VIEWPORT_INSET = 32;
const DEFAULT_PREVIEW_SCALE_PERCENT = 72;
const COMPACT_PREVIEW_SCALE_PERCENT = 56;
const MIN_PREVIEW_SCALE_PERCENT = 35;
const MAX_PREVIEW_SCALE_PERCENT = 100;

const OUTPUT_TABS = [
  { id: "preview", label: "SVG" },
  { id: "png", label: "PNG" },
  { id: "react", label: "React" },
] as const;
const ICON_RESOURCES = [
  {
    id: "lucide",
    label: "Lucide Icons",
    href: "https://lucide.dev/icons/",
    iconSrc: "https://lucide.dev/favicon.ico",
    mark: "L",
  },
  {
    id: "iconoir",
    label: "Iconoir",
    href: "https://iconoir.com",
    iconSrc: "https://iconoir.com/favicon.ico",
    mark: "I",
  },
  {
    id: "phosphor",
    label: "Phosphor Icons",
    href: "https://phosphoricons.com",
    iconSrc: "https://phosphoricons.com/favicon.ico",
    mark: "P",
  },
  {
    id: "heroicons",
    label: "Heroicons",
    href: "https://heroicons.com",
    iconSrc: "https://heroicons.com/favicon.ico",
    mark: "H",
  },
] as const;

type OutputTab = (typeof OUTPUT_TABS)[number]["id"];
type HighlightTokenKind =
  | "plain"
  | "tag"
  | "attribute"
  | "value"
  | "punctuation"
  | "comment";
type HighlightToken = {
  kind: HighlightTokenKind;
  value: string;
};
type FrameSize = {
  width: number;
  height: number;
};

function pushHighlightToken(
  tokens: HighlightToken[],
  kind: HighlightTokenKind,
  value: string,
) {
  if (!value) {
    return;
  }

  const previousToken = tokens[tokens.length - 1];

  if (previousToken && previousToken.kind === kind) {
    previousToken.value += value;
    return;
  }

  tokens.push({ kind, value });
}

function isWhitespace(character: string) {
  return /\s/.test(character);
}

function tokenizeSvgSource(source: string) {
  const tokens: HighlightToken[] = [];
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("<!--", index)) {
      const commentEndIndex = source.indexOf("-->", index + 4);
      const safeEndIndex =
        commentEndIndex === -1 ? source.length : commentEndIndex + 3;
      pushHighlightToken(tokens, "comment", source.slice(index, safeEndIndex));
      index = safeEndIndex;
      continue;
    }

    if (source[index] !== "<") {
      pushHighlightToken(tokens, "plain", source[index]);
      index += 1;
      continue;
    }

    let delimiterLength = 1;
    const nextCharacter = source[index + 1];

    if (
      nextCharacter === "/" ||
      nextCharacter === "?" ||
      nextCharacter === "!"
    ) {
      delimiterLength = 2;
    }

    pushHighlightToken(
      tokens,
      "punctuation",
      source.slice(index, index + delimiterLength),
    );
    index += delimiterLength;

    const tagStart = index;

    while (
      index < source.length &&
      !isWhitespace(source[index]) &&
      source[index] !== ">" &&
      source[index] !== "/"
    ) {
      index += 1;
    }

    pushHighlightToken(tokens, "tag", source.slice(tagStart, index));

    while (index < source.length) {
      if (source.startsWith("/>", index)) {
        pushHighlightToken(tokens, "punctuation", "/>");
        index += 2;
        break;
      }

      if (source[index] === ">") {
        pushHighlightToken(tokens, "punctuation", ">");
        index += 1;
        break;
      }

      if (isWhitespace(source[index])) {
        const whitespaceStart = index;

        while (index < source.length && isWhitespace(source[index])) {
          index += 1;
        }

        pushHighlightToken(tokens, "plain", source.slice(whitespaceStart, index));
        continue;
      }

      if (source[index] === "=") {
        pushHighlightToken(tokens, "punctuation", "=");
        index += 1;
        continue;
      }

      if (source[index] === `"` || source[index] === "'") {
        const quote = source[index];
        let valueEndIndex = index + 1;

        while (valueEndIndex < source.length && source[valueEndIndex] !== quote) {
          valueEndIndex += 1;
        }

        if (valueEndIndex < source.length) {
          valueEndIndex += 1;
        }

        pushHighlightToken(tokens, "value", source.slice(index, valueEndIndex));
        index = valueEndIndex;
        continue;
      }

      const attributeStart = index;

      while (
        index < source.length &&
        !isWhitespace(source[index]) &&
        source[index] !== "=" &&
        source[index] !== ">" &&
        source[index] !== "/"
      ) {
        index += 1;
      }

      pushHighlightToken(
        tokens,
        "attribute",
        source.slice(attributeStart, index),
      );
    }
  }

  return tokens;
}

function parseDimension(dimension: string | null) {
  if (!dimension) {
    return null;
  }

  const numericValue = Number.parseFloat(dimension);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function readSvgAttribute(svgMarkup: string, attributeName: string) {
  const attributePattern = new RegExp(
    `${attributeName}\\s*=\\s*["']([^"']+)["']`,
    "i",
  );
  return svgMarkup.match(attributePattern)?.[1] ?? null;
}

function resolveSvgFrame(svgMarkup: string): FrameSize {
  const width = parseDimension(readSvgAttribute(svgMarkup, "width"));
  const height = parseDimension(readSvgAttribute(svgMarkup, "height"));
  const viewBox = readSvgAttribute(svgMarkup, "viewBox")
    ?.split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));
  const viewBoxWidth =
    viewBox && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : null;
  const viewBoxHeight =
    viewBox && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : null;

  let resolvedWidth = width ?? viewBoxWidth;
  let resolvedHeight = height ?? viewBoxHeight;

  if (resolvedWidth && !resolvedHeight) {
    resolvedHeight =
      viewBoxWidth && viewBoxHeight
        ? resolvedWidth * (viewBoxHeight / viewBoxWidth)
        : resolvedWidth;
  }

  if (resolvedHeight && !resolvedWidth) {
    resolvedWidth =
      viewBoxWidth && viewBoxHeight
        ? resolvedHeight * (viewBoxWidth / viewBoxHeight)
        : resolvedHeight;
  }

  return {
    width: resolvedWidth ?? 256,
    height: resolvedHeight ?? 256,
  };
}

function fitFrameWithinBounds(frame: FrameSize, bounds: FrameSize): FrameSize {
  const scale = Math.min(
    Math.max(bounds.width, 1) / frame.width,
    Math.max(bounds.height, 1) / frame.height,
  );

  return {
    width: Math.max(Math.floor(frame.width * scale), 1),
    height: Math.max(Math.floor(frame.height * scale), 1),
  };
}

function scaleFrame(frame: FrameSize, scalePercent: number): FrameSize {
  const scale = scalePercent / 100;

  return {
    width: Math.max(Math.round(frame.width * scale), 1),
    height: Math.max(Math.round(frame.height * scale), 1),
  };
}

function resolveRasterDimensions(svgMarkup: string) {
  const frame = resolveSvgFrame(svgMarkup);
  const upscale = frame.width < 128 || frame.height < 128 ? 8 : 3;

  return {
    width: Math.max(Math.round(frame.width * upscale), 256),
    height: Math.max(Math.round(frame.height * upscale), 256),
  };
}

async function svgToPngDataUrl(svgMarkup: string) {
  const { width, height } = resolveRasterDimensions(svgMarkup);
  const svgBlob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  });
  const blobUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.decoding = "async";
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () =>
        reject(new Error("The PNG preview could not be generated."));
      nextImage.src = blobUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is unavailable for PNG generation.");
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function SvgWorkbench() {
  const scaleSliderId = useId();
  const tabsId = useId();
  const highlightScrollRef = useRef<HTMLPreElement>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const [source, setSource] = useState(DEFAULT_SVG);
  const [lastValidSvg, setLastValidSvg] = useState(DEFAULT_SVG);
  const [lastValidReactCode, setLastValidReactCode] = useState(DEFAULT_REACT);
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  const [pngStatus, setPngStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const [previewScalePercent, setPreviewScalePercent] = useState(
    DEFAULT_PREVIEW_SCALE_PERCENT,
  );
  const [hasManualScaleSelection, setHasManualScaleSelection] = useState(false);
  const [observedVisualStageNode, setObservedVisualStageNode] =
    useState<HTMLElement | null>(null);
  const [visualStageSize, setVisualStageSize] =
    useState<FrameSize>(DEFAULT_STAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const deferredSource = useDeferredValue(source);
  const highlightedSource =
    deferredSource.length === 0
      ? " "
      : deferredSource.endsWith("\n")
        ? `${deferredSource} `
        : deferredSource;
  const highlightTokens = tokenizeSvgSource(highlightedSource);
  const activePanelId = `${tabsId}-${activeTab}-panel`;
  const activeTabIndex = OUTPUT_TABS.findIndex((tab) => tab.id === activeTab);
  const isVisualTab = activeTab !== "react";
  const svgFrame = resolveSvgFrame(lastValidSvg);
  const pngFrame = resolveRasterDimensions(lastValidSvg);
  const resolvedPreviewScalePercent =
    !hasManualScaleSelection &&
    visualStageSize.height < 180 &&
    previewScalePercent === DEFAULT_PREVIEW_SCALE_PERCENT
      ? COMPACT_PREVIEW_SCALE_PERCENT
      : previewScalePercent;
  const fittedVisualFrame = fitFrameWithinBounds(svgFrame, visualStageSize);
  const scaledVisualFrame = scaleFrame(
    fittedVisualFrame,
    resolvedPreviewScalePercent,
  );
  const visualFrameStyle = {
    width: `${scaledVisualFrame.width}px`,
    height: `${scaledVisualFrame.height}px`,
  };
  const outputWorkflowStyle = {
    "--active-tab-index": activeTabIndex,
  } as CSSProperties;

  useEffect(() => {
    if (!observedVisualStageNode || typeof ResizeObserver === "undefined") {
      return;
    }

    let frameId: number | null = null;

    const syncStageSize = () => {
      const rect = observedVisualStageNode.getBoundingClientRect();
      const nextSize = {
        width: Math.max(Math.floor(rect.width - VISUAL_VIEWPORT_INSET), 1),
        height: Math.max(Math.floor(rect.height - VISUAL_VIEWPORT_INSET), 1),
      };

      if (nextSize.width < 24 || nextSize.height < 24) {
        return;
      }

      setVisualStageSize((previousSize) =>
        previousSize.width === nextSize.width &&
        previousSize.height === nextSize.height
          ? previousSize
          : nextSize,
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      syncStageSize();
    });

    resizeObserver.observe(observedVisualStageNode);
    frameId = window.requestAnimationFrame(syncStageSize);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [observedVisualStageNode]);

  useEffect(() => {
    let isCancelled = false;

    void svgToPngDataUrl(lastValidSvg)
      .then((nextPngDataUrl) => {
        if (isCancelled) {
          return;
        }

        setPngDataUrl(nextPngDataUrl);
        setPngStatus("ready");
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setPngStatus("error");
      });

    return () => {
      isCancelled = true;
    };
  }, [lastValidSvg]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (error) {
      return;
    }

    await navigator.clipboard.writeText(lastValidReactCode);
    setCopied(true);

    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
    }, 700);
  }

  function handleSourceChange(nextSource: string) {
    setSource(nextSource);
    setCopied(false);

    startTransition(() => {
      const result = sanitizeSvg(nextSource);

      if (!result.ok) {
        setError(result.error);
        setWarning(null);
        return;
      }

      setLastValidSvg(result.sanitizedSvg);
      setLastValidReactCode(result.reactCode);
      setPngStatus("loading");
      setError(null);
      setWarning(result.warnings[0] ?? null);
    });
  }

  function handleEditorScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (!highlightScrollRef.current) {
      return;
    }

    highlightScrollRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  function handleScaleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasManualScaleSelection(true);
    setPreviewScalePercent(Number(event.target.value));
  }

  function renderOutputViewport() {
    if (activeTab === "preview") {
      return (
        <section
          aria-labelledby={`${tabsId}-preview-tab`}
          className="output-viewport"
          data-view="preview"
          id={activePanelId}
          key={activeTab}
          ref={setObservedVisualStageNode}
          role="tabpanel"
        >
          <div className="preview-surface">
            <div className="preview-stage">
              <div className="visual-frame visual-frame-svg" style={visualFrameStyle}>
                <div
                  className="preview-svg"
                  dangerouslySetInnerHTML={{ __html: lastValidSvg }}
                />
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (activeTab === "png") {
      return (
        <section
          aria-labelledby={`${tabsId}-png-tab`}
          className="output-viewport"
          data-view="png"
          id={activePanelId}
          key={activeTab}
          ref={setObservedVisualStageNode}
          role="tabpanel"
        >
          <div className="preview-surface">
            <div className="preview-stage">
              {pngDataUrl ? (
                <NextImage
                  alt="PNG preview generated from the current SVG"
                  className="png-preview"
                  height={pngFrame.height}
                  src={pngDataUrl}
                  style={visualFrameStyle}
                  unoptimized
                  width={pngFrame.width}
                />
              ) : (
                <div className="empty-surface">
                  {pngStatus === "error"
                    ? "PNG generation is unavailable for this SVG right now."
                    : "Rendering a PNG preview from the last valid SVG."}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section
        aria-labelledby={`${tabsId}-react-tab`}
        className="output-viewport"
        data-view="react"
        id={activePanelId}
        key={activeTab}
        role="tabpanel"
      >
        <pre className="code-surface output-surface">
          <code>{lastValidReactCode}</code>
        </pre>
      </section>
    );
  }

  const editorNotice = error ? (
    <p className="notice notice-error" role="alert">
      {error}
    </p>
  ) : warning ? (
    <p className="notice notice-warning">{warning}</p>
  ) : null;

  return (
    <main className="workbench-shell">
      <div className="workbench-frame">
        <header className="workbench-header">
          <div className="workbench-copy">
            <span className="eyebrow">SVG viewer</span>
            <h1>Inspect raw SVG, then flip it into React-safe JSX.</h1>
          </div>
        </header>

        <section className="workbench-grid" aria-label="SVG workbench">
          <article
            className={`panel panel-editor ${
              editorNotice ? "panel-editor-with-footer" : ""
            }`}
          >
            <div className="panel-topline">
              <div>
                <span className="panel-label">Source</span>
                <p className="panel-caption">Raw inline SVG input</p>
              </div>
              <span className="status-pill">Live</span>
            </div>

            <label
              className="panel-body panel-body-editor panel-body-grid"
              htmlFor="svg-source"
            >
              <span className="sr-only">SVG source</span>
              <div className="editor-stack">
                <pre
                  aria-hidden="true"
                  className="code-surface highlight-surface"
                  ref={highlightScrollRef}
                >
                  <code>
                    {highlightTokens.map((token, index) =>
                      token.kind === "plain" ? (
                        <span key={`${token.kind}-${index}`}>{token.value}</span>
                      ) : (
                        <span
                          className={`token token-${token.kind}`}
                          key={`${token.kind}-${index}`}
                        >
                          {token.value}
                        </span>
                      ),
                    )}
                  </code>
                </pre>

                <textarea
                  id="svg-source"
                  className="code-surface editor-surface editor-input"
                  spellCheck={false}
                  value={source}
                  onChange={(event) => handleSourceChange(event.target.value)}
                  onScroll={handleEditorScroll}
                />
              </div>
            </label>

            {editorNotice ? <footer className="panel-footer">{editorNotice}</footer> : null}
          </article>

          <article className="panel panel-preview">
            <div className="panel-topline">
              <div>
                <span className="panel-label">Output</span>
                <p className="panel-caption">
                  Permanent tabs with a shared visual size control
                </p>
              </div>
            </div>

            <div className="panel-body panel-body-output panel-body-grid">
              <div
                className="output-panel-body"
                data-active-tab={activeTab}
                style={outputWorkflowStyle}
              >
                <div className="output-slot output-slot-tabs">
                  <div aria-label="Output modes" className="tablist" role="tablist">
                    {OUTPUT_TABS.map((tab) => (
                      <button
                        aria-controls={`${tabsId}-${tab.id}-panel`}
                        aria-selected={activeTab === tab.id}
                        className={`tab-button ${
                          activeTab === tab.id ? "tab-button-active" : ""
                        }`}
                        id={`${tabsId}-${tab.id}-tab`}
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        role="tab"
                        tabIndex={activeTab === tab.id ? 0 : -1}
                        type="button"
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="output-slot output-slot-viewport">
                  {renderOutputViewport()}
                </div>

                <div
                  className="output-slot output-slot-size size-row"
                  data-hidden={!isVisualTab}
                >
                  <div
                    aria-hidden={!isVisualTab}
                    className={`size-row-content ${
                      isVisualTab ? "" : "size-row-content-hidden"
                    }`}
                  >
                    <label className="size-control" htmlFor={scaleSliderId}>
                      <span className="size-control-label">Size</span>
                      <input
                        disabled={!isVisualTab}
                        id={scaleSliderId}
                        max={MAX_PREVIEW_SCALE_PERCENT}
                        min={MIN_PREVIEW_SCALE_PERCENT}
                        onChange={handleScaleChange}
                        type="range"
                        value={resolvedPreviewScalePercent}
                      />
                      <output className="size-control-value" htmlFor={scaleSliderId}>
                        {resolvedPreviewScalePercent}%
                      </output>
                    </label>
                  </div>
                </div>

                <div className="output-slot output-slot-actions output-action-row">
                  {activeTab === "react" ? (
                    <button
                      className="copy-button output-action-button"
                      data-copied={copied ? "true" : "false"}
                      disabled={Boolean(error)}
                      onClick={() => void handleCopy()}
                      type="button"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  ) : activeTab === "png" ? (
                    <a
                      aria-disabled={!pngDataUrl}
                      className={`copy-button output-action-button ${
                        pngDataUrl ? "" : "button-disabled"
                      }`}
                      download="svg-viewer.png"
                      href={pngDataUrl ?? "#"}
                    >
                      Download PNG
                    </a>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="output-action-spacer output-action-button"
                    />
                  )}
                </div>
              </div>
            </div>
          </article>
        </section>

        <footer className="workbench-resources" aria-label="Icon resources">
          {ICON_RESOURCES.map((resource) => (
            <a
              className="resource-chip"
              href={resource.href}
              key={resource.id}
              rel="noreferrer"
              target="_blank"
            >
              <span aria-hidden="true" className="resource-chip-mark">
                <span className="resource-chip-fallback">{resource.mark}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  aria-hidden="true"
                  className="resource-chip-icon"
                  height="16"
                  loading="lazy"
                  src={resource.iconSrc}
                  width="16"
                />
              </span>
              <span className="resource-chip-label">{resource.label}</span>
            </a>
          ))}
        </footer>
      </div>
    </main>
  );
}
