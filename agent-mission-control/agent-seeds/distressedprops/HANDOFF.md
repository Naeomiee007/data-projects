# DistressedProps CRM and integration handoff

**Status as of November 19, 2026**  
**For Naomi or the next AI agent working on DistressedProps, Make, and ActiveCampaign**

## 1. Where the project stands

The ActiveCampaign CRM foundation is built. Contacts, lists, fields, tags, and segments were set up through imports, and the team subsequently imported an updated customer grouping. The welcome and education automation was reported live in November. A paid-customer automation was also shown in ActiveCampaign, with draft emails and a warning on its trigger card.

The live DistressedProps → Make → ActiveCampaign path is still unverified. A November 18 project recap described the connections as incomplete. There is no confirmed DistressedProps scenario name, module inventory, real signup/payment webhook run, or inbox delivery in the available evidence. Native Stripe → ActiveCampaign was paused at authentication. A manual import bridge exists.

**Current goal:** Automatically send the right email when a user registers without paying and when a registered user starts paying. Cancellation is optional. Success requires evidence from DistressedProps or its billing system, Make execution history if Make is used, the ActiveCampaign contact and automation histories, and the receiving inbox.

## 2. ActiveCampaign inventory

| Item | What has been built or observed | Status and evidence |
|---|---|---|
| Lists | `DistressedProps Marketing` for confirmed email subscribers. `Master Contact List` exists in the shared account. | Documented in the October manual. Keep DistressedProps and PawPlex populations isolated. |
| Field group | `DistressedProps Data` | Documented as built. See field inventory below. |
| Website-user import | 756 contacts imported as contact records only. Included standard contact details, group, registration date, last activity, and request counts. Added `DistressedProps \| Website User`. | October manual records a checked contact with fields and tag and without email/SMS list membership. |
| Subscriber import | Updated existing contacts, mapped Subscription Status in addition to the original nine columns, and activated the confirmed subscribers on `DistressedProps Marketing`. | 914 active list members observed immediately after the October import. Historical count. |
| Last Active correction | Fixed ISO-date parsing in Sheets. Converted relative dates to dated values and left “never” blank. Applied a narrow correction import using Email and `DP \| Last Active Date`. | October manual records the correction and verification. Freeze relative dates as values before export. |
| Historical segments | `DP \| Warm`, `DP \| Cold post-paywall`, `DP \| Wicked cold - used it`, `DP \| Wicked cold - never activated`, based on `DP \| Group`. | Documented in October. These describe earlier engagement tiers. |
| Stripe identity bridge | `DP \| User ID`, `DP \| Stripe Customer ID`, and `DP \| Subscription Status` consolidated through the manual data workflow. Stripe sample record had a Stripe Customer ID and website `user_id` metadata. | Manual bridge reported completed October 9. The sample confirms the linkage exists for at least one record. Coverage across all users is unverified. |
| November customer segmentation | Updated import was reported complete. `DP \| Customer Group` was discussed as the field for targeting. | Review current field and values, saved segments, and affected contacts in ActiveCampaign. Naomi reported everyone was subscribed except Hold, but the discussion also showed uncertainty about exact list membership after the import. Verify the **DistressedProps Marketing** list and consent before a send. |
| Welcome and education | `DP \| 01 – Welcome & Education` was reported live by November. | The October manual predates this and shows onboarding as next. Current trigger, audience, exclusions, and live status need a fresh check before using this for unpaid registrations. |
| Paid automation | November 18 screenshot shows the trigger “Tag `DP - Paid Customer` is added”, with a warning icon. Four send steps were in draft, with waits of 2, 3, and 4 days between them. | Screenshot evidence. Resolve the warning, confirm the automation name and entry rules, and verify which emails are now ready. The screenshot showed 0 sends on the visible steps. |
| Other automation work | Account welcome and inactive-user flows were discussed or planned. Abandoned checkout was deferred to Stripe in later notes. | Check the current automation list before building duplicates. Prior plans provide no evidence of activation or delivery. |
| Native Stripe integration | Restricted-key setup reached Stripe 2FA and paused. | Native sync and native email triggers remain unverified. Stripe data and payment status continue to be handled through the manual workflow in the last documented state. |

### Field inventory

| Fields | Purpose |
|---|---|
| `DP \| Group` | Historical engagement group. Distinct from the November customer grouping. |
| `DP \| Customer Group` | November customer grouping discussed for campaign targeting. Confirm exact dropdown values and targeting visibility. |
| `DP \| Registered Date`, `DP \| Last Active Date` | Website dates. |
| `DP \| Requests 30 Days`, `DP \| Requests Lifetime` | Website usage counts stored as text fields. |
| `DP \| Subscription Status` | October dropdown values included Active, Canceled, Canceling, Complimentary, Trial, and Trialing. Blank means unknown. |
| `DP \| User ID`, `DP \| Stripe Customer ID` | Stable identifiers for matching website and Stripe records. |
| `DP \| Billing Frequency` | Optional field documented as created. Lifetime Spend was deliberately skipped. |

October 15 historical tag counts were 928 Website User, 37 Current Users, 42 Investor Prospects, 14 Prior, 49 Research Prospects, and 0 Do Not Send under the `DistressedProps |` naming scheme. These are tag snapshots. Use current group and list data for targeting.

### November 12 customer groups

| Group | Count | Meaning |
|---|---:|---|
| Current customers | 61 | Paying or currently trialing. This CRM group combines two billing states. |
| Past customers | 93 | Canceled. 17 previously paid and 76 only trialed. |
| Prospects | 758 | 683 site users who never subscribed, 73 people who opted in for title information without an account, plus 2 corrected addresses. |
| Signed up, never used | 120 | Registered and never came back. |
| Hold | 219 | Unsubscribes, bounces, internal/test accounts and flagged records. Suppress from marketing. |

Title interest and Active last 30 days are filter columns. Keep list membership and suppression as separate checks from CRM group, website signup, or Stripe payment. The October list size and November group counts are different snapshots and should be audited at the source if reconciliation is needed.

## 3. Make inventory and unresolved evidence

| Item | What the records support |
|---|---|
| Platform decision | Make was selected as a routing layer in the September tracker. The corrected tracker shows DistressedProps Make tasks still to do at that point. |
| Website → Make | Earlier handoff material proposed server-side `account_created` and `checkout_started` events, including account identity and delivery metadata. There is no verified DistressedProps production receipt from either hook. |
| Make → ActiveCampaign | The plan was to find or create a contact, update relevant fields, and apply a tag that starts the automation. Actual module configuration, filters, connection, and real-run evidence remain to be inspected. |
| Stripe checkout test | Prior discussion mentions an August expired-checkout webhook attempt without confirmed completion. Treat it as an unverified historical attempt and outside the present launch. |
| PawPlex boundary | The shared workspace contains PawPlex Gingr/Jotform work, including Make integrations. Those scenario results do not establish DistressedProps connectivity. |

## 4. Current launch scope and division of work

| Owner | Responsibility |
|---|---|
| Melanie | Confirms audience, copy, timing and business meaning of paid versus unpaid. The two launch triggers are registered without paying and registered and paying. Cancellation is wishlist. If added later, use informational wording without a retention pitch. |
| Peter | Confirm where registration is committed and how the first successful DistressedProps subscription payment is identified and matched back to the account. Reuse existing server-side hooks if present. Implement or adapt event delivery as needed and generate actual staging test events. |
| Naomi | Own the Make and ActiveCampaign setup, private handoff of any verified test endpoint, email copy and sender, consent safeguards, contact/tag mapping, and final delivery checks. |
| Next AI agent | Audit existing configuration and evidence before recommending new work. Report each recommendation as **Problem → Evidence → Solution → Next Action**. Use official vendor docs and verify each claimed milestone with account evidence. |

### Recommended flow to validate

1. **Registration:** When the DistressedProps account is created and has no successful subscription payment, the app sends a server-side event. Make uses the DistressedProps account email to resolve the contact and add the unpaid trigger tag. ActiveCampaign starts the approved unpaid flow once for eligible recipients.
2. **Payment:** When the same account makes its first successful DistressedProps subscription payment, the app or verified billing integration sends the paid signal. ActiveCampaign applies or receives the paid trigger, starts the paid flow once, and stops pending unpaid follow-ups. Gate the unpaid flow against paid status so a delayed or replayed signup cannot restart it.
3. **Billing edge cases:** Confirm whether free trials and complimentary accounts count as unpaid, which plans qualify, and whether payment can follow signup immediately in the same checkout. The prior recommendation treated free trials as unpaid and required a successful non-zero subscription payment for paid. These are proposed eligibility rules. Exclude renewals and one-off title-report purchases from a first-subscription-payment trigger. A checkout completion or Active status alone may not prove that a qualifying payment was collected.
4. **Routing decision:** The simplest proposed setup is one authenticated Make endpoint with two event routes when DistressedProps can provide both signals. A native Stripe route can handle paid onboarding if its account linkage, first-payment semantics, and recipient behavior are demonstrated in testing. Pick one paid route to avoid duplicate sends.

### Peter’s exact handoff

- Confirm any existing DistressedProps events and their exact names, where they fire, and sample staging payloads. Reuse names already implemented when the semantics match.
- Confirm how Stripe’s customer or subscription maps to the DistressedProps account, including when billing email differs from the account email. The website user ID is the durable link.
- If Make handles both routes, POST both from the DistressedProps backend to Naomi’s verified test endpoint. The minimal mapping uses `event` and `email`. Include `website_user_id`, a stable `event_id` reused on retries, and `occurred_at` if available for matching and troubleshooting. Keep endpoint credentials private.
- Provide a staging signup and a first successful test subscription payment for the same account, along with the event IDs or timestamps for tracing.

Proposed event examples, pending confirmation of the actual schema:

```json
{"event":"registered_unpaid","email":"test-account@example.com","website_user_id":"dp_test_001","event_id":"evt_signup_001","occurred_at":"2026-11-19T15:00:00Z"}
{"event":"first_subscription_payment","email":"test-account@example.com","website_user_id":"dp_test_001","event_id":"evt_paid_001","occurred_at":"2026-11-19T15:10:00Z"}
```

## 5. Build order and acceptance tests

| Problem | Evidence | Solution | Next Action |
|---|---|---|---|
| Existing Make build is unclear. | Tracker and notes document plans. Real DistressedProps executions remain unverified. | Inspect scenario modules, active state, and history before adding anything. | Make → **Scenarios** → open DistressedProps scenario if listed → **History** and scenario canvas. Record webhook, routes, and ActiveCampaign modules with secrets redacted. |
| Paid trigger could accept the wrong billing event. | Stripe trial and payment states differ. Invoice events also occur for renewals. | Validate a first qualifying payment mapped to the website account. | Ask Peter for the actual registration and first-payment event examples. |
| A run can succeed while no email arrives. | Paid screenshot showed drafts, a trigger warning, and zero sends. List subscription affects automation emails. | Review live status, sender, eligible audience, suppression and one-time entry for both flows. | ActiveCampaign → **Automations** → open each automation → inspect the trigger and each **Send an email** action. Check the test contact’s list status. |
| A conversion could still receive unpaid reminders. | Paid and unpaid are separate entries and the app can retry events. | Mark paid durably, exit unpaid on conversion, and suppress stale signup events. | Test sequence below using a controlled test recipient. |

| Test | Pass condition |
|---|---|
| Register without paying | Real signup event appears in history, the intended ActiveCampaign contact enters the unpaid flow once, and the expected email arrives. |
| Pay with that account | A real staging subscription payment resolves to the same contact. The paid email arrives once and remaining unpaid follow-ups stop. |
| Replay paid event and send late signup | No duplicate paid email and no new unpaid email for the already paid contact. |
| Trial, failed payment, one-off purchase, renewal | No first-paid onboarding from those events under the proposed rule. |
| Hold or unsubscribed contact | Suppression is preserved and marketing emails do not go out. |
| Launch evidence | Save test event IDs and times, Make execution IDs where applicable, contact and automation history, and inbox timestamps before enabling production delivery. |

## 6. Source documents

- [DistressedProps CRM & Automation Reference Manual, October 8](https://chatgpt.com/library?file_id=libfile_e1ca4f73208481918059df91b61b3bc9&account_id=personal) records the CRM build and Stripe authentication pause.
- [Corrected September launch tracker](https://chatgpt.com/library?file_id=libfile_5721dbb1469881918787a396bad10b33&account_id=personal) distinguishes foundation work from planned webhooks and Make tasks.
- [Peter’s August build workbook](https://chatgpt.com/library?file_id=libfile_7e9d4dca6d74819191f6eadb60383304&account_id=personal) captures the original specification approach and broader lifecycle backlog. Use Melanie’s November scope for the current release.
- [November 18 paid automation screenshot](https://chatgpt.com/library?file_id=libfile_4e9fe6638b7c819198a9b822f3d3421f&account_id=personal) shows the paid tag trigger and the draft email steps. November conversation notes supply the reported segmentation and welcome automation status.
- Vendor references used for the technical plan. [Make webhooks](https://help.make.com/webhooks) · [Make ActiveCampaign modules](https://apps.make.com/activecampaign) · [ActiveCampaign tag trigger](https://help.activecampaign.com/hc/en-us/articles/115001852744-How-do-I-trigger-an-automation-to-run-when-a-tag-is-added-to-a-contact) · [ActiveCampaign delivery troubleshooting](https://help.activecampaign.com/hc/en-us/articles/6079755796252-Contact-did-not-receive-automation-email) · [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks)

## Copy into a new AI conversation

> Use this report as the DistressedProps project handoff. Act as an independent technical troubleshooting agent. Start by inspecting the existing DistressedProps scenario in Make and its run history. Reuse existing setup where verified. Keep the release to registered without paying and registered and paying. Cancellation is optional. Confirm the exact ask for Peter from the actual app and billing flow. For each recommendation, give Problem → Evidence → Solution → Next Action. Prove each milestone with logs, contact and automation history, and inbox delivery before calling it done.
