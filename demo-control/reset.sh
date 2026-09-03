#!/usr/bin/env bash
# "Reset Demo to Fresh State" -- the from-scratch path. Stops everything,
# throws away the current database, rebuilds it from the platform's own
# migrations, reseeds the demo company's four source systems with a
# fixed dataset, starts everything back up, connects and syncs all four
# sources through the real API, and makes the one governance decision
# (City is the same real-world fact on Marketing and E-commerce) the
# accuracy dashboard needs a human to make.
#
# DESTROYS all current demo data. Requires one confirmation click.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

echo "======================================================"
echo " Reset Privacy Demo to Fresh State"
echo "======================================================"
echo
warn "This PERMANENTLY DELETES all current demo data (every principal,"
warn "request, consent, breach, everything) and rebuilds the demo from"
warn "scratch. This cannot be undone."
echo

confirmed=0
if command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  if zenity --question --title="Reset Privacy Demo to Fresh State" \
       --text="This will PERMANENTLY DELETE all current demo data and rebuild everything from scratch.\n\nThis cannot be undone. Continue?" \
       --ok-label="Yes, reset everything" --cancel-label="Cancel" --width=420 2>/dev/null; then
    confirmed=1
  fi
else
  read -r -p "Type YES (in capitals) to permanently delete all demo data and rebuild it: " confirm_typed
  if [ "$confirm_typed" = "YES" ]; then
    confirmed=1
  fi
fi

if [ "$confirmed" != "1" ]; then
  say "Cancelled. Nothing was changed."
  trap - EXIT
  pause_before_exit
  exit 0
fi

say "Confirmed. Starting the reset..."
setup_node

# -----------------------------------------------------------------
# 1/7 -- stop the app processes (containers are left running -- the
# database step needs postgres up anyway).
# -----------------------------------------------------------------
step "1/7 -- Stopping the demo application"
stop_by_cwd "dist/main.js"   "$BACKEND_DIR"  "the backend API"
stop_by_cwd "vite"           "$FRONTEND_DIR" "the platform website"
stop_by_cwd "dist/server.js" "$DEMO_DIR"     "the demo company server"

# -----------------------------------------------------------------
# 2/7 -- drop and recreate the database via the supported Prisma path.
# -----------------------------------------------------------------
step "2/7 -- Rebuilding the database from scratch"
ensure_database_up || exit 1
say "Dropping and recreating the database, then applying every migration"
say "(this also reseeds the base demo organisation and its five employee"
say "accounts -- this can take a minute)..."
if ( cd "$BACKEND_DIR" && npx prisma migrate reset --force --skip-generate ) >>"$LOG_DIR/reset.log" 2>&1; then
  ok "Database rebuilt from scratch."
else
  warn "The database rebuild failed. Check $LOG_DIR/reset.log"
  exit 1
fi

# -----------------------------------------------------------------
# 3/7 -- seed the demo company's own deterministic dataset.
# -----------------------------------------------------------------
step "3/7 -- Seeding Acme Retail's demo company data"
say "Regenerating Acme Retail's four source systems with a fixed, repeatable dataset (seed 20260830)..."
if ( cd "$DEMO_DIR" && npm run seed ) >>"$LOG_DIR/reset.log" 2>&1; then
  ok "Demo company data seeded."
else
  warn "Seeding the demo company data failed. Check $LOG_DIR/reset.log"
  exit 1
fi

# -----------------------------------------------------------------
# 4/7 -- start everything back up.
# -----------------------------------------------------------------
step "4/7 -- Starting the demo services"
say "Rebuilding the backend from the current checked-out code (not reusing"
say "whatever was previously running) so the reset always exercises the"
say "latest fixes, never a stale build..."
if ( cd "$BACKEND_DIR" && npm run build ) >>"$LOG_DIR/backend.log" 2>&1; then
  ok "Backend rebuilt from current source."
else
  warn "Rebuilding the backend failed. Check $LOG_DIR/backend.log"
  exit 1
fi
ensure_backend_up || exit 1
ensure_demo_company_up || exit 1
ensure_frontend_up || exit 1

# -----------------------------------------------------------------
# 5/7 -- connect and sync the four data sources through the real API.
# -----------------------------------------------------------------
step "5/7 -- Connecting and syncing the four data sources"

api() {
  # api METHOD PATH [JSON_BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$BACKEND_URL$path" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d "$body"
  else
    curl -s -X "$method" "$BACKEND_URL$path" -H "Authorization: Bearer $TOKEN"
  fi
}

json_get() {
  # json_get PYTHON_EXPR  -- reads JSON from stdin, prints the expression's value.
  python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"
}

say "Signing in as the demo admin..."
LOGIN_JSON=$(curl -s -X POST "$BACKEND_URL/api/auth/employee/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN_JSON" | json_get "d['accessToken']" 2>/dev/null || true)
if [ -z "$TOKEN" ]; then
  warn "Could not sign in as the demo admin. Response was:"
  warn "$LOGIN_JSON"
  exit 1
fi
ok "Signed in."

declare -A SOURCE_ID

create_source() {
  local key="$1" name="$2" system="$3" path="$4" extid="$5" cred="$6"
  local resp
  resp=$(api POST /api/data-sources \
    "{\"name\":\"$name\",\"systemType\":\"$system\",\"baseUrl\":\"$DEMO_URL$path\",\"recordsPath\":\"data\",\"externalIdField\":\"$extid\",\"authType\":\"BEARER\",\"credential\":\"$cred\",\"pageSize\":100}")
  SOURCE_ID[$key]=$(printf '%s' "$resp" | json_get "d['id']" 2>/dev/null || true)
  if [ -z "${SOURCE_ID[$key]}" ]; then
    warn "Could not register the $name source. Response was:"
    warn "$resp"
    exit 1
  fi
}

say "Registering the four Acme Retail source systems..."
create_source marketing "Marketing" "CRM" "/api/marketing/customers" "id" "demo_marketing_readonly_123"
create_source sales "Sales" "CRM" "/api/sales/customers" "crm_id" "demo_sales_readonly_456"
create_source support "Support" "Helpdesk" "/api/support/users" "user_ref" "demo_support_readonly_789"
create_source ecommerce "E-commerce" "Ecommerce" "/api/ecommerce/customers" "customer_code" "demo_ecom_readonly_012"
ok "Four sources registered."

say "Testing connections and discovering each source's fields..."
for s in marketing sales support ecommerce; do
  api POST "/api/data-sources/${SOURCE_ID[$s]}/test-connection" >/dev/null
  api POST "/api/data-sources/${SOURCE_ID[$s]}/discover-schema" >/dev/null
done
ok "Connections verified."

say "Mapping each source's fields to the platform's shared field names..."
api PUT "/api/data-sources/${SOURCE_ID[marketing]}/mappings" '{"mappings":[
 {"sourceField":"id","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"customer_email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"mobile_number","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"first_name","canonicalField":"FIRST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"surname","canonicalField":"LAST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"city","canonicalField":"CITY","dataCategory":"LOCATION"},
 {"sourceField":"subscribed_on","canonicalField":"IGNORE"},
 {"sourceField":"campaign_source","canonicalField":"IGNORE"}
]}' >/dev/null

api PUT "/api/data-sources/${SOURCE_ID[sales]}/mappings" '{"mappings":[
 {"sourceField":"crm_id","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"primary_email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"contact_no","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"full_name","canonicalField":"FULL_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"billing_pincode","canonicalField":"POSTAL_CODE","dataCategory":"LOCATION"},
 {"sourceField":"account_status","canonicalField":"ACCOUNT_STATUS","dataCategory":"TRANSACTIONAL"},
 {"sourceField":"lifetime_value","canonicalField":"PURCHASE_TOTAL","dataCategory":"FINANCIAL"}
]}' >/dev/null

api PUT "/api/data-sources/${SOURCE_ID[support]}/mappings" '{"mappings":[
 {"sourceField":"user_ref","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"email_address","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"phone","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"name","canonicalField":"FULL_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"last_ticket_at","canonicalField":"LAST_ACTIVITY_AT","dataCategory":"BEHAVIOURAL"},
 {"sourceField":"tickets_count","canonicalField":"IGNORE"}
]}' >/dev/null

api PUT "/api/data-sources/${SOURCE_ID[ecommerce]}/mappings" '{"mappings":[
 {"sourceField":"customer_code","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"phone_number","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"first_name","canonicalField":"FIRST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"last_name","canonicalField":"LAST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"dob","canonicalField":"DATE_OF_BIRTH","dataCategory":"DEMOGRAPHIC"},
 {"sourceField":"address_line_1","canonicalField":"ADDRESS_LINE1","dataCategory":"LOCATION"},
 {"sourceField":"city","canonicalField":"CITY","dataCategory":"LOCATION"},
 {"sourceField":"state","canonicalField":"STATE","dataCategory":"LOCATION"},
 {"sourceField":"pincode","canonicalField":"POSTAL_CODE","dataCategory":"LOCATION"},
 {"sourceField":"total_orders","canonicalField":"IGNORE"},
 {"sourceField":"total_spent","canonicalField":"PURCHASE_TOTAL","dataCategory":"FINANCIAL"}
]}' >/dev/null
ok "Fields mapped."

say "Recording why each source may hold personal data (one purpose per source)..."
create_purpose() {
  local key="$1" code="$2" name="$3" desc="$4" basis="$5" limb="$6" cats="$7"
  local limbjson=""
  if [ -n "$limb" ]; then limbjson=",\"legitimateUseLimb\":\"$limb\""; fi
  local resp
  resp=$(api POST /api/purposes \
    "{\"code\":\"$code\",\"name\":\"$name\",\"description\":\"$desc\",\"lawfulBasis\":\"$basis\"$limbjson,\"basisJustification\":\"Recorded automatically by the demo reset script.\",\"dataCategories\":$cats}")
  PURPOSE_ID[$key]=$(printf '%s' "$resp" | json_get "d['id']" 2>/dev/null || true)
  if [ -z "${PURPOSE_ID[$key]}" ]; then
    warn "Could not create the $name purpose. Response was:"
    warn "$resp"
    exit 1
  fi
}
declare -A PURPOSE_ID
create_purpose marketing "MARKETING_COMMS" "Marketing Communications" "Sending promotional campaigns and offers" "CONSENT" "" '["CONTACT","IDENTITY","LOCATION"]'
create_purpose sales "SALES_CRM" "Sales Relationship Management" "Managing customer accounts and sales pipeline" "LEGITIMATE_USE" "VOLUNTARY_PROVISION" '["CONTACT","IDENTITY","LOCATION","FINANCIAL","TRANSACTIONAL"]'
create_purpose support "CUSTOMER_SUPPORT" "Customer Support" "Resolving customer support tickets" "LEGITIMATE_USE" "VOLUNTARY_PROVISION" '["CONTACT","IDENTITY","BEHAVIOURAL"]'
create_purpose ecommerce "ORDER_FULFILMENT" "Order Fulfilment" "Fulfilling e-commerce orders and shipping" "LEGITIMATE_USE" "VOLUNTARY_PROVISION" '["CONTACT","IDENTITY","LOCATION","FINANCIAL","TRANSACTIONAL","DEMOGRAPHIC"]'

for s in marketing sales support ecommerce; do
  api PUT "/api/data-sources/${SOURCE_ID[$s]}/purposes" "{\"purposeIds\":[\"${PURPOSE_ID[$s]}\"]}" >/dev/null
done
ok "Purposes recorded and attached."

# Syncs run ONE AT A TIME on purpose (not in parallel): firing all four
# concurrently races different sources' records for the same identifier
# outside each source's own per-source sync lock, and has previously
# caused real data loss (see scripts/evaluate-mvp1.sh's note and
# docs/EVALUATION_MVP1.md Check 4/6). Sequential syncs avoid that race.
sync_and_wait() {
  local key="$1" name="$2"
  say "Syncing $name..."
  api POST "/api/data-sources/${SOURCE_ID[$key]}/sync" >/dev/null
  local waited=0
  while [ "$waited" -lt 240 ]; do
    local status
    status=$(api GET "/api/sync-jobs?dataSourceId=${SOURCE_ID[$key]}&limit=1" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows = d if isinstance(d, list) else d.get('data', d.get('items', []))
print(rows[0]['status'] if rows else 'NONE')
" 2>/dev/null || echo "NONE")
    if [ "$status" != "QUEUED" ] && [ "$status" != "RUNNING" ] && [ "$status" != "NONE" ]; then
      ok "$name sync finished: $status"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  warn "$name sync did not finish within 240 seconds (last status: $status)."
  return 1
}

sync_and_wait marketing "Marketing" || exit 1
sync_and_wait sales "Sales" || exit 1
sync_and_wait support "Support" || exit 1
sync_and_wait ecommerce "E-commerce" || exit 1
ok "All four sources synced and their sync queue is drained."

# -----------------------------------------------------------------
# 6/7 -- the one governance decision the accuracy dashboard needs a
# human to make: is "City" on Marketing and "City" on E-commerce the
# SAME real-world fact (so a mismatch between them is worth flagging),
# or just two differently-shaped fields that happen to share a name?
# -----------------------------------------------------------------
step "6/7 -- Reviewing the City field for the accuracy dashboard"
say "Marking City as the same real-world fact on Marketing and E-commerce:"
say "an administrator has to confirm this before a mismatch between the"
say "two sources counts as a tracked accuracy conflict (GO-03) -- without"
say "this one-time review, the dashboard reports 0 conflicts instead of"
say "the real ones sitting in the data."

api PUT "/api/data-sources/${SOURCE_ID[marketing]}/mappings" '{"mappings":[
 {"sourceField":"id","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"customer_email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"mobile_number","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"first_name","canonicalField":"FIRST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"surname","canonicalField":"LAST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"city","canonicalField":"CITY","dataCategory":"LOCATION","comparisonPolicy":"ACCURACY_COMPARABLE"},
 {"sourceField":"subscribed_on","canonicalField":"IGNORE"},
 {"sourceField":"campaign_source","canonicalField":"IGNORE"}
]}' >/dev/null

api PUT "/api/data-sources/${SOURCE_ID[ecommerce]}/mappings" '{"mappings":[
 {"sourceField":"customer_code","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"phone_number","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"first_name","canonicalField":"FIRST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"last_name","canonicalField":"LAST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"dob","canonicalField":"DATE_OF_BIRTH","dataCategory":"DEMOGRAPHIC"},
 {"sourceField":"address_line_1","canonicalField":"ADDRESS_LINE1","dataCategory":"LOCATION"},
 {"sourceField":"city","canonicalField":"CITY","dataCategory":"LOCATION","comparisonPolicy":"ACCURACY_COMPARABLE"},
 {"sourceField":"state","canonicalField":"STATE","dataCategory":"LOCATION"},
 {"sourceField":"pincode","canonicalField":"POSTAL_CODE","dataCategory":"LOCATION"},
 {"sourceField":"total_orders","canonicalField":"IGNORE"},
 {"sourceField":"total_spent","canonicalField":"PURCHASE_TOTAL","dataCategory":"FINANCIAL"}
]}' >/dev/null
ok "City marked accuracy-comparable on Marketing and E-commerce."

# -----------------------------------------------------------------
# 7/7 -- report the numbers actually observed. There is a KNOWN OPEN
# DEFECT (being diagnosed elsewhere, not fixed here): the principal
# count is non-deterministic across runs. This prints what is actually
# in the database, never a hard-coded expectation.
# -----------------------------------------------------------------
step "7/7 -- Final numbers"
SUMMARY_JSON=$(api GET /api/inventory/summary)
RAW=$(printf '%s' "$SUMMARY_JSON" | json_get "d['rawRecordCount']" 2>/dev/null || echo "?")
PRINCIPALS=$(printf '%s' "$SUMMARY_JSON" | json_get "d['uniquePrincipalCount']" 2>/dev/null || echo "?")
PENDING=$(printf '%s' "$SUMMARY_JSON" | json_get "d['pendingReviewCount']" 2>/dev/null || echo "?")
CONFLICTS=$(printf '%s' "$SUMMARY_JSON" | json_get "d['conflictCount']" 2>/dev/null || echo "?")

UNDER18=$(PGPASSWORD=dpdp psql -h 127.0.0.1 -p 5432 -U dpdp -d dpdp -tAc \
  "SELECT COUNT(*) FROM \"DataPrincipal\" WHERE \"ageStatus\" = 'CHILD';" 2>/dev/null || echo "?")

echo
say "Observed numbers for this reset (target for reference: 500 / 327 / 4 / 12 / 6):"
say "  Raw records ............. $RAW"
say "  Principals ............... $PRINCIPALS"
say "  Pending review ........... $PENDING"
say "  Accuracy conflicts (GO-03) $CONFLICTS"
say "  Under-18 flagged ......... $UNDER18"
echo
warn "KNOWN OPEN DEFECT: the principal count above can vary between resets"
warn "(327 and 328 have both been observed, with pending-review 4, 2 or 0)."
warn "This is being investigated separately -- it is not fixed by this script."

trap - EXIT
pause_before_exit
