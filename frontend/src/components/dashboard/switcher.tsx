"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "@base-ui/react/menu";

import { NAV_ITEMS } from "./nav";
import { CaretIcon, TickIcon } from "./icons";

/**
 * The project header: what we are looking at, and the control that switches it.
 *
 * `corpus / <name>` is Vercel's breadcrumb idiom, and it is honest here — the
 * scope really is the committed corpus, not an account and not a team. The name
 * beside it is the paper when a paper is in scope and `All papers` when the
 * screen is workspace-wide.
 *
 * The name is text and the switcher is the control next to it, rather than one
 * button doing both. That is what the brief describes, and it also keeps the
 * heading readable at 390px, where a 260px-wide button with a caret in it would
 * be the whole first line of the screen.
 *
 * Two groups in the menu, because the brief asks for two things from it: other
 * papers, and other views. A paper item goes to that paper's run; a view item
 * goes to a screen. The current one carries a tick, so the menu says where you
 * are as well as where you can go.
 */

export type SwitcherPaper = {
  arxivId: string;
  shortName: string;
  title: string;
};

const ITEM_CLASS =
  "flex min-h-11 cursor-default items-center gap-3 px-3 outline-none select-none data-highlighted:bg-[var(--chrome-panel)]";

function currentPaperId(pathname: string): string | null {
  const match = /^\/dashboard\/papers\/([^/]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export function ProjectSwitcher({ papers }: { papers: SwitcherPaper[] }) {
  const pathname = usePathname();
  const currentId = currentPaperId(pathname);
  const current = papers.find((p) => p.arxivId === currentId) ?? null;
  const label = current ? current.shortName : "All papers";

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href="/dashboard"
        className="t-body shrink-0 transition-colors"
        style={{ color: "var(--chrome-dim)", transitionDuration: "var(--dur-fast)" }}
      >
        corpus
      </Link>
      <span aria-hidden style={{ color: "var(--chrome-line)" }}>
        /
      </span>

      <h1
        className="t-panel-title min-w-0 truncate"
        style={{ color: "var(--chrome-text)" }}
        title={current ? current.title : "Every paper in the committed corpus"}
      >
        {label}
      </h1>

      <Menu.Root>
        <Menu.Trigger
          className="grid h-8 w-8 shrink-0 place-items-center border transition-colors data-popup-open:bg-[var(--chrome-raised)]"
          style={{
            borderColor: "var(--chrome-line)",
            borderRadius: "var(--dash-radius-chip)",
            color: "var(--chrome-dim)",
            transitionDuration: "var(--dur-fast)",
          }}
        >
          <CaretIcon size={14} />
          <span className="sr-only">Switch paper or view</span>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner className="z-50 outline-none" side="bottom" align="start" sideOffset={8}>
            <Menu.Popup
              className="origin-(--transform-origin) overflow-hidden border py-1.5 transition-[opacity,transform] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
              style={{
                background: "var(--chrome-raised)",
                borderColor: "var(--chrome-line)",
                // `--radius-surface`, not `--dash-radius`, and this is not a
                // preference. The popup is portalled into <body>, which is
                // outside the shell that declares the `--dash-*` tokens, so a
                // scoped custom property does not cascade to it and the radius
                // silently resolved to 0. Caught in the DOM, not by eye: a
                // square-cornered menu is exactly what this surface must not
                // have. Anything portalled reads the `:root` tokens only.
                borderRadius: "var(--radius-surface)",
                minWidth: "260px",
                maxWidth: "min(340px, calc(100vw - 24px))",
              }}
            >
              <Menu.Group>
                <Menu.GroupLabel className="t-label px-3 pt-1.5 pb-2">Papers</Menu.GroupLabel>
                {papers.map((paper) => {
                  const here = paper.arxivId === currentId;
                  return (
                    <Menu.LinkItem
                      key={paper.arxivId}
                      closeOnClick
                      className={ITEM_CLASS}
                      render={<Link href={`/dashboard/papers/${paper.arxivId}`} />}
                    >
                      <span className="grid w-4 shrink-0 place-items-center">
                        {here ? (
                          <span style={{ color: "var(--chrome-text)" }}>
                            <TickIcon size={14} />
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="t-body block truncate"
                          style={{ color: "var(--chrome-text)" }}
                        >
                          {paper.shortName}
                        </span>
                        <span className="t-num block" style={{ color: "var(--chrome-faint)" }}>
                          {paper.arxivId}
                        </span>
                      </span>
                    </Menu.LinkItem>
                  );
                })}
              </Menu.Group>

              <Menu.Separator
                className="my-1.5 h-px"
                style={{ background: "var(--rule-grid-deep)" }}
              />

              <Menu.Group>
                <Menu.GroupLabel className="t-label px-3 pb-2">Views</Menu.GroupLabel>
                {NAV_ITEMS.map((item) => {
                  const here = !currentId && item.match(pathname);
                  return (
                    <Menu.LinkItem
                      key={item.href}
                      closeOnClick
                      className={ITEM_CLASS}
                      render={<Link href={item.href} />}
                    >
                      <span className="grid w-4 shrink-0 place-items-center">
                        {here ? (
                          <span style={{ color: "var(--chrome-text)" }}>
                            <TickIcon size={14} />
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="t-body block truncate"
                          style={{ color: "var(--chrome-text)" }}
                        >
                          {item.label}
                        </span>
                        <span className="block" style={{ color: "var(--chrome-faint)", fontSize: "12px" }}>
                          {item.hint}
                        </span>
                      </span>
                    </Menu.LinkItem>
                  );
                })}
              </Menu.Group>

              {current ? (
                <>
                  <Menu.Separator
                    className="my-1.5 h-px"
                    style={{ background: "var(--rule-grid-deep)" }}
                  />
                  <Menu.LinkItem
                    closeOnClick
                    className={ITEM_CLASS}
                    render={<Link href={`/reports/${current.arxivId}`} />}
                  >
                    <span className="w-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="t-body block truncate" style={{ color: "var(--chrome-text)" }}>
                        Open the public report
                      </span>
                      <span
                        className="block"
                        style={{ color: "var(--chrome-faint)", fontSize: "12px" }}
                      >
                        The permalink a reader sees
                      </span>
                    </span>
                  </Menu.LinkItem>
                </>
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
