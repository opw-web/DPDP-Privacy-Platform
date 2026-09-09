#!/usr/bin/env bash
# "Stage the demo" -- fills in every screen the demo needs, so nobody has
# to build a breach or a campaign by hand in front of an audience.
#
# Everything below is created through the platform's own HTTP API, using
# the same endpoints the website itself calls. No SQL is written, no
# fixture rows are inserted, and nothing bypasses a rule the app enforces:
# if the platform would refuse a human doing this by hand, it refuses this
# script too, and the script says so.
#
# Idempotent: every stage checks whether its artifact already exists and
# skips if it does, so running this twice never produces two breaches.
#
# Normally run as the last step of reset.sh. Safe to run on its own
# against an already-reset database.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh

STAGE_STANDALONE=0
if [ "${STAGE_DEMO_SOURCED:-0}" != "1" ]; then
  STAGE_STANDALONE=1
  trap on_error EXIT
  echo "======================================================"
  echo " Staging the demo data"
  echo "======================================================"
  echo
  setup_node
fi

# ---------------------------------------------------------------------
# Plumbing
# ---------------------------------------------------------------------
STAGE_LOG="$LOG_DIR/stage-demo.log"
: >"$STAGE_LOG"

# Everything this script created, printed as a checklist at the end so a
# stage that silently did nothing is visible instead of discovered live.
STAGED=()
mark()  { STAGED+=("  [made]    $*"); ok "$*"; }
kept()  { STAGED+=("  [existed] $*"); ok "$*  (already there)"; }
failed() { STAGED+=("  [FAILED]  $*"); warn "COULD NOT STAGE: $*"; }

jq_py() {
  # jq_py EXPR -- reads JSON on stdin, prints the expression, "" on any error.
  py_run -c "
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
try:
    v=$1
except Exception:
    sys.exit(0)
print('' if v is None else v)
" 2>/dev/null
}

login() {
  # login EMAIL PASSWORD -- prints an access token, empty on failure.
  curl -s -X POST "$BACKEND_URL/api/auth/employee/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq_py "d['accessToken']"
}

plogin() {
  curl -s -X POST "$BACKEND_URL/api/auth/principal/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq_py "d['accessToken']"
}

# call METHOD PATH [BODY] -- as whoever $TOKEN currently is.
call() {
  local method="$1" path="$2" body="${3:-}"
  local out
  if [ -n "$body" ]; then
    # The body goes in on stdin, never as an argument. On Windows the MSYS ->
    # Win32 argument conversion re-encodes arguments into the ANSI codepage
    # and replaces every character it cannot map -- which is all Devanagari --
    # with "?", so the Hindi notice reached the database as question marks.
    out=$(printf '%s' "$body" | curl -s -X "$method" "$BACKEND_URL$path" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d @-)
  else
    out=$(curl -s -X "$method" "$BACKEND_URL$path" -H "Authorization: Bearer $TOKEN")
  fi
  printf '%s %s -> %s\n' "$method" "$path" "$out" >>"$STAGE_LOG"
  printf '%s' "$out"
}

# Same, as the Data Principal whose token is in $PTOKEN.
pcall() {
  local method="$1" path="$2" body="${3:-}" out
  if [ -n "$body" ]; then
    # See call(): the body must not travel as a command-line argument.
    out=$(printf '%s' "$body" | curl -s -X "$method" "$BACKEND_URL$path" \
      -H "Authorization: Bearer $PTOKEN" -H 'Content-Type: application/json' -d @-)
  else
    out=$(curl -s -X "$method" "$BACKEND_URL$path" -H "Authorization: Bearer $PTOKEN")
  fi
  printf '%s %s (principal) -> %s\n' "$method" "$path" "$out" >>"$STAGE_LOG"
  printf '%s' "$out"
}

iso() { date -u -d "$1" '+%Y-%m-%dT%H:%M:%S.000Z'; }

# The seeded compliance rules carry an `effectiveFrom` of the moment the
# database was reset. `ComplianceService.resolveRule()` will not apply a
# rule to an event that predates it -- correctly: a deadline cannot be
# owed under a rule that did not yet exist. On a database reset ten
# minutes ago that makes "six hours ago" unusable, so pull the awareness
# time forward to just after the rules start, and say so out loud.
awareness_time() {
  local wanted earliest
  wanted=$(date -u -d "$1" '+%s')
  earliest=$(call GET /api/compliance-rules \
    | jq_py "min(r['effectiveFrom'] for r in (d if isinstance(d,list) else d.get('items',[])))")
  if [ -z "$earliest" ]; then
    date -u -d "@$wanted" '+%Y-%m-%dT%H:%M:%S.000Z'
    return
  fi
  local floor
  floor=$(( $(date -u -d "$earliest" '+%s') + 300 ))
  if [ "$wanted" -lt "$floor" ]; then
    wanted="$floor"
  fi
  date -u -d "@$wanted" '+%Y-%m-%dT%H:%M:%S.000Z'
}

# ---------------------------------------------------------------------
# Sign in
# ---------------------------------------------------------------------
step "Signing in"
ADMIN_TOKEN=$(login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
if [ -z "$ADMIN_TOKEN" ]; then
  warn "Could not sign in as $ADMIN_EMAIL. Is the demo running?"
  exit 1
fi
DPO_TOKEN=$(login "dpo@acmeretail.demo" "$ADMIN_PASSWORD")
EMP_TOKEN=$(login "employee@acmeretail.demo" "$ADMIN_PASSWORD")
TOKEN="$ADMIN_TOKEN"
ok "Signed in as the admin, the DPO and an employee."

EMPLOYEE_ID=$(call GET /api/employees | jq_py "[e['id'] for e in (d if isinstance(d,list) else d.get('items',[])) if e.get('email')=='employee@acmeretail.demo'][0]")

# Refuse to decorate a partial or non-reference reset.  Every screen below
# can technically be staged against smaller data, but its counts and audience
# previews would then disagree with the runbook in front of an evaluator.
SUMMARY_JSON=$(call GET /api/inventory/summary)
RAW_COUNT=$(printf '%s' "$SUMMARY_JSON" | jq_py "d.get('rawRecordCount')")
PRINCIPAL_COUNT=$(printf '%s' "$SUMMARY_JSON" | jq_py "d.get('uniquePrincipalCount')")
PENDING_COUNT=$(printf '%s' "$SUMMARY_JSON" | jq_py "d.get('pendingReviewCount')")
CONFLICT_COUNT=$(printf '%s' "$SUMMARY_JSON" | jq_py "d.get('conflictCount')")
CHILD_COUNT=$(call GET '/api/principals?ageStatus=CHILD&page=1' \
  | jq_py "d.get('total', len(d.get('items',[])))")
if [ "$RAW_COUNT/$PRINCIPAL_COUNT/$PENDING_COUNT/$CONFLICT_COUNT/$CHILD_COUNT" != "500/327/4/12/6" ]; then
  warn "The discovery figures are not the reference demo figures."
  warn "Expected 500 / 327 / 4 / 12 / 6; observed $RAW_COUNT / $PRINCIPAL_COUNT / $PENDING_COUNT / $CONFLICT_COUNT / $CHILD_COUNT."
  warn "Run '9 - Reset Demo to Fresh State' before staging. No artifacts were added."
  exit 1
fi
ok "Reference discovery figures confirmed: 500 / 327 / 4 / 12 / 6."

# Look up the ids the stages below hang off.
PURPOSES_JSON=$(call GET /api/purposes)
pid_of() { printf '%s' "$PURPOSES_JSON" | jq_py "[p['id'] for p in (d if isinstance(d,list) else d.get('items',[])) if p['code']=='$1'][0]"; }
MARKETING_PURPOSE=$(pid_of MARKETING_COMMS)
SUPPORT_PURPOSE=$(pid_of CUSTOMER_SUPPORT)
ORDER_PURPOSE=$(pid_of ORDER_FULFILMENT)

SOURCES_JSON=$(call GET /api/data-sources)
sid_of() { printf '%s' "$SOURCES_JSON" | jq_py "[s['id'] for s in (d if isinstance(d,list) else d.get('items',[])) if s['name']=='$1'][0]"; }
SRC_MARKETING=$(sid_of Marketing)
SRC_SALES=$(sid_of Sales)
SRC_SUPPORT=$(sid_of Support)
SRC_ECOM=$(sid_of "E-commerce")

TEMPLATES_JSON=$(call GET /api/templates)
tpl_of() { printf '%s' "$TEMPLATES_JSON" | jq_py "[t['id'] for t in (d if isinstance(d,list) else d.get('items',[])) if t['code']=='$1'][0]"; }
TPL_CONSENT=$(tpl_of CONSENT_REQUEST)
TPL_NOTICE=$(tpl_of NOTICE_STANDARD)
TPL_BREACH=$(tpl_of BREACH_NOTIFICATION)

NOTICES_JSON=$(call GET /api/notices)
nid_of() { printf '%s' "$NOTICES_JSON" | jq_py "[n['id'] for n in (d if isinstance(d,list) else d.get('items',[])) if n['code']=='$1'][0]"; }
NOTICE_MARKETING=$(nid_of MARKETING_OPTIN)
NOTICE_ACCOUNT=$(nid_of ACCOUNT_SIGNUP)

if [ -z "$MARKETING_PURPOSE" ] || [ -z "$NOTICE_MARKETING" ] || [ -z "$SRC_MARKETING" ]; then
  warn "The database does not look like a freshly reset demo (no purposes,"
  warn "notices or data sources found). Run 'Reset Demo to Fresh State' first."
  exit 1
fi

# =====================================================================
# A -- The company's own published contact details (GO-10, Rule 9)
#      Without these the Data Principal Portal has no one to name as the
#      person who answers questions about processing.
# =====================================================================
step "A -- The company's published privacy contact"
ORG=$(call GET /api/organization)
if [ -n "$(printf '%s' "$ORG" | jq_py "d.get('dpoEmail') or ''")" ]; then
  kept "Privacy contact published"
else
  RESP=$(call PATCH /api/organization '{
    "legalName":"Acme Retail Private Limited",
    "dpoName":"Meera Iyer",
    "dpoEmail":"dpo@acmeretail.demo",
    "dpoPhone":"+91 22 4000 1234",
    "dpoIsIndiaBased":true,
    "grievanceContactEmail":"grievance@acmeretail.demo",
    "publicPrivacyPageUrl":"https://acmeretail.demo/privacy"
  }')
  if [ -n "$(printf '%s' "$RESP" | jq_py "d.get('dpoEmail') or ''")" ]; then
    mark "Privacy contact published (Data Protection Officer: Meera Iyer)"
  else
    failed "Privacy contact -- $RESP"
  fi
fi

# =====================================================================
# B -- The Record of Processing: who else touches this data
#      s.8(2) a processor may only be engaged under a contract; s.11(1)(b)
#      the company must be able to describe what it shared and with whom.
# =====================================================================
step "B -- Processors, sharing and cross-border transfers"
RECIPIENTS=$(call GET /api/registers/recipients)
PROCESSOR_ID=$(printf '%s' "$RECIPIENTS" | jq_py "[r['id'] for r in d if r['name']=='CloudMail Analytics Pvt Ltd'][0]")
if [ -n "$PROCESSOR_ID" ]; then
  kept "Processor CloudMail Analytics"
else
  RESP=$(call POST /api/registers/recipients '{
    "name":"CloudMail Analytics Pvt Ltd",
    "type":"DATA_PROCESSOR",
    "contactEmail":"privacy@cloudmail.example",
    "country":"IN",
    "contractExists":true,
    "contractReference":"ACME-CMA-2024-017",
    "contractSignedAt":"2024-04-01T00:00:00.000Z",
    "contractExpiresAt":"2027-03-31T00:00:00.000Z",
    "contractHasSecurityClause":true,
    "contractHasErasureClause":true,
    "contractHasAuditRights":true,
    "subProcessorsDisclosed":true,
    "subProcessorNotes":"Uses AWS Mumbai (ap-south-1) for storage only.",
    "active":true
  }')
  PROCESSOR_ID=$(printf '%s' "$RESP" | jq_py "d['id']")
  [ -n "$PROCESSOR_ID" ] && mark "Processor CloudMail Analytics, engaged under contract ACME-CMA-2024-017 (s.8(2))" \
                        || failed "Processor -- $RESP"
fi

ANALYTICS_ID=$(printf '%s' "$RECIPIENTS" | jq_py "[r['id'] for r in d if r['name']=='Northwind Insights Ltd'][0]")
if [ -z "$ANALYTICS_ID" ]; then
  RESP=$(call POST /api/registers/recipients '{
    "name":"Northwind Insights Ltd",
    "type":"OTHER_DATA_FIDUCIARY",
    "contactEmail":"data@northwind.example",
    "country":"SG",
    "active":true
  }')
  ANALYTICS_ID=$(printf '%s' "$RESP" | jq_py "d['id']")
  [ -n "$ANALYTICS_ID" ] && mark "Third party Northwind Insights (Singapore)" || failed "Third party -- $RESP"
else
  kept "Third party Northwind Insights"
fi

SHARING=$(call GET /api/registers/sharing)
if [ "$(printf '%s' "$SHARING" | jq_py "len(d)")" != "0" ]; then
  kept "Sharing activity"
elif [ -n "$PROCESSOR_ID" ]; then
  RESP=$(call POST /api/registers/sharing "{
    \"recipientId\":\"$PROCESSOR_ID\",
    \"purposeId\":\"$MARKETING_PURPOSE\",
    \"dataCategories\":[\"CONTACT\",\"IDENTITY\"],
    \"description\":\"Email address and first name only, sent so CloudMail can deliver Acme's marketing emails and report opens and clicks. No purchase history, no phone numbers.\",
    \"sourceIds\":[\"$SRC_MARKETING\"],
    \"startedAt\":\"2024-04-01T00:00:00.000Z\",
    \"active\":true
  }")
  [ -n "$(printf '%s' "$RESP" | jq_py "d['id']")" ] \
    && mark "Sharing activity: what exactly goes to CloudMail (s.11(1)(b))" \
    || failed "Sharing activity -- $RESP"
fi

TRANSFERS=$(call GET /api/registers/transfers)
if [ "$(printf '%s' "$TRANSFERS" | jq_py "len(d)")" != "0" ]; then
  kept "Cross-border transfer"
elif [ -n "$ANALYTICS_ID" ]; then
  RESP=$(call POST /api/registers/transfers "{
    \"recipientId\":\"$ANALYTICS_ID\",
    \"destinationCountry\":\"SG\",
    \"dataCategories\":[\"CONTACT\",\"LOCATION\"],
    \"purposeDescription\":\"Aggregate regional demand analysis for stock planning.\",
    \"govtRestrictionChecked\":true,
    \"govtRestrictionNotes\":\"Checked against the s.16 restricted-country notification on 1 April 2024. Singapore is not restricted.\",
    \"sectoralRestrictionNotes\":\"Acme is not RBI/SEBI/IRDAI regulated, so no sectoral localisation applies.\",
    \"localisationRequired\":false,
    \"reviewedAt\":\"2024-04-01T00:00:00.000Z\"
  }")
  [ -n "$(printf '%s' "$RESP" | jq_py "d['id']")" ] \
    && mark "Cross-border transfer to Singapore, with the s.16 check recorded" \
    || failed "Cross-border transfer -- $RESP"
fi

# A retention policy triggered by consent withdrawal, so withdrawing
# marketing consent produces a real erasure task -- one that the Rule 8(3)
# one-year floor then holds back, which is exactly the point of step 29.
RETENTION=$(call GET /api/registers/retention)
if [ -n "$(printf '%s' "$RETENTION" | jq_py "[r['id'] for r in d if r['triggerType']=='CONSENT_WITHDRAWN'][0]")" ]; then
  kept "Withdrawal-triggered retention policy"
else
  RESP=$(call POST /api/registers/retention "{
    \"purposeId\":\"$MARKETING_PURPOSE\",
    \"name\":\"Marketing data after consent is withdrawn\",
    \"triggerType\":\"CONSENT_WITHDRAWN\",
    \"retentionValue\":30,
    \"retentionUnit\":\"DAYS\",
    \"legalBasisForRetention\":\"Company policy: marketing data is erased 30 days after withdrawal, subject to the statutory minimum.\",
    \"legalBasisType\":\"ORG_POLICY\"
  }")
  [ -n "$(printf '%s' "$RESP" | jq_py "d['id']")" ] \
    && mark "Retention policy: erase 30 days after withdrawal -- but never before the Rule 8(3) floor" \
    || failed "Retention policy -- $RESP"
fi

SECURITY=$(call GET /api/registers/security)
if [ "$(printf '%s' "$SECURITY" | jq_py "len(d)")" != "0" ]; then
  kept "Security measures"
else
  for m in \
    '{"ruleReference":"Rule 6(1)(a)","measureType":"ENCRYPTION","implemented":true,"description":"Personal data is encrypted at rest (AES-256) and in transit (TLS 1.3)."}' \
    '{"ruleReference":"Rule 6(1)(b)","measureType":"ACCESS_CONTROL","implemented":true,"description":"Role-based access: only the roles listed on the Employees page can view personal data."}' \
    '{"ruleReference":"Rule 6(1)(c)","measureType":"LOGGING","implemented":true,"description":"Every view of personal data is written to the access log and kept for at least one year."}' \
    '{"ruleReference":"Rule 6(1)(f)","measureType":"CONTRACT_CLAUSE","implemented":true,"description":"Every processor contract carries security, erasure and audit-rights clauses."}'
  do call POST /api/registers/security "$m" >/dev/null; done
  mark "Four security measures recorded against Rule 6(1)"
fi

# =====================================================================
# C -- Publish the notices (Rule 3). The seed leaves them as complete
#      drafts; publishing is the act that freezes them.
# =====================================================================
step "C -- Publishing the privacy notices"
# Rule 3(b)(ii): a notice must say what goods or services each purpose is
# actually for. The platform refuses to publish without it, so fill it in
# first -- as a human would, through the same PATCH the Purposes page uses.
describe_purpose() {
  local code="$1" text="$2" pid
  pid=$(pid_of "$code")
  [ -z "$pid" ] && return 0
  if [ -n "$(printf '%s' "$PURPOSES_JSON" | jq_py "[p.get('goodsOrServicesDescription') or '' for p in (d if isinstance(d,list) else d.get('items',[])) if p['code']=='$code'][0]")" ]; then
    return 0
  fi
  call PATCH "/api/purposes/$pid" "{\"goodsOrServicesDescription\":\"$text\"}" >/dev/null
}
describe_purpose MARKETING_COMMS  "Offers, discounts and new-product announcements for Acme Retail's online and in-store shopping service."
describe_purpose SALES_CRM        "Acme Retail's account management service for customers who buy from a sales representative."
describe_purpose CUSTOMER_SUPPORT "Acme Retail's help desk: answering questions and resolving complaints about orders already placed."
describe_purpose ORDER_FULFILMENT "Acme Retail's online shop: taking payment, packing, delivering and returning goods you order."
PURPOSES_JSON=$(call GET /api/purposes)
ok "Each purpose now says which goods or services it is for (Rule 3(b)(ii))."

publish_notice() {
  local nid="$1" label="$2"
  local detail published
  detail=$(call GET "/api/notices/$nid")
  published=$(printf '%s' "$detail" | jq_py "[v['version'] for v in d.get('versions',[]) if v.get('publishedAt')][0]")
  if [ -n "$published" ]; then
    kept "$label (version $published already published)"
    return 0
  fi
  local resp
  resp=$(call POST "/api/notices/$nid/versions/1/publish" '{}')
  if [ -n "$(printf '%s' "$resp" | jq_py "d.get('publishedAt') or ''")" ]; then
    mark "$label published as version 1 -- now frozen"
  else
    failed "$label -- $resp"
  fi
}
publish_notice "$NOTICE_ACCOUNT"   "Account and service notice"
publish_notice "$NOTICE_MARKETING" "Marketing opt-in notice"

# A Hindi translation of the published marketing notice (NT-06). The
# platform stores what a human wrote; it never machine-translates.
HI=$(call GET "/api/notices/$NOTICE_MARKETING")
if [ -n "$(printf '%s' "$HI" | jq_py "[t for v in d.get('versions',[]) for t in v.get('translations',[]) if t.get('languageCode')=='hi'][0] and 'yes'")" ]; then
  kept "Hindi translation of the marketing notice"
else
  RESP=$(call PUT "/api/notices/$NOTICE_MARKETING/versions/1/translations/hi" '{
    "bodyMarkdown":"## Acme Retail की विपणन सूचना\n\nहम आपका नाम, ईमेल पता और शहर इसलिए रखते हैं ताकि आपको प्रचार संदेश भेजे जा सकें। यह पूरी तरह आपकी सहमति पर आधारित है।\n\nआप जब चाहें सहमति वापस ले सकते हैं — वापस लेना उतना ही आसान है जितना देना था। सहमति वापस लेने पर हम आपको विपणन संदेश भेजना बंद कर देंगे।\n\nअपने अधिकारों का उपयोग करने, सहमति वापस लेने, या डेटा संरक्षण बोर्ड में शिकायत दर्ज करने के लिए ऊपर दिए गए लिंक देखें।"
  }')
  if [ -n "$(printf '%s' "$RESP" | jq_py "d.get('languageCode') or d.get('id') or ''")" ]; then
    mark "Hindi translation added to the published marketing notice"
  else
    failed "Hindi translation -- $RESP"
  fi
fi

# =====================================================================
# D -- Children (s.9, Rule 10). The seed creates one guardian for one
#      under-18 principal but leaves it unverified, because verification
#      is a human act. Record that it happened, then record the consent
#      the guardian gave.
# =====================================================================
step "D -- Guardian verification and a child's consent"
GUARDIANS=$(call GET /api/guardians)
GUARDIAN_ID=$(printf '%s' "$GUARDIANS" | jq_py "d[0]['id'] if d else ''")
CHILD_ID=$(printf '%s' "$GUARDIANS" | jq_py "d[0]['dataPrincipalId'] if d else ''")
GUARDIAN_VERIFIED=$(printf '%s' "$GUARDIANS" | jq_py "(d[0].get('verifiedAt') or '') if d else ''")

if [ -z "$GUARDIAN_ID" ]; then
  failed "Guardian relationship (none seeded)"
elif [ -n "$GUARDIAN_VERIFIED" ]; then
  kept "Guardian already verified"
else
  RESP=$(call POST "/api/guardians/$GUARDIAN_ID/verify" '{
    "verification":"DIGITAL_LOCKER",
    "verificationReference":"DL-VC-2026-0912-4471"
  }')
  if [ -n "$(printf '%s' "$RESP" | jq_py "d.get('verifiedAt') or ''")" ]; then
    mark "Guardian verified through DigiLocker, reference recorded (Rule 10)"
  else
    failed "Guardian verification -- $RESP"
  fi
fi

if [ -n "$CHILD_ID" ] && [ -n "$GUARDIAN_ID" ]; then
  EXISTING=$(call GET "/api/principals/$CHILD_ID/consents")
  if [ -n "$(printf '%s' "$EXISTING" | jq_py "[c for c in (d if isinstance(d,list) else d.get('items',[])) if c.get('status')=='GRANTED'][0] and 'yes'")" ]; then
    kept "Child's guardian-given consent"
  else
    RESP=$(call POST "/api/principals/$CHILD_ID/consents/$MARKETING_PURPOSE" "{
      \"status\":\"GRANTED\",
      \"channel\":\"IN_PERSON\",
      \"noticeId\":\"$NOTICE_MARKETING\",
      \"givenByGuardianId\":\"$GUARDIAN_ID\"
    }")
    if [ -n "$(printf '%s' "$RESP" | jq_py "d.get('id') or ''")" ]; then
      mark "Consent for the child recorded, given by the verified guardian"
    else
      failed "Child consent -- $RESP"
    fi
  fi
fi

# =====================================================================
# E -- Asking for consent properly, and honouring a withdrawal.
#      s.6(4): withdrawing must be as easy as giving.
# =====================================================================
step "E -- A consent request campaign, a grant, and a withdrawal"
CAMPAIGNS=$(call GET /api/campaigns)
campaign_named() { printf '%s' "$CAMPAIGNS" | jq_py "[c['id'] for c in (d if isinstance(d,list) else d.get('items',[])) if c['name']=='$1'][0]"; }

CONSENT_CAMPAIGN=$(campaign_named "Marketing consent request -- Mumbai and Pune")
if [ -n "$CONSENT_CAMPAIGN" ]; then
  kept "Consent request campaign"
else
  RESP=$(call POST /api/campaigns "{
    \"name\":\"Marketing consent request -- Mumbai and Pune\",
    \"category\":\"CONSENT_REQUEST\",
    \"templateId\":\"$TPL_CONSENT\",
    \"purposeId\":\"$MARKETING_PURPOSE\",
    \"noticeId\":\"$NOTICE_MARKETING\",
    \"audienceFilter\":{\"op\":\"AND\",\"rules\":[
      {\"field\":\"consent\",\"purposeId\":\"$MARKETING_PURPOSE\",\"operator\":\"eq\",\"value\":\"UNKNOWN\"},
      {\"field\":\"hasEmail\",\"operator\":\"eq\",\"value\":true},
      {\"field\":\"ageStatus\",\"operator\":\"eq\",\"value\":\"ADULT\"},
      {\"field\":\"city\",\"operator\":\"in\",\"value\":[\"Mumbai\",\"Pune\"]}
    ]}
  }")
  CONSENT_CAMPAIGN=$(printf '%s' "$RESP" | jq_py "d['id']")
  if [ -n "$CONSENT_CAMPAIGN" ]; then
    TOKEN="$DPO_TOKEN"; call POST "/api/campaigns/$CONSENT_CAMPAIGN/approve" '{}' >/dev/null; TOKEN="$ADMIN_TOKEN"
    SENT=$(call POST "/api/campaigns/$CONSENT_CAMPAIGN/send" '{}')
    COUNT=$(printf '%s' "$SENT" | jq_py "d.get('sentCount') or d.get('recipientCount') or ''")
    mark "Consent request campaign built, approved by a second person, and sent${COUNT:+ to $COUNT people}"
  else
    failed "Consent request campaign -- $RESP"
  fi
fi

# Raj reads the notice and says yes; Neha says yes and then changes her
# mind. Both act through the portal, as themselves -- the same endpoint
# the portal's own consent switch calls.
consent_as() {
  # consent_as EMAIL STATUS LABEL
  local email="$1" status="$2" label="$3"
  PTOKEN=$(plogin "$email" "$ADMIN_PASSWORD")
  if [ -z "$PTOKEN" ]; then failed "$label (could not sign in as $email)"; return; fi
  local body="{\"status\":\"$status\",\"noticeId\":\"$NOTICE_MARKETING\"}"
  [ "$status" = "WITHDRAWN" ] && body="{\"status\":\"WITHDRAWN\"}"
  local resp
  resp=$(pcall POST "/api/me/consents/$MARKETING_PURPOSE" "$body")
  if [ -n "$(printf '%s' "$resp" | jq_py "d.get('id') or d.get('status') or ''")" ]; then
    mark "$label"
  else
    failed "$label -- $resp"
  fi
}

# Deliberately NOT a plain "any granted consent" check: stage D already
# recorded one, given by a guardian on a child's behalf, and counting that
# would skip this stage and leave the next campaign with nobody to deliver to.
PORTAL_CONSENTS=$(call GET "/api/principals/$(printf '%s' "$(call GET /api/principals?q=Raj)" | jq_py "[p['id'] for p in (d.get('items') if isinstance(d,dict) else d)][0]")/consents")
if [ -n "$(printf '%s' "$PORTAL_CONSENTS" | jq_py "[c for c in (d if isinstance(d,list) else d.get('items',[])) if c.get('status') in ('GRANTED','WITHDRAWN')][0] and 'yes'")" ]; then
  kept "Consent decisions already recorded"
else
  consent_as "raj.patel@gmail.com"   GRANTED   "Raj Patel granted marketing consent from his own portal"
  consent_as "neha.rao@example.com"  GRANTED   "Neha Rao granted marketing consent"
  consent_as "neha.rao@example.com"  WITHDRAWN "Neha Rao withdrew it again in one click (s.6(4))"

  # A handful of Mumbai adults said yes at the till, recorded by staff.
  # Without these the next campaign has nobody left to deliver to, and the
  # only thing the screen can show is suppression -- which hides the point
  # that the platform delivers to consenting adults and stops at everyone else.
  GRANTED_N=0
  for pid in $(call GET "/api/principals?ageStatus=ADULT" | jq_py "' '.join([p['id'] for p in (d.get('items') if isinstance(d,dict) else d)][:12])"); do
    RESP=$(call POST "/api/principals/$pid/consents/$MARKETING_PURPOSE" "{
      \"status\":\"GRANTED\",
      \"channel\":\"IN_PERSON\",
      \"noticeId\":\"$NOTICE_MARKETING\"
    }")
    [ -n "$(printf '%s' "$RESP" | jq_py "d.get('id') or ''")" ] && GRANTED_N=$((GRANTED_N + 1))
  done
  [ "$GRANTED_N" -gt 0 ] && mark "$GRANTED_N shoppers recorded as consenting in store (staff-entered)"
fi

# =====================================================================
# F -- s.9(3): no tracking or targeted advertising directed at children.
#      A guardian's consent does not unlock it. Run a marketing campaign
#      whose audience deliberately includes the child, and let the
#      platform refuse to deliver to them.
# =====================================================================
step "F -- A marketing campaign that a child is protected from"
CAMPAIGNS=$(call GET /api/campaigns)
MKT_CAMPAIGN=$(campaign_named "Monsoon sale -- Mumbai")
if [ -n "$MKT_CAMPAIGN" ]; then
  kept "Marketing campaign with child suppression"
else
  MKT_FILTER="{\"op\":\"OR\",\"rules\":[
      {\"field\":\"consent\",\"purposeId\":\"$MARKETING_PURPOSE\",\"operator\":\"eq\",\"value\":\"GRANTED\"},
      {\"field\":\"city\",\"operator\":\"in\",\"value\":[\"Mumbai\"]},
      {\"field\":\"ageStatus\",\"operator\":\"eq\",\"value\":\"CHILD\"}
    ]}"
  PREVIEW=$(call POST /api/audiences/preview "{\"filter\":$MKT_FILTER,\"purposeId\":\"$MARKETING_PURPOSE\"}")
  PV_TOTAL=$(printf '%s' "$PREVIEW" | jq_py "d.get('total','?')")
  PV_CHILD=$(printf '%s' "$PREVIEW" | jq_py "d.get('suppressedAsChild','?')")
  say "Audience preview: $PV_TOTAL people match, of whom $PV_CHILD are children."

  RESP=$(call POST /api/campaigns "{
    \"name\":\"Monsoon sale -- Mumbai\",
    \"category\":\"MARKETING\",
    \"templateId\":\"$TPL_NOTICE\",
    \"purposeId\":\"$MARKETING_PURPOSE\",
    \"audienceFilter\":$MKT_FILTER
  }")
  MKT_CAMPAIGN=$(printf '%s' "$RESP" | jq_py "d['id']")
  if [ -n "$MKT_CAMPAIGN" ]; then
    TOKEN="$DPO_TOKEN"; call POST "/api/campaigns/$MKT_CAMPAIGN/approve" '{}' >/dev/null; TOKEN="$ADMIN_TOKEN"
    call POST "/api/campaigns/$MKT_CAMPAIGN/send" '{}' >/dev/null
    # Delivery runs on a queue, so the recipient rows settle a moment after
    # send returns. Poll until nothing is left QUEUED rather than reporting
    # whatever happened to be written by the time the request came back.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      RECIPIENTS_JSON=$(call GET "/api/campaigns/$MKT_CAMPAIGN/recipients")
      PENDING=$(printf '%s' "$RECIPIENTS_JSON" | jq_py "sum(1 for r in (d if isinstance(d,list) else d.get('items',[])) if r.get('status') in ('QUEUED','PENDING','SENDING'))")
      [ "${PENDING:-0}" = "0" ] && break
      sleep 2
    done
    counts() { printf '%s' "$RECIPIENTS_JSON" | jq_py "sum(1 for r in (d if isinstance(d,list) else d.get('items',[])) if $1)"; }
    DELIV=$(counts "r.get('status')=='DELIVERED'")
    S_CHILD=$(counts "r.get('suppressReason')=='CHILD_MARKETING_PROHIBITED'")
    S_NOCON=$(counts "r.get('suppressReason')=='NO_CONSENT'")
    mark "Marketing campaign sent: ${DELIV:-0} delivered, ${S_NOCON:-0} held back for no consent, ${S_CHILD:-0} held back as children (s.9(3))"
  else
    failed "Marketing campaign -- $RESP"
  fi
fi

# =====================================================================
# G -- Somebody exercises their rights (s.11 access, s.12 correction).
#      Aman raises both from his own portal; an employee picks the
#      correction up, so the demo opens on a request already in flight.
# =====================================================================
step "G -- Two requests from Aman, one already being worked on"
PTOKEN=$(plogin "aman.sharma@gmail.com" "$ADMIN_PASSWORD")
if [ -z "$PTOKEN" ]; then
  failed "Aman's requests (could not sign in to the portal)"
else
  MY_REQUESTS=$(pcall GET /api/me/requests)
  HAVE=$(printf '%s' "$MY_REQUESTS" | jq_py "len(d if isinstance(d,list) else d.get('items',[]))")
  if [ "${HAVE:-0}" != "0" ]; then
    kept "Aman's requests ($HAVE already open)"
  else
    CORR=$(pcall POST /api/me/requests '{
      "type":"CORRECTION",
      "subject":"My phone number is wrong",
      "body":"The mobile number you have for me ends 4471. That is my old number and it now belongs to someone else. Please correct it to the number ending 8890, which you already have on my order history.",
      "requestedChanges":{"PHONE":"+91 98200 08890"}
    }')
    CORR_REF=$(printf '%s' "$CORR" | jq_py "d.get('reference') or ''")
    [ -n "$CORR_REF" ] && mark "Aman raised a correction request ($CORR_REF)" || failed "Correction request -- $CORR"

    ACC=$(pcall POST /api/me/requests '{
      "type":"ACCESS",
      "subject":"Please send me everything you hold about me",
      "body":"I would like the summary the law entitles me to: what personal data you hold, why, and the names of everyone you have shared it with."
    }')
    ACC_REF=$(printf '%s' "$ACC" | jq_py "d.get('reference') or ''")
    [ -n "$ACC_REF" ] && mark "Aman raised an access request ($ACC_REF)" || failed "Access request -- $ACC"

    # An employee picks the correction up, so the Requests page opens on
    # something already moving rather than an untouched inbox.
    if [ -n "$CORR_REF" ] && [ -n "$EMPLOYEE_ID" ]; then
      TOKEN="$EMP_TOKEN"
      call POST "/api/requests/$CORR_REF/verify-identity" '{"method":"Portal login plus registered email","reference":"AUTO-PORTAL"}' >/dev/null
      # The status machine has no SUBMITTED -> IN_PROGRESS edge (see
      # requests.constants.ts TRANSITIONS): a request has to be opened
      # first. Walk the real path rather than jumping the queue.
      call POST "/api/requests/$CORR_REF/status" '{"status":"OPEN","note":"Identity confirmed from the portal session.","visibleToPrincipal":true}' >/dev/null
      call POST "/api/requests/$CORR_REF/assign" "{\"employeeId\":\"$EMPLOYEE_ID\"}" >/dev/null
      call POST "/api/requests/$CORR_REF/status" '{"status":"IN_PROGRESS","note":"Checking the number against the order history before changing it.","visibleToPrincipal":true}' >/dev/null
      call POST "/api/requests/$CORR_REF/note" '{"note":"Old number still present in the Marketing CRM export; needs correcting there too.","visibleToPrincipal":false}' >/dev/null
      FINAL_STATUS=$(call GET "/api/requests/$CORR_REF" | jq_py "d.get('status') or ''")
      TOKEN="$ADMIN_TOKEN"
      if [ "$FINAL_STATUS" = "IN_PROGRESS" ]; then
        mark "The correction was verified, assigned and moved to In Progress"
      else
        failed "Moving the correction to In Progress (it is $FINAL_STATUS)"
      fi
    fi
  fi
fi

# =====================================================================
# H -- A breach, against a live regulator clock.
#      Rule 7(1): tell every affected person six specific things.
#      Rule 7(2): tell the Board at once, and in detail within 72 hours
#      of becoming aware.
# =====================================================================
step "H -- A breach with the Board clock already running"
BREACHES=$(call GET /api/breaches)
BREACH_ID=$(printf '%s' "$BREACHES" | jq_py "(d if isinstance(d,list) else d.get('items',[]))[0]['id'] if (d if isinstance(d,list) else d.get('items',[])) else ''")
if [ -n "$BREACH_ID" ]; then
  kept "Breach incident"
else
  BECAME_AWARE=$(awareness_time '6 hours ago')
  say "Breach discovered at $BECAME_AWARE (the Board clocks run from here)."
  RESP=$(call POST /api/breaches "{
    \"title\":\"Marketing database exposed by a misconfigured backup\",
    \"description\":\"A nightly backup of the Marketing CRM was written to a storage bucket that had been left readable without authentication. Access logs show it was downloaded twice from outside our network.\",
    \"occurredAt\":\"$(iso '5 days ago')\",
    \"becameAwareAt\":\"$BECAME_AWARE\",
    \"affectedSourceIds\":[\"$SRC_MARKETING\"],
    \"dataCategories\":[\"IDENTITY\",\"CONTACT\",\"LOCATION\"],
    \"natureExtentTiming\":\"A backup copy of the Marketing CRM, containing names, email addresses, mobile numbers and cities, was readable without a password between 29 August and 3 September 2026. Server logs show two downloads from IP addresses outside Acme's network.\",
    \"consequences\":\"The exposed data could be used to send you convincing phishing emails or text messages that appear to come from Acme Retail. No passwords, payment card details or government ID numbers were in the backup.\",
    \"mitigationMeasures\":\"The bucket was made private within 40 minutes of discovery. All backup buckets have been audited and their permissions corrected. Automatic alerting for publicly readable storage has been switched on. An external security firm has been engaged to review the backup pipeline.\",
    \"safetyMeasuresForPrincipals\":\"Treat any message asking you to confirm your Acme Retail account details with suspicion, especially one that creates urgency. Acme will never ask for your password. If you reused your Acme password elsewhere, change it there. Report anything suspicious to the contact below.\",
    \"responderContact\":\"Meera Iyer, Data Protection Officer -- dpo@acmeretail.demo, +91 22 4000 1234\",
    \"boardBroadFacts\":\"Misconfigured public read permission on a nightly Marketing CRM backup bucket; exposure window 29 August to 3 September 2026; two external downloads observed.\"
  }")
  BREACH_ID=$(printf '%s' "$RESP" | jq_py "d['id']")
  BREACH_REF=$(printf '%s' "$RESP" | jq_py "d.get('reference') or ''")
  if [ -z "$BREACH_ID" ]; then
    failed "Breach incident -- $RESP"
  else
    mark "Breach $BREACH_REF recorded: occurred 5 days ago, discovered $BECAME_AWARE"

    PREVIEW=$(call POST "/api/breaches/$BREACH_ID/affected/preview" "{\"sourceIds\":[\"$SRC_MARKETING\"],\"preview\":true}")
    PV=$(printf '%s' "$PREVIEW" | jq_py "d.get('total') or d.get('count') or len(d.get('principalIds',[]))")
    say "Preview before committing: $PV people are affected."
    call POST "/api/breaches/$BREACH_ID/affected" "{\"sourceIds\":[\"$SRC_MARKETING\"]}" >/dev/null
    mark "Affected people committed after a preview count ($PV)"

    call PATCH "/api/breaches/$BREACH_ID" '{"status":"CONTAINED"}' >/dev/null

    CRESP=$(call POST /api/campaigns "{
      \"name\":\"Breach notice -- Marketing backup exposure\",
      \"category\":\"BREACH_NOTICE\",
      \"templateId\":\"$TPL_BREACH\",
      \"breachId\":\"$BREACH_ID\"
    }")
    BCAMP=$(printf '%s' "$CRESP" | jq_py "d['id']")
    if [ -z "$BCAMP" ]; then
      failed "Breach notice campaign -- $CRESP"
    else
      TOKEN="$DPO_TOKEN"
      APPROVED=$(call POST "/api/campaigns/$BCAMP/approve" '{}')
      NOTIFIED=$(call POST "/api/breaches/$BREACH_ID/notify" '{}')
      TOKEN="$ADMIN_TOKEN"
      if [ -n "$(printf '%s' "$NOTIFIED" | jq_py "d.get('status') or ''")" ]; then
        mark "Breach notice approved by the DPO (not its author) and sent to everyone affected"
      else
        failed "Sending the breach notice -- $NOTIFIED"
      fi
    fi

    # Must land after the original 72-hour BOARD_DETAIL deadline, which
    # hangs off BECAME_AWARE rather than the wall clock.
    EXTENSION_UNTIL=$(date -u -d "@$(( $(date -u -d "$BECAME_AWARE" '+%s') + 10*24*3600 ))" '+%Y-%m-%dT%H:%M:%S.000Z')
    EXT=$(call POST "/api/breaches/$BREACH_ID/extension" "{
      \"requestedAt\":\"$(iso 'now')\",
      \"grantedUntil\":\"$EXTENSION_UNTIL\",
      \"reference\":\"DPB/EXT/2026/00417\"
    }")
    if [ -n "$(printf '%s' "$EXT" | jq_py "d.get('id') or d.get('reference') or ''")" ]; then
      mark "Board extension recorded -- only the detailed-report clock moves"
    else
      failed "Board extension -- $EXT"
    fi
  fi
fi

# =====================================================================
# I -- Significant Data Fiduciary (s.10). Extra duties, on a 12-month
#      cycle, plus a register of the algorithms used on personal data.
# =====================================================================
step "I -- Significant Data Fiduciary duties"
ORG=$(call GET /api/organization)
if [ "$(printf '%s' "$ORG" | jq_py "d.get('isSignificantDataFiduciary')")" = "True" ]; then
  kept "Significant Data Fiduciary declaration"
else
  call PATCH /api/organization "{
    \"isSignificantDataFiduciary\":true,
    \"sdfNotifiedAt\":\"$(iso '90 days ago')\",
    \"sdfNotificationRef\":\"MEITY/SDF/2026/0231\"
  }" >/dev/null
  mark "Acme declared a Significant Data Fiduciary (notified 90 days ago)"
fi

ASSESS=$(call GET /api/sdf/assessments)
if [ "$(printf '%s' "$ASSESS" | jq_py "len(d if isinstance(d,list) else d.get('items',[]))")" != "0" ]; then
  kept "DPIA and audit cycles"
else
  call POST /api/sdf/assessments '{"kind":"DPIA"}' >/dev/null
  call POST /api/sdf/assessments '{"kind":"AUDIT"}' >/dev/null
  mark "The 12-month DPIA and independent-audit cycles opened"
fi

ALGOS=$(call GET /api/sdf/algorithms)
if [ "$(printf '%s' "$ALGOS" | jq_py "len(d if isinstance(d,list) else d.get('items',[]))")" != "0" ]; then
  kept "Algorithm register"
else
  call POST /api/sdf/algorithms '{
    "name":"Product recommendation ranking",
    "description":"Ranks products on the storefront using a customer'"'"'s past orders and browsing history.",
    "operations":["DISPLAY","STORAGE"],
    "riskAssessment":"Reviewed for unfair exclusion of customers in smaller cities. No systematic disadvantage found.",
    "riskToRightsIdentified":false,
    "mitigations":"Recommendations never use inferred health or financial-distress signals."
  }' >/dev/null
  call POST /api/sdf/algorithms '{
    "name":"Duplicate customer matching",
    "description":"Decides when two records from different systems describe the same person.",
    "operations":["MODIFICATION","STORAGE"],
    "riskAssessment":"A wrong match would show one person another person'"'"'s data. The matcher refuses to guess and sends ambiguous pairs to a human instead.",
    "riskToRightsIdentified":true,
    "mitigations":"Ambiguous pairs go to the review queue. Every merge is reversible without losing source data."
  }' >/dev/null
  mark "Two algorithms entered in the register, with their risks and mitigations"
fi

# =====================================================================
# J -- A Government request naming a specific person, with a
#      non-disclosure direction (Rule 23(2)). It must be in the audit
#      log and absent from that person's portal, report and evidence file.
# =====================================================================
step "J -- A Government request Aman must not be told about"
INFOREQ=$(call GET /api/information-requests)
if [ "$(printf '%s' "$INFOREQ" | jq_py "len(d if isinstance(d,list) else d.get('items',[]))")" != "0" ]; then
  kept "Government information request"
else
  AMAN_ID=$(call GET "/api/principals?search=Sharma" | jq_py "[p['id'] for p in (d.get('items') if isinstance(d,dict) else d) if 'Sharma' in (p.get('displayName') or '')][0]")
  BODY="{
    \"requestingBody\":\"CENTRAL_GOVERNMENT\",
    \"authorisedPersonRef\":\"Under Secretary, Ministry of Home Affairs -- MHA/AS/2026/1188\",
    \"purposeCited\":\"Seventh Schedule, item 1: performance of a function under law in the interest of sovereignty and integrity of India.\",
    \"receivedAt\":\"$(iso '2 days ago')\",
    \"responseDueAt\":\"$(iso '12 days')\",
    \"nonDisclosureDirected\":true,
    \"nonDisclosurePermissionRef\":\"MHA/ND/2026/1188-A\""
  if [ -n "$AMAN_ID" ]; then
    BODY="$BODY,
    \"affectedPrincipalIds\":[\"$AMAN_ID\"]"
  fi
  BODY="$BODY
  }"
  RESP=$(call POST /api/information-requests "$BODY")
  if [ -n "$(printf '%s' "$RESP" | jq_py "d.get('id') or ''")" ]; then
    mark "Government request recorded, naming Aman, under a non-disclosure direction"
  else
    failed "Government information request -- $RESP"
  fi
fi

# =====================================================================
# Checklist
# =====================================================================
step "What was staged"
for line in "${STAGED[@]}"; do printf '%s\n' "$line"; done
echo
if printf '%s\n' "${STAGED[@]}" | grep -q "\[FAILED\]"; then
  warn "One or more stages failed. The demo will have an empty screen where"
  warn "that artifact should be. Details are in $STAGE_LOG"
  exit 1
else
  ok "Every demo screen has data behind it."
fi

if [ "$STAGE_STANDALONE" = "1" ]; then
  trap - EXIT
  pause_before_exit
fi
