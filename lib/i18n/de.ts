import type en from "./en"

export default {
  metadata: {
    title: "Cora · Immobilienverwaltung",
    description:
      "Verwalten Sie Immobilien, Mieteingänge und Instandhaltung zentral an einem Ort.",
  },
  privacy: {
    title: "Datenschutzerklärung",
    intro: "Diese Datenschutzerklärung beschreibt, wie die CORA-Demo personenbezogene Daten auf dieser Website und im WhatsApp-Assistenten verarbeitet. Bitte verwenden Sie beim Testen erfundene Angaben.",
    contact: {
      title: "Wer für Ihre Daten verantwortlich ist",
      description: "CORA betreibt diese Demo und ist für die Verarbeitung personenbezogener Daten verantwortlich. Fragen zum Datenschutz sowie Auskunfts- oder Löschanfragen richten Sie per E-Mail an",
    },
    sections: {
      website: {
        title: "Website und Browserspeicher",
        paragraphs: [
          "Vercel hostet diese Website und verarbeitet technische Anfragedaten wie IP-Adresse, Browserinformationen, aufgerufene Seite und Zeitpunkt des Aufrufs, um die Website bereitzustellen und Fehler zu untersuchen. Soweit aktiviert, erhält Vercel Speed Insights Seiten-URLs, Geräte- und Browserinformationen sowie Messwerte wie Ladezeiten, um Leistungsprobleme zu erkennen.",
          "Das Dashboard speichert Ihre Änderungen an Demo-Instandhaltungsmeldungen und Ihre Darstellungseinstellung im Browser. Wenn Sie die Websitedaten löschen, werden diese Einstellungen und Änderungen aus diesem Browser entfernt.",
        ],
      },
      whatsapp: {
        title: "WhatsApp-Nachrichten und KI-Antworten",
        paragraphs: [
          "Wenn Sie CORA eine Nachricht senden, übermittelt Metas WhatsApp Cloud API Angaben wie Ihre Telefonnummer oder WhatsApp-Kennung, den verfügbaren Anzeigenamen, den Nachrichtentext, die Nachrichten-ID und den Zeitpunkt. CORA verwendet diese Daten, um das Gespräch zuzuordnen und zu antworten. Das Senden einer Nachricht ist freiwillig und Voraussetzung für eine Antwort. Bitte senden Sie keine Zahlungsdaten, Passwörter, Ausweisdokumente oder Angaben über echte Mieterinnen und Mieter.",
          "Für KI-Antworten übermittelt CORA Ihre Nachricht und den jüngsten Gesprächsverlauf über Vercel AI Gateway an den konfigurierten Modellanbieter. Standardmäßig kommt ein Modell von OpenAI zum Einsatz. Der Assistent gibt automatisierte Demo-Antworten. Entscheidungen über Mietverhältnisse, Zahlungen oder tatsächliche Instandhaltungsarbeiten gehören nicht zu seinen Aufgaben.",
          "Supabase hostet die Datenbank für den Gesprächskontext und Angaben zur Nachrichtenverarbeitung. Der Assistent kann bis zu vier jüngste Nachrichtenwechsel für 24 Stunden nach der letzten Aktualisierung des Kontexts wiederverwenden. Zur Erkennung doppelter Nachrichten gilt eine Gültigkeitsdauer von sieben Tagen. Abgelaufene Datensätze können bis zur Bereinigung oder zum Ablauf des Sicherungszeitraums in der Datenbank oder in Sicherungskopien verbleiben.",
        ],
      },
      demo: {
        title: "Partner Connect Demo",
        paragraphs: [
          "Partner Connect verwendet Demo-Datensätze zu Objekten und Mietparteien und speichert Interaktionen wie Angebotsentscheidungen und simulierte Bestellungen in der Demo-Datenbank. Wird die optionale Sprachfunktion aktiviert und verwendet, können ElevenLabs und dessen Telefonieanbieter Twilio die Zieltelefonnummer, die Sprachinteraktion und die für das Gespräch erforderlichen Angebotsdaten erhalten.",
          "Die Demo-Vorgänge können über die Zurücksetzfunktion gelöscht werden. Für technische Protokolle und Aufzeichnungen der Anbieter gelten die Aufbewahrungseinstellungen des jeweiligen Dienstes. Ihre Datenschutzanfragen bewahren wir so lange auf, wie es zur Bearbeitung und zur Erfüllung geltender Pflichten erforderlich ist.",
        ],
      },
      legalBasis: {
        title: "Zwecke und Rechtsgrundlagen",
        paragraphs: [
          "CORA stützt die oben beschriebene Verarbeitung auf berechtigte Interessen gemäß Art. 6 Abs. 1 lit. f DSGVO. Diese Interessen bestehen darin, den Prototyp bereitzustellen und abzusichern, Leistungs- und Zustellprobleme zu untersuchen, die von Ihnen ausgewählten Abläufe vorzuführen und auf Ihre Nachrichten zu antworten. Soweit eine rechtliche Pflicht zur Verarbeitung besteht, gilt Art. 6 Abs. 1 lit. c DSGVO.",
          "Dienstleister können Daten außerhalb des Europäischen Wirtschaftsraums verarbeiten, unter anderem in den USA. Die veröffentlichten Datenschutzbedingungen von Vercel und Supabase sehen, soweit anwendbar, die EU-Standardvertragsklauseln vor. Auf Anfrage erhalten Sie Auskunft zu einer konkreten Übermittlung und den geltenden Garantien oder eine Kopie dieser Garantien.",
        ],
      },
      rights: {
        title: "Ihre Datenschutzrechte",
        paragraphs: [
          "Je nach den gesetzlichen Voraussetzungen können Sie Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit verlangen. Soweit wir uns auf berechtigte Interessen stützen, können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, Widerspruch einlegen. Sie können sich bei einer zuständigen Datenschutzaufsichtsbehörde beschweren. Über die oben genannte E-Mail-Adresse können Sie Ihre Rechte gegenüber CORA geltend machen.",
        ],
      },
    },
    whatsappLink: "Datenschutzhinweise von WhatsApp",
    vercelLink: "Datenschutzbedingungen von Vercel",
    supabaseLink: "Datenschutzbedingungen von Supabase",
    authorityLink: "Datenschutzaufsichtsbehörde finden",
  },
  dashboard: {
    privacyPolicy: "Datenschutzerklärung",
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
        title: "Wasseraustritt in Wohnung 3.02",
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
          "Die Gegensprechanlage für die Wohnung 2. OG links klingelt sporadisch.",
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
