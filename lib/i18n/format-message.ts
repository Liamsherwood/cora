const placeholder = /\{(\w+)\}/g

/** Fills `{name}` placeholders in a catalog message. Unknown placeholders stay as written. */
export function formatMessage(message: string, values: Record<string, string>) {
  return message.replace(
    placeholder,
    (token, key: string) => values[key] ?? token
  )
}
