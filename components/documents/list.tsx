import { File02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { DirectoryFormat } from "@/components/directory/format"
import { documentHref, type DocumentLink } from "@/lib/centrix/documents"
import { formatMessage as fm } from "@/lib/i18n/format-message"

import type { DocumentMessages } from "./format"

/** The documents on file, each opening its filled copy in a new tab. */
export function DocumentList({
  links,
  locale,
  messages: m,
  format,
}: {
  links: DocumentLink[]
  locale: string
  messages: DocumentMessages
  format: DirectoryFormat
}) {
  return (
    <div className="@container">
      <ul className="grid gap-1 @lg:grid-cols-2">
        {links.map((link) => {
          const detail = [
            ...link.context,
            link.units !== undefined &&
              fm(m.unitsCount, { count: format.number(link.units) }),
            link.energyClass && fm(m.energyClass, { class: link.energyClass }),
            link.when &&
              ("day" in link.when
                ? format.day(link.when.day)
                : format.dateTime(link.when.at)),
          ].filter(Boolean)
          return (
            <li key={`${link.kind}-${link.id}-${link.party ?? ""}`}>
              <a
                href={documentHref(locale, link)}
                target="_blank"
                rel="noopener"
                className="group flex items-start gap-2.5 rounded-(--radius-card) px-2 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <HugeiconsIcon
                  icon={File02Icon}
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {m.kinds[link.kind]}
                    <span className="sr-only"> ({m.newTab})</span>
                  </span>
                  {detail.length > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {detail.join(" · ")}
                    </span>
                  )}
                </span>
                <HugeiconsIcon
                  icon={LinkSquare02Icon}
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
