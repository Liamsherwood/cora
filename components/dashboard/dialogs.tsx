import {
  ArrowRight01Icon,
  Building03Icon,
  Search01Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

import { priorities, type Priority, type Property, type Request } from "./data"

import { useDashboardLocale } from "./locale"
import { useProperties } from "./portfolio"

const field =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"

export function NewRequestDialog({
  onCreate,
}: {
  onCreate: (request: Request) => void
}) {
  const { messages } = useDashboardLocale()
  const properties = useProperties()
  const [error, setError] = useState<string>()
  const input = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = String(data.get("title")).trim()
    if (!title) {
      setError(messages.missingRequestTitle)
      input.current?.focus()
      return
    }

    onCreate({
      id: crypto.randomUUID(),
      title,
      propertyId: String(data.get("property")),
      priority: data.get("priority") as Priority,
      description: String(data.get("description")).trim(),
      status: "Open",
    })
  }

  return (
    <>
      <DialogTitle className="pr-8 text-xl font-medium tracking-tight">
        {messages.newRequest}
      </DialogTitle>
      <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
        {messages.newRequestDescription}
      </DialogDescription>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>{messages.requestTitle}</span>
          <input
            ref={input}
            data-initial-focus
            name="title"
            className={field}
            placeholder={messages.requestTitleExample}
            maxLength={100}
            required
            aria-invalid={!!error}
            aria-describedby={error ? "request-title-error" : undefined}
            onChange={() => setError(undefined)}
          />
        </label>
        {error && (
          <p id="request-title-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>{messages.property}</span>
            <select name="property" className={field} required>
              <option value="">{messages.selectProperty}</option>
              {properties.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>{messages.priorityLabel}</span>
            <select name="priority" className={field}>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {messages.priority[priority]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5 text-sm font-medium">
          <span>{messages.description}</span>
          <textarea
            name="description"
            className={field}
            rows={3}
            maxLength={1000}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button variant="outline" />}>
            {messages.cancel}
          </DialogClose>
          <Button type="submit">{messages.createRequest}</Button>
        </div>
      </form>
    </>
  )
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll("ß", "ss")
}

export function SearchDialog({
  requests,
  onProperty,
  onRequest,
}: {
  requests: Request[]
  onProperty: (property: Property) => void
  onRequest: (request: Request) => void
}) {
  const { messages } = useDashboardLocale()
  const properties = useProperties()
  const [query, setQuery] = useState("")
  const normalized = normalizeSearch(query.trim())
  const matches = [
    ...properties.map((property) => ({
      key: property.id,
      title: property.name,
      detail: property.address,
      icon: Building03Icon,
      open: () => onProperty(property),
    })),
    ...requests.map((request) => ({
      key: request.id,
      title: request.title,
      detail:
        properties.find(({ id }) => id === request.propertyId)?.name ?? "",
      icon: Wrench01Icon,
      open: () => onRequest(request),
    })),
  ].filter(({ title, detail }) =>
    normalizeSearch(`${title} ${detail}`).includes(normalized)
  )

  return (
    <>
      <DialogTitle className="pr-8 text-xl font-medium tracking-tight">
        {messages.searchWorkspace}
      </DialogTitle>
      <div className="relative mt-4">
        <HugeiconsIcon
          icon={Search01Icon}
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <input
          data-initial-focus
          type="search"
          className={`${field} pl-9`}
          aria-label={messages.findPropertyOrRequest}
          placeholder={`${messages.findPropertyOrRequest}…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              normalized
            ) {
              matches[0]?.open()
            }
          }}
        />
      </div>
      <ul className="mt-3 max-h-[42svh] space-y-1 overflow-y-auto p-0.5">
        {matches
          .slice(0, normalized ? 10 : 6)
          .map(({ key, title, detail, icon, open }) => (
            <li key={key}>
              <Button
                variant="ghost"
                onClick={open}
                className="h-auto w-full gap-3 px-2 py-2 text-left"
              >
                <HugeiconsIcon icon={icon} className="text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {detail}
                  </span>
                </span>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="text-muted-foreground"
                />
              </Button>
            </li>
          ))}
      </ul>
      {matches.length === 0 && (
        <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
          {messages.noSearchResults}
        </p>
      )}
    </>
  )
}
