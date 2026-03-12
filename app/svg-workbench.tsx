"use client";

import { startTransition, useId, useState } from "react";

import { sanitizeSvg } from "./lib/svg-utils";

const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-icon lucide-image">
  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
  <circle cx="9" cy="9" r="2" />
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
</svg>`;
const DEFAULT_REACT = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image-icon lucide-image">
  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
  <circle cx="9" cy="9" r="2" />
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
</svg>`;

export function SvgWorkbench() {
  const reactToggleId = useId();
  const [source, setSource] = useState(DEFAULT_SVG);
  const [lastValidSvg, setLastValidSvg] = useState(DEFAULT_SVG);
  const [reactCode, setReactCode] = useState<string | null>(DEFAULT_REACT);
  const [showReact, setShowReact] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!reactCode || error) {
      return;
    }

    await navigator.clipboard.writeText(reactCode);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1400);
  }

  function handleSourceChange(nextSource: string) {
    setSource(nextSource);
    setCopied(false);

    startTransition(() => {
      const result = sanitizeSvg(nextSource);

      if (!result.ok) {
        setError(result.error);
        setWarning(null);
        setReactCode(null);
        return;
      }

      setLastValidSvg(result.sanitizedSvg);
      setReactCode(result.reactCode);
      setError(null);
      setWarning(result.warnings[0] ?? null);
    });
  }

  return (
    <main className="workbench-shell">
      <div className="workbench-frame">
        <header className="workbench-header">
          <div className="workbench-copy">
            <span className="eyebrow">SVG viewer</span>
            <h1>Inspect raw SVG, then flip it into React-safe JSX.</h1>
          </div>
          <p className="workbench-note">
            Paste any inline SVG on the left. The right side stays live, keeps
            the last valid render in view, and can convert the markup into JSX.
          </p>
        </header>

        <section className="workbench-grid" aria-label="SVG workbench">
          <article className="panel panel-editor">
            <div className="panel-topline">
              <div>
                <span className="panel-label">Source</span>
                <p className="panel-caption">Raw inline SVG input</p>
              </div>
              <span className="status-pill">Live</span>
            </div>

            <label className="panel-body panel-body-editor" htmlFor="svg-source">
              <span className="sr-only">SVG source</span>
              <textarea
                id="svg-source"
                className="code-surface editor-surface"
                spellCheck={false}
                value={source}
                onChange={(event) => handleSourceChange(event.target.value)}
              />
            </label>

            <footer className="panel-footer">
              <p className="footer-meta">
                The preview updates as you type. Only inline SVG is supported in
                this first version.
              </p>
              {error ? (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              ) : warning ? (
                <p className="notice notice-warning">{warning}</p>
              ) : (
                <p className="notice notice-neutral">
                  Sanitized for safe preview rendering.
                </p>
              )}
            </footer>
          </article>

          <article className="panel panel-preview">
            <div className="panel-topline">
              <div>
                <span className="panel-label">Output</span>
                <p className="panel-caption">Preview and optional React JSX</p>
              </div>

              <label className="toggle" htmlFor={reactToggleId}>
                <input
                  id={reactToggleId}
                  type="checkbox"
                  checked={showReact}
                  onChange={(event) => setShowReact(event.target.checked)}
                />
                <span>React</span>
              </label>
            </div>

            <div
              className={`preview-stack ${
                showReact ? "preview-stack-react" : "preview-stack-solo"
              }`}
            >
              <div className="preview-surface">
                <div className="preview-stage">
                  <div
                    className="preview-svg"
                    dangerouslySetInnerHTML={{ __html: lastValidSvg }}
                  />
                </div>
              </div>

              {showReact ? (
                <section className="react-section" aria-label="React JSX output">
                  <div className="react-header">
                    <div>
                      <span className="panel-label">React JSX</span>
                      <p className="panel-caption">
                        Attribute names are converted for React usage.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => void handleCopy()}
                      disabled={!reactCode || Boolean(error)}
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>

                  <div className="panel-body">
                    {reactCode && !error ? (
                      <pre className="code-surface output-surface">
                        <code>{reactCode}</code>
                      </pre>
                    ) : (
                      <div className="empty-surface">
                        React output appears when the current SVG parses
                        cleanly.
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
