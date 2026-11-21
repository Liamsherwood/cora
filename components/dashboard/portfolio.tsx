"use client"

import { createContext, use, type ReactNode } from "react"

import type { Property } from "./data"

const PortfolioContext = createContext<Property[] | null>(null)

/** The managed properties, loaded on the server from the centrix data. */
export function PortfolioProvider({
  properties,
  children,
}: {
  properties: Property[]
  children: ReactNode
}) {
  return <PortfolioContext value={properties}>{children}</PortfolioContext>
}

export function useProperties() {
  const properties = use(PortfolioContext)
  if (!properties) throw new Error("PortfolioProvider is missing")
  return properties
}
