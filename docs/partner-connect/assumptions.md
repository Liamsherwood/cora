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
