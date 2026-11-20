import type en from "./en"

export default {
  metadata: {
    title: "Cora · Immobilienverwaltung",
    description:
      "Verwalten Sie Immobilien, Mieteingänge und Instandhaltung zentral an einem Ort.",
  },
  dashboard: {
    nav: {
      overview: "Übersicht",
      properties: "Objekte",
      maintenance: "Instandhaltung",
      rent: "Mieteingang",
      services: "Services",
    },
    headings: {
      overview: {
        title: "Portfolioübersicht",
        description:
          "Behalten Sie Belegung, Mieteingänge und Instandhaltung Ihrer Objekte im Blick.",
      },
      properties: {
        title: "Objekte",
        description:
          "Sehen Sie die Belegung und laufende Instandhaltung für jedes Objekt.",
      },
      maintenance: {
        title: "Instandhaltung",
        description: "Verfolgen Sie Meldungen vom Eingang bis zur Erledigung.",
      },
      rent: {
        title: "Mieteingang",
        description:
          "Vergleichen Sie eingegangene und erwartete Mieten für Ihr Portfolio.",
      },
    },
    status: {
      Open: "Offen",
      "Awaiting vendor": "Rückmeldung ausstehend",
      Scheduled: "Geplant",
      Resolved: "Erledigt",
    },
    priority: {
      Routine: "Normal",
      High: "Hoch",
      Urgent: "Dringend",
    },
    demoRequests: {
      heating: {
        title: "Heizungsausfall",
        description:
          "Bewohner im dritten Stock melden kalte Heizkörper. Eine Überprüfung der Heizungsanlage veranlassen.",
      },
      leak: {
        title: "Wasseraustritt in Wohnung 3B",
        description:
          "Unter der Küchenspüle sammelt sich Wasser. Die Wasserzufuhr zur Wohnung wurde abgestellt.",
      },
      entry: {
        title: "Reparatur der Eingangstür",
        description:
          "Die Haupteingangstür schließt langsam und rastet manchmal nicht ein. Ein Angebot steht noch aus.",
      },
      inspection: {
        title: "Aufzugsprüfung",
        description:
          "Jährliche Aufzugsprüfung durch die zuständige Wartungsfirma.",
      },
      lighting: {
        title: "Treppenhausbeleuchtung austauschen",
        description:
          "Zwei Leuchten auf dem Treppenabsatz im zweiten Stock müssen ausgetauscht werden.",
      },
      intercom: {
        title: "Störung der Gegensprechanlage",
        description:
          "Die Gegensprechanlage für Wohnung 2A klingelt sporadisch.",
      },
    },
    skipToContent: "Zum Inhalt springen",
    closeDialog: "Dialog schließen",
    coraOverview: "Cora-Übersicht",
    portfolio: "Portfolio",
    workspace: "Arbeitsbereich",
    currentWorkspaceView: "Aktuelle Ansicht im Arbeitsbereich",
    demoWorkspace: "Demo-Arbeitsbereich",
    appearance: "Darstellung",
    workspaceAppearance: "Darstellung des Arbeitsbereichs",
    system: "Systemeinstellung",
    light: "Hell",
    dark: "Dunkel",
    searchWorkspace: "Arbeitsbereich durchsuchen",
    findPropertyOrRequest: "Objekt oder Meldung suchen",
    noSearchResults: "Keine passenden Objekte oder Meldungen gefunden.",
    reportingMonth: "Berichtsmonat für Mieteingänge",
    newRequest: "Neue Meldung",
    newRequestDescription:
      "Erfassen Sie ein Instandhaltungsproblem für ein Objekt.",
    requestTitle: "Titel",
    requestTitleExample: "z. B. Heizungsausfall",
    missingRequestTitle: "Geben Sie einen Titel für die Meldung ein.",
    selectProperty: "Objekt auswählen",
    priorityLabel: "Priorität",
    description: "Beschreibung (optional)",
    cancel: "Abbrechen",
    createRequest: "Meldung erstellen",
    requestCreated: "„{title}“ wurde erstellt.",
    requestResolved: "„{title}“ wurde als erledigt markiert.",
    requestReopened: "„{title}“ wurde wieder geöffnet.",
    requestPriority: "Priorität: {priority}",
    markResolved: "Als erledigt markieren",
    reopenRequest: "Meldung wieder öffnen",
    filterRequests: "Instandhaltungsmeldungen filtern",
    active: "Laufend",
    activeRequests: "Laufende Meldungen",
    noRequests: "Keine Meldungen vorhanden.",
    needsAttention: "Handlungsbedarf",
    attentionCount: "Handlungsbedarf ({count})",
    attentionDescription: "Dringende Meldungen und ausstehende Rückmeldungen",
    viewAttentionQueue: "Meldungen mit Handlungsbedarf ansehen",
    managedUnits: "{count} Einheiten in Verwaltung",
    occupiedUnits: "{occupied} von {total} Einheiten belegt",
    occupancy: "Belegung",
    rentCollected: "Mieteingänge",
    previousMonth: "ggü. Vormonat",
    urgentCount: "{count} dringend",
    noUrgentRequests: "Keine dringenden Meldungen",
    managedProperties: "{count} verwaltete Objekte",
    viewProperties: "Objekte ansehen",
    property: "Objekt",
    units: "Einheiten",
    occupied: "Belegt",
    vacant: "Frei",
    details: "Details",
    viewProperty: "{name} ansehen",
    collected: "Eingegangen",
    expected: "Erwartet",
    outstanding: "Ausstehend",
    chartDescription: "Eingegangene und erwartete Mieten",
    chartThousands: "{amount} Tsd. €",
    chartBar: "{month}. {collected} von {expected} eingegangen.",
    chartCollected: "{amount} eingegangen",
    chartExpected: "{amount} erwartet",
  },
} satisfies typeof en
