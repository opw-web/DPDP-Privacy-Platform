#!/usr/bin/env bash
# Reproducible setup for the MVP1 evaluation (task 30 / spec section 6).
#
# This script brings up a clean database, seeds it, registers the four
# demo-company-server sources through the real API (not psql), maps their
# fields, attaches a purpose to each, and runs all four syncs SEQUENTIALLY.
#
# IMPORTANT: syncs are run one at a time on purpose. Firing all four
# `POST /:id/sync` calls concurrently was tried during this evaluation and
# produced real data loss: different data sources racing on the same
# identifier (e.g. two people's records fighting over a phone number
# outside their own source's per-source `sync:{id}` lock, which only
# prevents two syncs of the SAME source overlapping, not cross-source
# races) causes some records' whole per-record transaction to roll back
# with `IdentifierOwnershipConflictError`, silently dropping the record
# from SourceRecord entirely rather than raising a MatchCandidate. See
# docs/EVALUATION_MVP1.md Check 4 and Check 6 for the observed evidence.
# Sequential syncs avoid the race because there is only ever one sync
# writing to the identity graph at a time.
#
# Usage: run from the repo root:
#   bash scripts/evaluate-mvp1.sh
#
# Prerequisites: postgres/redis/mailhog containers up, backend/frontend
# built, backend running on :4000, demo-company-server built and running
# on :5001. This script does NOT start those processes -- see
# docs/EVALUATION_MVP1.md "Setup" for how they were started in this
# evaluation.

set -euo pipefail

export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null

BACKEND_URL="http://localhost:4000"
DEMO_URL="http://localhost:5001"
SCRATCH="${EVAL_SCRATCH:-/tmp/dpdp-eval-scratch}"
mkdir -p "$SCRATCH"

echo "=== 1. Reset database, apply migrations, run base seed ==="
( cd dpdp-platform/backend && npx prisma migrate reset --force --skip-generate )

echo "=== 2. Log in as admin ==="
curl -s -X POST "$BACKEND_URL/api/auth/employee/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@acmeretail.demo","password":"Password123!"}' > "$SCRATCH/admin_login.json"
TOKEN=$(python3 -c "import json;print(json.load(open('$SCRATCH/admin_login.json'))['accessToken'])")
echo "$TOKEN" > "$SCRATCH/admin_token.txt"

auth() { echo "Authorization: Bearer $TOKEN"; }

create_source() {
  local varname="$1" name="$2" system="$3" path="$4" extid="$5" cred="$6"
  curl -s -X POST "$BACKEND_URL/api/data-sources" \
    -H "$(auth)" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$name\",\"systemType\":\"$system\",\"baseUrl\":\"$DEMO_URL$path\",\"recordsPath\":\"data\",\"externalIdField\":\"$extid\",\"authType\":\"BEARER\",\"credential\":\"$cred\",\"pageSize\":100}" \
    > "$SCRATCH/ds_$varname.json"
  python3 -c "import json;print(json.load(open('$SCRATCH/ds_$varname.json'))['id'])" > "$SCRATCH/id_$varname.txt"
}

echo "=== 3. Register the four demo sources (keys from demo-company-server/README.md) ==="
create_source marketing "Marketing" "CRM" "/api/marketing/customers" "id" "demo_marketing_readonly_123"
create_source sales "Sales" "CRM" "/api/sales/customers" "crm_id" "demo_sales_readonly_456"
create_source support "Support" "Helpdesk" "/api/support/users" "user_ref" "demo_support_readonly_789"
create_source ecommerce "E-commerce" "Ecommerce" "/api/ecommerce/customers" "customer_code" "demo_ecom_readonly_012"

echo "=== 4. Test connections + discover schema ==="
for s in marketing sales support ecommerce; do
  id=$(cat "$SCRATCH/id_$s.txt")
  curl -s -X POST "$BACKEND_URL/api/data-sources/$id/test-connection" -H "$(auth)" > /dev/null
  curl -s -X POST "$BACKEND_URL/api/data-sources/$id/discover-schema" -H "$(auth)" > "$SCRATCH/schema_$s.json"
done

echo "=== 5. Map fields (canonical field mapping per demo-company-server/README.md) ==="
map_source() {
  local s="$1" body="$2"
  local id
  id=$(cat "$SCRATCH/id_$s.txt")
  curl -s -X PUT "$BACKEND_URL/api/data-sources/$id/mappings" -H "$(auth)" -H 'Content-Type: application/json' -d "$body" > "$SCRATCH/mappings_$s.json"
}

map_source marketing '{"mappings":[
 {"sourceField":"id","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"customer_email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"mobile_number","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"first_name","canonicalField":"FIRST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"surname","canonicalField":"LAST_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"city","canonicalField":"CITY","dataCategory":"LOCATION"},
 {"sourceField":"subscribed_on","canonicalField":"IGNORE"},
 {"sourceField":"campaign_source","canonicalField":"IGNORE"}
]}'

map_source sales '{"mappings":[
 {"sourceField":"crm_id","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"primary_email","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"contact_no","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"full_name","canonicalField":"FULL_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"billing_pincode","canonicalField":"POSTAL_CODE","dataCategory":"LOCATION"},
 {"sourceField":"account_status","canonicalField":"ACCOUNT_STATUS","dataCategory":"TRANSACTIONAL"},
 {"sourceField":"lifetime_value","canonicalField":"PURCHASE_TOTAL","dataCategory":"FINANCIAL"}
]}'

map_source support '{"mappings":[
 {"sourceField":"user_ref","canonicalField":"EXTERNAL_ID"},
 {"sourceField":"email_address","canonicalField":"EMAIL","dataCategory":"CONTACT"},
 {"sourceField":"phone","canonicalField":"PHONE","dataCategory":"CONTACT"},
 {"sourceField":"name","canonicalField":"FULL_NAME","dataCategory":"IDENTITY"},
 {"sourceField":"last_ticket_at","canonicalField":"LAST_ACTIVITY_AT","dataCategory":"BEHAVIOURAL"},
 {"sourceField":"tickets_count","canonicalField":"IGNORE"}
]}'

map_source ecommerce '{"mappings":[
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
]}'

echo "=== 6. Create one purpose per source and attach it ==="
create_purpose() {
  local varname="$1" code="$2" name="$3" desc="$4" basis="$5" limb="$6" cats="$7"
  local limbjson=""
  if [ -n "$limb" ]; then limbjson=",\"legitimateUseLimb\":\"$limb\""; fi
  curl -s -X POST "$BACKEND_URL/api/purposes" -H "$(auth)" -H 'Content-Type: application/json' \
    -d "{\"code\":\"$code\",\"name\":\"$name\",\"description\":\"$desc\",\"lawfulBasis\":\"$basis\"$limbjson,\"basisJustification\":\"Recorded for MVP1 evaluation setup.\",\"dataCategories\":$cats}" \
    > "$SCRATCH/purpose_$varname.json"
}
attach_purpose() {
  local s="$1" p="$2"
  local sid pid
  sid=$(python3 -c "import json;print(json.load(open('$SCRATCH/ds_$s.json'))['id'])")
  pid=$(python3 -c "import json;print(json.load(open('$SCRATCH/purpose_$p.json'))['id'])")
  curl -s -X PUT "$BACKEND_URL/api/data-sources/$sid/purposes" -H "$(auth)" -H 'Content-Type: application/json' -d "{\"purposeIds\":[\"$pid\"]}" > /dev/null
}

create_purpose marketing "MARKETING_COMMS" "Marketing Communications" "Sending promotional campaigns and offers" "CONSENT" "" '["CONTACT","IDENTITY","LOCATION"]'
create_purpose sales "SALES_CRM" "Sales Relationship Management" "Managing customer accounts and sales pipeline" "LEGITIMATE_USE" "VOLUNTARY_PROVISION" '["CONTACT","IDENTITY","LOCATION","FINANCIAL","TRANSACTIONAL"]'
create_purpose support "CUSTOMER_SUPPORT" "Customer Support" "Resolving customer support tickets" "LEGITIMATE_USE" "VOLUNTARY_PROVISION" '["CONTACT","IDENTITY","BEHAVIOURAL"]'
create_purpose ecommerce "ORDER_FULFILMENT" "Order Fulfilment" "Fulfilling e-commerce orders and shipping" "LEGITIMATE_USE" "VOLUNTARY_PROVISION" '["CONTACT","IDENTITY","LOCATION","FINANCIAL","TRANSACTIONAL","DEMOGRAPHIC"]'

attach_purpose marketing marketing
attach_purpose sales sales
attach_purpose support support
attach_purpose ecommerce ecommerce

echo "=== 7. Run all four syncs SEQUENTIALLY (see note at top of file) ==="
sync_and_wait() {
  local s="$1"
  local id
  id=$(cat "$SCRATCH/id_$s.txt")
  curl -s -X POST "$BACKEND_URL/api/data-sources/$id/sync" -H "$(auth)" > /dev/null
  for _ in $(seq 1 120); do
    local status
    status=$(curl -s "$BACKEND_URL/api/sync-jobs?dataSourceId=$id&limit=1" -H "$(auth)" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows = d if isinstance(d, list) else d.get('data', d.get('items', []))
print(rows[0]['status'] if rows else 'NONE')
")
    if [ "$status" != "QUEUED" ] && [ "$status" != "RUNNING" ]; then
      echo "  $s sync finished: $status"
      return 0
    fi
    sleep 2
  done
  echo "  $s sync did not finish within timeout" >&2
  return 1
}

SYNC_START=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
sync_and_wait marketing
sync_and_wait sales
sync_and_wait support
sync_and_wait ecommerce
SYNC_END=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
echo "Sync wall-clock: $SYNC_START -> $SYNC_END"

echo "=== 8. Run the account-claiming seed (must run after the first sync) ==="
( cd dpdp-platform/backend && npm run seed:principals )

echo "=== Setup complete. Proceed to the checks in docs/EVALUATION_MVP1.md ==="
