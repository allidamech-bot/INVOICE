#!/usr/bin/env bash
# Run only in authenticated AWS CloudShell, not the EC2 guest.
set -Eeuo pipefail
export AWS_PAGER=""
REGION=eu-north-1
INSTANCE=i-05530aee6c25c984e
ROLE=lourex-zatca-staging-wif
PROFILE=$ROLE
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
[[ "$ACCOUNT" =~ ^[0-9]{12}$ ]]
NAME=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].Tags[?Key==`Name`].Value | [0]' --output text)
[[ "$NAME" == lourex-zatca-staging ]]
CURRENT=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text)
if [[ "$CURRENT" != None && "$CURRENT" != "arn:aws:iam::$ACCOUNT:instance-profile/$PROFILE" ]]; then
 echo "EXISTING IAM PROFILE: $CURRENT"
 echo "STOP: no replacement performed"
 exit 2
fi
D=$(mktemp -d); trap 'rm -rf -- "$D"' EXIT
printf '%s\n' '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' > "$D/trust.json"
if ! aws iam get-role --role-name "$ROLE" --output json > "$D/role.json" 2>"$D/error"; then
 grep -q NoSuchEntity "$D/error" || { echo 'IAM ROLE LOOKUP FAILED'; exit 1; }
 aws iam create-role --role-name "$ROLE" --assume-role-policy-document "file://$D/trust.json" --description "LOUREX isolated QA EC2 federation; no AWS resource permissions" > /dev/null
 aws iam get-role --role-name "$ROLE" --output json > "$D/role.json"
fi
python3 - "$D/role.json" "$D/trust.json" <<'PY'
import json,sys
a=json.load(open(sys.argv[1]))["Role"]["AssumeRolePolicyDocument"]
b=json.load(open(sys.argv[2]))
assert a==b, "Existing role trust differs; do not overwrite"
PY
[[ "$(aws iam list-attached-role-policies --role-name "$ROLE" --query 'length(AttachedPolicies)' --output text)" == 0 ]]
[[ "$(aws iam list-role-policies --role-name "$ROLE" --query 'length(PolicyNames)' --output text)" == 0 ]]
if ! aws iam get-instance-profile --instance-profile-name "$PROFILE" --output json > "$D/profile.json" 2>"$D/error"; then
 grep -q NoSuchEntity "$D/error" || { echo 'IAM PROFILE LOOKUP FAILED'; exit 1; }
 aws iam create-instance-profile --instance-profile-name "$PROFILE" > /dev/null
 aws iam get-instance-profile --instance-profile-name "$PROFILE" --output json > "$D/profile.json"
fi
ROLE_COUNT=$(aws iam get-instance-profile --instance-profile-name "$PROFILE" --query 'length(InstanceProfile.Roles)' --output text)
case "$ROLE_COUNT" in
 0) aws iam add-role-to-instance-profile --instance-profile-name "$PROFILE" --role-name "$ROLE" ;;
 1) [[ "$(aws iam get-instance-profile --instance-profile-name "$PROFILE" --query 'InstanceProfile.Roles[0].RoleName' --output text)" == "$ROLE" ]] ;;
 *) exit 1 ;;
esac
# Restrict instance metadata to IMDSv2. No SSH or public endpoint changes.
aws ec2 modify-instance-metadata-options --region "$REGION" --instance-id "$INSTANCE" --http-endpoint enabled --http-tokens required > /dev/null
if [[ "$CURRENT" == None ]]; then
 for attempt in 1 2 3 4 5; do
  if aws ec2 associate-iam-instance-profile --region "$REGION" --instance-id "$INSTANCE" --iam-instance-profile "Name=$PROFILE" > "$D/association.json" 2>"$D/error"; then break; fi
  grep -Eq 'InvalidParameterValue|InvalidIamInstanceProfile' "$D/error" && [[ "$attempt" != 5 ]] || { echo 'IAM PROFILE ASSOCIATION FAILED'; exit 1; }
  sleep 5
 done
fi
# Read back the attached profile; no credential values are requested.
ACTUAL=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].IamInstanceProfile.Arn' --output text)
[[ "$ACTUAL" == "arn:aws:iam::$ACCOUNT:instance-profile/$PROFILE" ]]
printf 'AWS ACCOUNT: %s\nAWS ROLE: %s\nLOUREX AWS IDENTITY ATTACHED\n' "$ACCOUNT" "$ROLE"
