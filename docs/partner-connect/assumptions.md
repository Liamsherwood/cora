# Assumptions ("tell us what you assumed")

## Real vs mocked
- **Mocked:** centrix itself (the portfolio tables in `lib/db/schema`, read only through `lib/centrix/repository.ts` behind `/api/centrix/*`, swappable for the real API), the partner's backend (partner dashboard + signed webhooks), telephony if no ElevenLabs/Twilio keys are set (call is simulated).
- **Real:** the workflow engine, consent gate, data minimisation, webhook signing/verification, idempotency, the connector spec validation, the ElevenLabs outbound call + server tool when keys are configured.

## Data centrix realistically holds
- Unit master data (address, size, floor, meters) comes from onboarding/handover; the tenant's email/phone and move-in date come from the lease.
- Meter numbers can be missing after a migration from the previous manager. The engine refuses to order if a field the partner needs is missing instead of sending blanks (to be asked from the tenant – next step).

## Timing
- Internet activation needs ~10 business days (assumption based on typical provider lead times of 6–14 working days). The reltix example (event 20 Nov, move-in 1 Dec) leaves 7 business days → fibre can't be live on day one, so the offer includes a free 5G router as a bridge and is honest about the real start date.
- Business days skip weekends and national holidays (25/26 Dec, 1 Jan). State holidays are not modelled.
- `DEMO_NOW` pins the clock to the example date for a reproducible demo.

## Consent & privacy (GDPR)
- Sharing tenant data with a sales partner needs explicit consent (Art. 6(1)(a)). Consent is captured per partner and purpose, with channel and timestamp, and stored on the resulting contract.
- Data minimisation: the partner gets exactly the fields declared in its manifest; consenting to fewer blocks the order, more is refused.
- Declining shares nothing. Consent can be revoked (`revoked_at`); a revoked consent blocks ordering.
- The voice agent discloses that it is an AI in its first sentence (EU AI Act Art. 50 transparency).

## Costs (cost-per-case counter)
- Voice: ~€0.12 per minute, ~2.5 min per call → ~€0.30 per case.
- Manual baseline: 12 contacts × 4 min at €35/h incl. overhead → ~€28 per case. Both are rough estimates.

## Side tasks of a move-in not built (but modelled)
- Wohnungsgeberbestätigung for residence registration, meter reading to the metering company: same event, would plug in as further connectors.

## Maintenance tickets: contractor booking
- **Real:** the matching and the booking. Candidates are the contractors whose profile (`contractor_profiles`) covers the ticket's trade; they are ranked by service area covering the building, 24/7 cover for emergencies, earlier jobs in the same building, distance and open workload (`lib/contractors/match.ts`, no model). Booking writes a work order, moves the case to `scheduled` and records a `work_order.scheduled` event; the voice agent reads the visit back through `get_cases`.
- **Simulated:** the contractor's confirmation. Production would send the job by e-mail, portal or WhatsApp and wait for the contractor to accept or counter the slot.
- Trades and service areas are master data centrix would hold per contractor. In the seed they follow each firm's job history and phone area code; four Aachen firms were added so the hand-made demo building has local options.
- Distances are town centre to town centre. Production would geocode addresses.
- Visit slots: emergencies within 90 minutes; otherwise 08:00, 10:00, 13:00 or 15:00 on working days (Saturdays too when urgent), clear of the contractor's booked jobs. Response targets: emergency 2 h, high 24 h, normal 3 working days, low 10 working days; booking a contractor meets the target.
- Internet faults the property manager owns are the building's wiring, so they go to an electrician; the tenant's own line is their provider's job.
