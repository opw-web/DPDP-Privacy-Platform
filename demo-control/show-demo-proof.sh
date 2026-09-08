#!/usr/bin/env bash
# "Show Demo Proof" -- counts the demo data straight out of the database
# and the platform's own API, and shows the numbers in a window you can
# point at. No terminal, no SQL typed by hand.
#
# Every number here is read live at the moment you click. Nothing is
# cached and nothing is hard-coded except the reference targets, which
# are printed beside the observed values so a mismatch is obvious.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# shellcheck disable=SC1091
. ./common.sh
trap on_error EXIT

echo "======================================================"
echo " Demo Proof -- what is actually in the database"
echo "======================================================"
echo

setup_node

if ! backend_healthy; then
  warn "The demo is not running, so there is nothing to count yet."
  warn "Double-click '1 - Start Privacy Demo' first, then try this again."
  trap - EXIT
  pause_before_exit
  exit 0
fi

# --- counts straight from Postgres -----------------------------------
psql_count() {
  # psql_count SQL -- prints the single number, or "?" if the query fails.
  # psql_q runs inside the postgres container, so no PostgreSQL client tools
  # need to be installed on this computer.
  psql_q "$1"
}

say "Counting..."

# --- the four headline numbers from the platform's own API ------------
# These are the same figures the dashboard renders, fetched the same way
# the dashboard fetches them -- not a separate query that might disagree.
LOGIN_JSON=$(curl -s -X POST "$BACKEND_URL/api/auth/employee/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN_JSON" | py_run -c "import json,sys; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null || true)

if [ -n "$TOKEN" ]; then
  SUMMARY=$(curl -s "$BACKEND_URL/api/inventory/summary" -H "Authorization: Bearer $TOKEN")
  jnum() { printf '%s' "$SUMMARY" | py_run -c "import json,sys; print(json.load(sys.stdin).get('$1','?'))" 2>/dev/null || echo "?"; }
  RAW=$(jnum rawRecordCount)
  PRINCIPALS=$(jnum uniquePrincipalCount)
  PENDING=$(jnum pendingReviewCount)
  CONFLICTS=$(jnum conflictCount)
else
  RAW="?"; PRINCIPALS="?"; PENDING="?"; CONFLICTS="?"
fi

UNDER18=$(psql_count      'SELECT COUNT(*) FROM "DataPrincipal" WHERE "ageStatus" = '"'"'CHILD'"'"';')
NOTICES=$(psql_count      'SELECT COUNT(*) FROM "NoticeVersion";')
TRANSLATIONS=$(psql_count 'SELECT COUNT(*) FROM "NoticeTranslation";')
ACCOUNTS=$(psql_count     'SELECT COUNT(*) FROM "PrincipalAccount";')
CONSENTS=$(psql_count     'SELECT COUNT(*) FROM "ConsentRecord";')
CONSENT_EVENTS=$(psql_count 'SELECT COUNT(*) FROM "ConsentEvent";')
REQUESTS=$(psql_count     'SELECT COUNT(*) FROM "PrincipalRequest";')
GUARDIANS=$(psql_count    'SELECT COUNT(*) FROM "GuardianRelationship";')
CAMPAIGNS=$(psql_count    'SELECT COUNT(*) FROM "MessageCampaign";')
SUPPRESSED=$(psql_count   'SELECT COUNT(*) FROM "CampaignRecipient" WHERE "status" = '"'"'SUPPRESSED'"'"';')
BREACHES=$(psql_count     'SELECT COUNT(*) FROM "BreachIncident";')
AFFECTED=$(psql_count     'SELECT COUNT(*) FROM "BreachAffectedPrincipal";')
OBLIGATIONS=$(psql_count  'SELECT COUNT(*) FROM "BreachObligation";')
ERASURE=$(psql_count      'SELECT COUNT(*) FROM "ErasureTask";')
INFOREQ=$(psql_count      'SELECT COUNT(*) FROM "InformationRequest";')
AUDIT=$(psql_count        'SELECT COUNT(*) FROM "AuditEvent";')
ACCESSLOG=$(psql_count    'SELECT COUNT(*) FROM "AccessLogEntry";')
SOURCES=$(psql_count      'SELECT COUNT(*) FROM "DataSource";')
PURPOSES=$(psql_count     'SELECT COUNT(*) FROM "ProcessingPurpose";')
RULES=$(psql_count        'SELECT COUNT(*) FROM "ComplianceRule";')

# --- render ----------------------------------------------------------
REPORT=$(cat <<EOF
DPDP PLATFORM -- LIVE DATA COUNTS
Read from the database at $(date '+%d %B %Y, %-I:%M %p')

DISCOVERY -- who the company holds data about
  Records pulled from the source systems ... $RAW      (expected 500)
  Real people those records describe ....... $PRINCIPALS      (expected 327)
  Pairs waiting for a human to decide ...... $PENDING      (expected 4)
  Conflicting values flagged ............... $CONFLICTS      (expected 12)
  Under-18 people flagged .................. $UNDER18      (expected 6)

  Read that top line as: 500 rows in, 327 people out. The platform
  worked out that the same person appears in several systems under
  different spellings -- and refused to guess on 4 of them.

THE RECORD OF PROCESSING -- what the company declared
  Source systems connected ................. $SOURCES
  Purposes declared, each with a lawful basis  $PURPOSES
  Compliance rules seeded for review ....... $RULES

TELLING PEOPLE -- notices
  Published notice versions ................ $NOTICES
  Translations of those notices ............ $TRANSLATIONS
  A published version cannot be edited. Correcting one means
  publishing a new version, and the old one stays readable.

CONSENT
  Consent records .......................... $CONSENTS
  Consent events (grant / withdraw / refuse)  $CONSENT_EVENTS
  Every record names the exact notice version the person was shown.

PEOPLE EXERCISING THEIR RIGHTS
  Portal accounts people can sign in with .. $ACCOUNTS
  Requests submitted ....................... $REQUESTS

CHILDREN
  Verified guardian relationships ........... $GUARDIANS
  Campaign recipients suppressed ........... $SUPPRESSED
  Campaigns run ............................ $CAMPAIGNS
  A child is suppressed from marketing even when the guardian
  consented. The law does not let a guardian consent to that.

BREACH
  Breach incidents ......................... $BREACHES
  People recorded as affected .............. $AFFECTED
  Regulator obligations being timed ........ $OBLIGATIONS

RETENTION AND ERASURE
  Erasure tasks ............................ $ERASURE

GOVERNMENT
  Information requests recorded ............ $INFOREQ

PROOF
  Audit events in the hash chain ........... $AUDIT
  Personal-data views logged ............... $ACCESSLOG
  Each audit row carries the hash of the row before it. Deleting or
  editing any one of them breaks the chain, and the app can show it.
EOF
)

printf '%s\n' "$REPORT"

if command -v zenity >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
  printf '%s\n' "$REPORT" | zenity --text-info \
    --title="Demo Proof -- live counts from the database" \
    --width=700 --height=680 --font="Monospace 10" 2>/dev/null || true
fi

trap - EXIT
pause_before_exit
