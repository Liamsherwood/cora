const en = {
  metadata: {
    title: "Cora · Property management",
    description:
      "Manage properties, rent collection, and maintenance in one workspace.",
  },
  privacy: {
    title: "Privacy policy",
    intro: "This notice explains how the CORA demo handles personal data on this website and in its WhatsApp assistant. Please use fictional details when testing the demo.",
    contact: {
      title: "Who is responsible for your data",
      description: "CORA operates this demo and is responsible for its processing of personal data. For privacy questions, access or deletion requests, email",
    },
    sections: {
      website: {
        title: "Website and browser storage",
        paragraphs: [
          "Vercel hosts the website and processes technical request information such as IP address, browser information, requested page and request time to deliver the site and diagnose errors. Where enabled, Vercel Speed Insights receives page URLs, device and browser information, and measurements such as loading times to help identify performance problems.",
          "The dashboard saves changes you make to demo maintenance requests and your appearance preference in your browser. Clearing site data removes these saved settings and changes from that browser.",
        ],
      },
      whatsapp: {
        title: "WhatsApp messages and AI replies",
        paragraphs: [
          "When you message CORA, Meta’s WhatsApp Cloud API passes us information such as your phone number or WhatsApp identifier, available display name, message text, message ID and time. CORA uses this information to route the conversation and reply. Sharing a message is voluntary and is needed for a reply. Please keep payment details, passwords, identity documents and information about real tenants out of the chat.",
          "For AI replies, CORA sends your message and recent conversation text through Vercel AI Gateway to the configured model provider. The default model is from OpenAI. The assistant provides automated demo replies. Decisions about a tenancy, payments or actual maintenance work are outside the assistant’s role.",
          "Supabase hosts the database that stores conversation context and message processing information. The assistant can reuse up to four recent exchanges for 24 hours after the context was last updated. Message deduplication uses a seven-day expiration window. Expired records may remain in the database or in backups until removed under the applicable cleanup or backup settings.",
        ],
      },
      demo: {
        title: "Partner Connect demo",
        paragraphs: [
          "Partner Connect uses demo property and tenant records and stores interactions such as offer decisions and simulated orders in the demo database. Where the optional voice feature is enabled and used, ElevenLabs and its telephony provider Twilio may receive the destination phone number, voice interaction and the offer details needed for the call.",
          "Demo workflow records can be cleared through the demo reset. Technical logs and provider records are kept according to the relevant service’s retention settings. If you contact us about privacy, we retain your correspondence as needed to handle the request and meet applicable obligations.",
        ],
      },
      legalBasis: {
        title: "Why we process the data",
        paragraphs: [
          "For the purposes described above, CORA relies on its legitimate interests under Article 6(1)(f) GDPR in providing and securing the prototype, diagnosing performance and delivery problems, demonstrating the workflows you choose to try, and replying to messages you choose to send. Where we have a legal obligation to process information, Article 6(1)(c) GDPR applies.",
          "Service providers may process information outside the European Economic Area, including in the United States. Vercel’s and Supabase’s published data processing terms provide for EU standard contractual clauses where applicable. Contact us for details of a particular transfer, the applicable safeguards or a copy of those safeguards.",
        ],
      },
      rights: {
        title: "Your privacy rights",
        paragraphs: [
          "Depending on the circumstances, you can request access, correction, deletion, restriction of processing or a portable copy of your data. You may object on grounds relating to your particular situation where we rely on legitimate interests. You can also complain to a competent data protection authority. Use the email above to exercise your rights with CORA.",
        ],
      },
    },
    whatsappLink: "WhatsApp privacy notice",
    vercelLink: "Vercel data processing terms",
    supabaseLink: "Supabase data processing terms",
    authorityLink: "Find a data protection authority",
  },
  dashboard: {
    privacyPolicy: "Privacy policy",
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
