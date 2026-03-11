# Twilio WhatsApp Content Templates — Yarro

Reference for all WhatsApp templates. Lives next to `templates.ts` (the SID registry).
Update both files together when templates change.

---

## Formatting Rules

- **Bold label text only** — never bold emojis
- Bold header on one line, variable value on next line, blank line between fields
- "Media" not "Photos"
- UK phone format: `+44 7123 456789` (formatted in code via `formatUkPhone()`)
- No shortRef (T-xxxxx) — dropped from all templates
- Portal-first: WhatsApp = nudge, portal = experience

---

## Template Registry

### 1 — Ticket Notifications (yarro-ticket-notify)

#### 1_pm_ticket
| Field | Value |
|-------|-------|
| SID | `HXae68475514259fc241bb14e303280420` |
| Key | `pm_ticket` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-ticket-notify` |
| Status | Approved (Mar 9, 2026) |

**Copy:**
```
🔔 *{{1}} at {{2}}*

This was reported by {{3}} at {{4}}

We have contacted your registered contractors already, please check the app for more details.

You'll receive an update when a contractor quote has been sent for review.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Issue description |
| {{2}} | Property address |
| {{3}} | Tenant name |
| {{4}} | Timestamp (e.g. "14:32 on 03/02/26") |

---

#### 1_pm_ticket_review
| Field | Value |
|-------|-------|
| SID | `HX574419d5b8a0ca86734caecf59f1107f` |
| Key | `ticket_review` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-ticket-notify` |
| Status | Approved (Mar 9, 2026) |

**Copy:**
```
🔔 *{{1}} at {{2}}*

This was reported by {{3}} at {{4}}

Please review and dispatch from your dashboard.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Issue description |
| {{2}} | Property address |
| {{3}} | Tenant name |
| {{4}} | Timestamp |

---

#### 1_pm_ticket_handoff
| Field | Value |
|-------|-------|
| SID | `HXee9d75b96aa9a0d094ea51d402b3ed92` |
| Key | `handoff` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-ticket-notify` |
| Status | Approved (Mar 9, 2026) |

**Copy:**
```
🚨 *{{1}} at {{2}}*

This was reported by {{3}} at {{4}}

The AI couldn't resolve this one — please review and take action from your dashboard.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Issue description |
| {{2}} | Property address |
| {{3}} | Tenant name |
| {{4}} | Timestamp |

---

#### 1_ll_ticket
| Field | Value |
|-------|-------|
| SID | `HX6cdfda7a2201f058f33c2a4be3ea8efb` |
| Key | `ll_ticket` |
| Type | Text |
| Recipient | Landlord |
| Edge Function | `yarro-ticket-notify` |
| Status | Approved (Mar 9, 2026) |

**Copy:**
```
🔔 *{{1}} at {{2}}*

This was reported by {{3}} at {{4}}

We're handling this and will keep you updated.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Issue description |
| {{2}} | Property address |
| {{3}} | Tenant name |
| {{4}} | Timestamp |

---

#### 1b_tenant_portal_link
| Field | Value |
|-------|-------|
| SID | `HXa9fe8d047800fb7cc5089fe52d8e1c0a` |
| Key | `tenant_portal_link` |
| Type | CTA |
| Recipient | Tenant |
| Edge Function | `yarro-dispatcher` (sent alongside contractor quote or landlord allocate) |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
Hi {{1}},

Your maintenance request has been logged and we're working on getting it sorted. You can track the progress of your request below.

We'll also message you here with any important updates.
```

**Button:** "Track Request" → `https://app.yarro.ai/tenant/{{2}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Tenant first name |
| {{2}} | Tenant token (CTA URL) |

---

### 2 — Contractor Dispatch (yarro-dispatcher)

#### 2_contractor_quote
| Field | Value |
|-------|-------|
| SID | `HX0a758deb4c7bc64d041f339135726fb3` |
| Key | `contractor_quote` |
| Type | Flows |
| Recipient | Contractor |
| Edge Function | `yarro-dispatcher` → `contractor-sms` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
🔧 *New job request from {{1}}*

🏠 *Property*
{{2}}

🔔 *Issue*
{{3}}

📷 *Media*
{{4}}

⭐️ *Priority*
{{5}}

🔑 *Access*
{{6}}

Tap below to confirm your soonest availability and quote estimate.
```

**Flow:** Button "Submit Quote" → Page 1: Quote amount (£) + Notes

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Business name (PM company) |
| {{2}} | Property address |
| {{3}} | Issue description |
| {{4}} | Media summary (gallery link or "No photos or videos provided") |
| {{5}} | Priority |
| {{6}} | Access info (dynamic: property instructions or tenant availability) |

---

#### 2b_ooh_emergency
| Field | Value |
|-------|-------|
| SID | `HX56ff1b4df78eba8cbdcbbdd8672d82a9` |
| Key | `ooh_emergency_dispatch` |
| Type | CTA |
| Recipient | OOH Contact |
| Edge Function | `yarro-ticket-notify` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
🚨 *Emergency Job — Accept ASAP*

🔧 *From {{1}}*

🏠 *Property*
{{2}}

🔔 *Issue*
{{3}}

📷 *Media*
{{4}}

📞 *Contact*
{{5}}

🔑 *Access*
{{6}}

Tap below to accept this emergency job.
```

**Button:** "Report Status" → `https://app.yarro.ai/ooh/{{7}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Business name (PM company) |
| {{2}} | Property address |
| {{3}} | Issue description |
| {{4}} | Media summary |
| {{5}} | Contact name |
| {{6}} | Access info |
| {{7}} | OOH token (CTA URL) |

---

### 3 — Quote Review (yarro-dispatcher)

#### 3_pm_quote
| Field | Value |
|-------|-------|
| SID | `HXfc449642c7c47ae1f85f3d903ee336e1` |
| Key | `pm_quote` |
| Type | Flows |
| Recipient | PM |
| Edge Function | `yarro-dispatcher` → `pm-sms` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
🧾 *Quote received from {{1}}*

🏠 *Property*
{{2}}

🔔 *Issue*
{{3}}

🧾 *Quote*
{{4}}
{{5}}

📷 *Media*
{{6}}

Tap below to approve or decline.
```

**Flow:** Button "Review Quote" → Page 1: Decision (Approve/Decline) → Page 2: Markup (£)

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Contractor name — Category |
| {{2}} | Property address |
| {{3}} | Issue description |
| {{4}} | Quote amount |
| {{5}} | Quote notes |
| {{6}} | Media summary |

---

#### 3b_landlord_quote
| Field | Value |
|-------|-------|
| SID | `HXc667c8008203a80708c1a1596e4805ea` |
| Key | `landlord_quote` |
| Type | Flows |
| Recipient | Landlord |
| Edge Function | `yarro-dispatcher` → `landlord-sms` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
🧾 *Quote received from {{1}}*

🏠 *Property*
{{2}}

🔔 *Issue*
{{3}}

📷 *Media*
{{4}}

🧾 *Quote*
{{5}}

Tap below to approve or decline.
```

**Flow:** Button "Review Quote" → Page 1: Decision (Approve/Decline) + Reason

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Contractor name |
| {{2}} | Property address |
| {{3}} | Issue description |
| {{4}} | Media summary |
| {{5}} | Total cost |

---

### 4 — Scheduling (yarro-scheduling)

#### 4_contractor_schedule
| Field | Value |
|-------|-------|
| SID | `HXe1297b1dbd016012026d21cfbddd3308` |
| Key | `contractor_job_schedule` |
| Type | CTA |
| Recipient | Contractor |
| Edge Function | `yarro-scheduling` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
✅ *Quote accepted — Book job now*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🧾 *Accepted quote*
{{3}}

🔑 *Access*
{{4}}

Tap below to choose your preferred date and time.
```

**Button:** "Schedule Job" → `https://app.yarro.ai/contractor/{{5}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Accepted quote amount |
| {{4}} | Access info |
| {{5}} | Contractor token (CTA URL) |

---

#### 4b_pm_landlord_approved
| Field | Value |
|-------|-------|
| SID | `HX5248963ca973dfaa1880b216f336e863` |
| Key | `pm_landlord_approved` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-scheduling` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
✅ *Landlord approved the quote from {{1}}*

🏠 *Property*
{{2}}

🔔 *Issue*
{{3}}

👤 *Landlord*
{{4}}

🛠️ *Contractor*
{{1}}

🧾 *Total cost*
{{5}} (Quote: {{6}}, Markup: {{7}})

We will update you once the contractor has booked in.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Contractor name (used twice) |
| {{2}} | Property address |
| {{3}} | Issue description |
| {{4}} | Landlord name |
| {{5}} | Total cost |
| {{6}} | Quote amount |
| {{7}} | Markup amount |

---

### 5 — Job Booked (yarro-scheduling)

#### 5_pm_job_booked
| Field | Value |
|-------|-------|
| SID | `HX564f0801aae8a3e9ded1af83efa251d9` |
| Key | `pm_job_booked` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-scheduling` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
📅 *Maintenance job scheduled — {{1}}*

🏠 *Property*
{{2}}

🔔 *Issue*
{{3}}

🛠️ *Contractor*
{{4}}

No action needed — we have notified the tenant, the landlord, and will send a reminder to the contractor on the day of the job.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Scheduled date |
| {{2}} | Property address |
| {{3}} | Issue description |
| {{4}} | Contractor display (name — formatted phone) |

---

#### 5c_tenant_job_booked
| Field | Value |
|-------|-------|
| SID | `HXd7b01922707c8b93d18abec3c3b37be2` |
| Key | `tenant_job_booked` |
| Type | CTA |
| Recipient | Tenant |
| Edge Function | `yarro-scheduling` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
Hi {{1}},

Your maintenance job has been scheduled for {{2}}.

{{3}} ({{4}}) has been assigned and has indicated they will attend in the {{5}}. They may contact you regarding access.

You can reach them on {{6}} if you have any questions, or check the link below for full details.
```

**Button:** "View Job Details" → `https://app.yarro.ai/tenant/{{7}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Tenant first name |
| {{2}} | Friendly date (e.g. "Saturday 12th Mar") |
| {{3}} | Category with article (e.g. "A plumber") |
| {{4}} | Contractor first name |
| {{5}} | Time of day ("morning" / "afternoon") |
| {{6}} | Contractor phone (UK formatted) |
| {{7}} | Tenant token (CTA URL) |

---

### 6 — Job Reminder (yarro-job-reminder)

#### 6_contractor_job
| Field | Value |
|-------|-------|
| SID | `HXda58fda394cba7fc4e91d2b42bd9ee36` |
| Key | `contractor_job_reminder` |
| Type | CTA |
| Recipient | Contractor |
| Edge Function | `yarro-job-reminder` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
📅 *Reminder - scheduled job today*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🕣 *Arrival*
{{3}}

🔑 *Access*
{{4}}

Please use the link below to report the outcome of this job.
```

**Button:** "View Job" → `https://app.yarro.ai/contractor/{{5}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue title |
| {{3}} | Arrival slot ("Morning" / "Afternoon") |
| {{4}} | Access info |
| {{5}} | Contractor token (CTA URL) |

---

### 7 — Completion (yarro-completion)

#### 7_pm_job_completed
| Field | Value |
|-------|-------|
| SID | `HX3a0180411b1dca11e958c23b6945f4d4` |
| Key | `pm_job_completed` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-completion` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
✅ *Job marked complete*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🛠️ *Contractor*
{{3}}

Check the app for full details.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Contractor display (name — formatted phone) |

---

#### 7b_ll_job_completed
| Field | Value |
|-------|-------|
| SID | `HX27c049df0d097f3be7579c201b6453e3` |
| Key | `ll_job_completed` |
| Type | Text |
| Recipient | Landlord |
| Edge Function | `yarro-completion` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
✅ *Job marked complete*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🛠️ *Contractor*
{{3}}

All details have been recorded and stored. No action needed.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Contractor name |

---

#### 7c_pm_job_not_completed
| Field | Value |
|-------|-------|
| SID | `HXc8356f238f3d6974b639c3a1e236ef1b` |
| Key | `pm_job_not_completed` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-completion` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
⚠️ *Job not completed*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🛠️ *Contractor*
{{3}}

📝 *Reason*
{{4}}

Check the app for full details.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Contractor name |
| {{4}} | Reason |

---

#### 7d_tenant_job_completed
| Field | Value |
|-------|-------|
| SID | `HXb8f048607a9084cc6101ae629da4b8af` |
| Key | `tenant_job_completed` |
| Type | CTA |
| Recipient | Tenant |
| Edge Function | `yarro-completion` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
Hi {{1}},

The maintenance job at your property has been marked as complete.

*Job:* {{2}}

Please use the link below to confirm or report any issues.
```

**Button:** "Leave Feedback" → `https://app.yarro.ai/tenant/{{3}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Tenant first name |
| {{2}} | Issue description |
| {{3}} | Tenant token (CTA URL) |

---

#### 5b_ll_job_booked
| Field | Value |
|-------|-------|
| SID | `HXcdb92e07b25d8b27ff8637502aac0784` |
| Key | `ll_job_booked` |
| Type | Text |
| Recipient | Landlord |
| Edge Function | `yarro-scheduling` |
| Status | Approved (Mar 10, 2026) |

**Copy:**
```
Hi {{1}},

We have scheduled a {{2}} for {{3}} to address the {{4}} at {{5}}.

We will keep you informed as the issue gets resolved.

Feel free to contact us on {{6}} if you have any questions.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Landlord first name |
| {{2}} | Category (e.g. "plumber") |
| {{3}} | Scheduled date |
| {{4}} | Issue description |
| {{5}} | Property address |
| {{6}} | PM phone (UK formatted) |

---

### 2c — Landlord Allocate (yarro-dispatcher)

> Renamed from `21_allocate_landlord`. Grouped under dispatch (group 2).

#### 2c_landlord_allocate
| Field | Value |
|-------|-------|
| SID | `HXeabe4ebe93c1f8d2401c0516bfd376ec` |
| Key | `allocate_landlord` |
| Type | CTA |
| Recipient | Landlord |
| Edge Function | `yarro-dispatcher` → `landlord-allocate` |
| Replaces | `21_allocate_landlord` (`HX7bd3023fd3694bb77ee2b3e05562e06e`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
📋 *Allocated to you*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

👤 *Tenant*
{{3}} — {{4}}

{{5}} has assigned this job for you to manage.

When you have an update, tap below to report status.
```

**Button:** "Report Status" → `https://app.yarro.ai/landlord/{{6}}`

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Tenant name |
| {{4}} | Tenant phone (UK formatted) |
| {{5}} | Business name (PM company) |
| {{6}} | Landlord token (CTA URL) |

---

### 2d — No Contractors (yarro-dispatcher)

> Renamed from `6_no_more_contractors`. Grouped under dispatch (group 2).

#### 2d_no_contractors
| Field | Value |
|-------|-------|
| SID | `HX158401383297f8b6f9d4848e507ea1b0` |
| Key | `no_more_contractors` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-dispatcher` → `pm-nomorecontractors-sms` |
| Replaces | `6_no_more_contractors` (`HX75fb4cc68b9f1fea2f243cbe41ef3a57`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
⚠️ *No contractors available*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

All registered contractors have been contacted with no response. Please review and take action from your dashboard.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |

---

### 3c — Landlord Declined (yarro-scheduling)

> Renamed from `8_landlord_declined`. Grouped under quote review (group 3).

#### 3c_landlord_declined
| Field | Value |
|-------|-------|
| SID | `HX5cc6505f993cfccd9f8e1e5089bef940` |
| Key | `landlord_declined` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-scheduling` |
| Replaces | `8_landlord_declined` (`HXc00be101015bb4abbfce401d5643b7b1`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
❌ *Landlord declined the quote*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🧾 *Quote*
{{3}}

Please review and take action from your dashboard.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Total cost |

---

### 9 — Followups (yarro-followups)

> Renamed from legacy 13-17 numbering. All sent by `yarro-followups` edge function via n8n cron triggers.

#### 9a_contractor_reminder
| Field | Value |
|-------|-------|
| SID | `HXf09513c99a0af31ae036e7e4c1c69676` |
| Key | `contractor_reminder` |
| Type | Text |
| Recipient | Contractor |
| Edge Function | `yarro-followups` → `contractor-reminder-sms` |
| Replaces | `13_contractor_reminder_sms` (`HXfca88665335df9e9ffd37b19cd582563`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
🔔 *Reminder — quote still needed*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

{{3}} is still awaiting your response. Please submit your quote at your earliest convenience.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Business name (PM company) |

---

#### 9b_landlord_reminder
| Field | Value |
|-------|-------|
| SID | `HXc377553166d7cb61c84cbcb859502d9e` |
| Key | `pm_contractor_timeout` |
| Type | Text |
| Recipient | Landlord |
| Edge Function | `yarro-followups` → `landlord-followup-sms` |
| Replaces | `14_landlord_followup_sms` (`HXd746635799ab8ae73c7506abf6ddade1`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
🔔 *Reminder — approval still needed*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🛠️ *Contractor*
{{3}}

🧾 *Quote*
{{4}}

This quote has been awaiting your approval for {{5}} hours. Please respond at your earliest convenience.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Contractor name |
| {{4}} | Total cost |
| {{5}} | Hours elapsed |

---

#### 9c_pm_landlord_timeout
| Field | Value |
|-------|-------|
| SID | `HX18c20167f4d0dc5dd9b0fdd06bad182c` |
| Key | `landlord_reminder` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-followups` → `pm-landlord-timeout-sms` |
| Replaces | `15_pm_landlord_timeout_sms` (`HX88fb8839c2c64835c171ea8d915d0a17`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
⏰ *Landlord has not responded*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

👤 *Landlord*
{{3}} — {{4}}

🛠️ *Contractor*
{{5}} — {{6}}

No response after {{7}} hours. Please review and take action.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Landlord name |
| {{4}} | Landlord phone (UK formatted) |
| {{5}} | Contractor name |
| {{6}} | Contractor phone (UK formatted) |
| {{7}} | Hours elapsed |

---

#### 9d_completion_reminder
| Field | Value |
|-------|-------|
| SID | `HXa29e706f038e74acba7a6cf551daf5a7` |
| Key | `completion_followup` |
| Type | Text |
| Recipient | Contractor |
| Edge Function | `yarro-followups` → `contractor-completion-reminder-sms` |
| Replaces | `16_contractor_completion_reminder_sms` (`HX0889c61928c4b71a155956ec5ca35287`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
🔔 *Reminder — please submit completion*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

📅 *Scheduled*
{{3}}

Please report the outcome of this job at your earliest convenience.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Scheduled date |

---

#### 9e_pm_completion_overdue
| Field | Value |
|-------|-------|
| SID | `HXfd494c6c71c07de29005ffdfa2958baf` |
| Key | `pm_completion_overdue` |
| Type | Text |
| Recipient | PM |
| Edge Function | `yarro-followups` → `pm-completion-overdue-sms` |
| Replaces | `17_pm_completion_overdue_sms` (`HX3efeb8176e339042febe28ba44e9c4c2`) |
| Status | Submitted (Mar 10, 2026) |

**Copy:**
```
⏰ *Job completion overdue*

🏠 *Property*
{{1}}

🔔 *Issue*
{{2}}

🛠️ *Contractor*
{{3}}

📅 *Scheduled*
{{4}}

No completion submitted after {{5}} hours. Please review and take action.
```

**Variables:**
| Var | Value |
|-----|-------|
| {{1}} | Property address |
| {{2}} | Issue description |
| {{3}} | Contractor name / phone combo |
| {{4}} | Scheduled date |
| {{5}} | Hours overdue |

---

## Reschedule Templates (Pending Portal Build)

These are placeholders in `templates.ts` — not yet created in Twilio.

- `contractor_reschedule_request` — contractor gets: tenant wants to reschedule
- `tenant_reschedule_approved` — tenant gets: reschedule confirmed
- `tenant_reschedule_declined` — tenant gets: reschedule declined
- `pm_reschedule_approved` — PM gets: reschedule was approved
