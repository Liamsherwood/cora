const en = {
  metadata: {
    title: "Cora · Property management",
    description:
      "Manage properties, rent collection, and maintenance in one workspace.",
  },
  dashboard: {
    nav: {
      overview: "Overview",
      properties: "Properties",
      maintenance: "Maintenance",
      rent: "Rent collection",
      services: "Services",
    },
    headings: {
      overview: {
        title: "Portfolio overview",
        description:
          "Track occupancy, rent, and maintenance across your properties.",
      },
      properties: {
        title: "Properties",
        description:
          "See occupancy and maintenance activity for each property.",
      },
      maintenance: {
        title: "Maintenance",
        description: "Track requests from first report to resolution.",
      },
      rent: {
        title: "Rent collection",
        description:
          "Compare collected and expected rent across your portfolio.",
      },
    },
    status: {
      Open: "Open",
      "Awaiting vendor": "Awaiting vendor",
      Scheduled: "Scheduled",
      Resolved: "Resolved",
    },
    priority: {
      Routine: "Routine",
      High: "High",
      Urgent: "Urgent",
    },
    demoRequests: {
      heating: {
        title: "Heating outage",
        description:
          "Residents on the third floor reported that their radiators are cold. Arrange a boiler inspection.",
      },
      leak: {
        title: "Water leak in unit 3B",
        description:
          "Water is pooling under the kitchen sink. The resident has shut off the supply to the unit.",
      },
      entry: {
        title: "Entry door repair",
        description:
          "The main entrance door closes slowly and sometimes fails to latch. Waiting on a quote.",
      },
      inspection: {
        title: "Elevator inspection",
        description:
          "Annual elevator inspection with the building’s service contractor.",
      },
      lighting: {
        title: "Replace stairwell lighting",
        description: "Two lights on the second-floor landing need replacement.",
      },
      intercom: {
        title: "Intercom fault",
        description:
          "The entry intercom for unit 2A is ringing intermittently.",
      },
    },
    skipToContent: "Skip to content",
    closeDialog: "Close dialog",
    coraOverview: "Cora overview",
    portfolio: "Portfolio",
    workspace: "Workspace",
    currentWorkspaceView: "Current workspace view",
    demoWorkspace: "Demo workspace",
    appearance: "Appearance",
    workspaceAppearance: "Workspace appearance",
    system: "System",
    light: "Light",
    dark: "Dark",
    searchWorkspace: "Search workspace",
    findPropertyOrRequest: "Find a property or request",
    noSearchResults: "No matching properties or requests.",
    reportingMonth: "Rent reporting month",
    newRequest: "New request",
    newRequestDescription: "Log a maintenance issue for a property.",
    requestTitle: "Title",
    requestTitleExample: "e.g. Heating outage",
    missingRequestTitle: "Enter a title for the request.",
    selectProperty: "Select a property",
    priorityLabel: "Priority",
    description: "Description (optional)",
    cancel: "Cancel",
    createRequest: "Create request",
    requestCreated: "{title} created.",
    requestResolved: "{title} resolved.",
    requestReopened: "{title} reopened.",
    requestPriority: "{priority} priority",
    markResolved: "Mark resolved",
    reopenRequest: "Reopen request",
    filterRequests: "Filter maintenance requests",
    active: "Active",
    activeRequests: "Active requests",
    noRequests: "No requests to show.",
    needsAttention: "Needs attention",
    attentionCount: "Needs attention ({count})",
    attentionDescription: "Urgent requests and vendor follow-ups",
    viewAttentionQueue: "View attention queue",
    managedUnits: "{count} units under management",
    occupiedUnits: "{occupied} of {total} units occupied",
    occupancy: "Occupancy",
    rentCollected: "Rent collected",
    previousMonth: "vs. previous month",
    urgentCount: "{count} urgent",
    noUrgentRequests: "No urgent requests",
    managedProperties: "{count} managed properties",
    viewProperties: "View properties",
    property: "Property",
    units: "Units",
    occupied: "Occupied",
    vacant: "Vacant",
    details: "Details",
    viewProperty: "View {name}",
    collected: "Collected",
    expected: "Expected",
    outstanding: "Outstanding",
    chartDescription: "Collected vs. expected rent",
    chartThousands: "€{amount}k",
    chartBar: "{month}. {collected} collected of {expected} expected.",
    chartCollected: "{amount} collected",
    chartExpected: "{amount} expected",
  },
}

export default en
