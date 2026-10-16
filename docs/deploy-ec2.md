# Deploy Trakk to a single EC2 instance (test)

> **Containers:** the existing `docker-compose.yml` is the dev shape (bind-mounted source, `npm run dev`). This runbook deploys that stack as-is for a **test** environment — it is not a production recipe and does not introduce a `docker-compose.prod.yml`.

> **Placeholders:** every `<…>` token below is literal text. No real IP address (sandbox or otherwise), secret, key, or AWS identifier is committed anywhere in this repo.

## 1. TL;DR

Spin up Trakk on one `t3.small` AL2023 instance in `us-east-1` using `docker compose`, lock the firewall to one source IP, smoke test it from the sandbox, then tear it down.

## 2. Prerequisites — what to have on the sandbox before you start

- **AWS CLI configured**, region **`us-east-1`** set on every call. The sandbox's `aws configure get region` value is empty by design — do **not** rely on a default; every command below passes `--region us-east-1` explicitly.
- **Caller principal confirmed.** Run:

  ```
  aws sts get-caller-identity --query Arn --output text
  ```

  …and verify that the principal is covered by the `Project=trakk-test` ALLOW rule in `.config/project/security-rules.md`. The commands in this runbook only call actions that the ALLOW rule permits (EC2 instance create / start / stop / reboot / terminate, security group create / delete, ingress authorize / revoke, key pair create / delete).
- **`docs/deploy-ec2.md` is the only file in this PR.** No resources are created in this subcard. All commands in this runbook are intended for the provisioning / smoke / teardown subcards that follow.
- **`/workspace/ec2-keys/` is a sandbox-only directory** outside the repo; the `.pem` key never enters the repository.

## 3. Resolve the network and the AMI — read-only

Run these **before** creating anything. Save the values into shell vars for the next sections.

```
VPC_ID=$(aws ec2 describe-vpcs --region us-east-1 \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

SUBNET_ID=$(aws ec2 describe-subnets --region us-east-1 \
  --filters Name=vpc-id,Values="$VPC_ID" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)

AZ=$(aws ec2 describe-subnets --region us-east-1 \
  --subnet-ids "$SUBNET_ID" \
  --query 'Subnets[0].AvailabilityZone' --output text)

AMI_ID=$(aws ssm get-parameter --region us-east-1 \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text)

# Sandbox public IP — used for SG :22 rule (this machine, right now).
sandbox_ip=$(curl -s --max-time 10 https://checkip.amazonaws.com)
```

Notes for the implementer:

- The filter on subnets is `default-for-az`, **not** `isDefault`. The latter is invalid for `describe-subnets` and returns `InvalidParameterValue`.
- `VPC_ID` is determined dynamically — do **not** hard-code the value seen on 2026-10-16, in case the default VPC has been recreated since then.
- `AMI_ID` is fetched from SSM (no need to fall back to `describe-images`) unless `ssm get-parameter` is rejected by the ALLOW rules.
- `OPERATOR_IP/32` (the operator's office IP) is what you put in the two `--cidr` rules below — replace it at run time with your own public IP; do **not** substitute the sandbox IP here.

## 4. Create the key pair (lives on the sandbox, never in the repo)

```
mkdir -p /workspace/ec2-keys
aws ec2 create-key-pair --region us-east-1 \
  --key-name trakk-test-ec2 \
  --query 'KeyMaterial' --output text \
  > /workspace/ec2-keys/trakk-test-ec2.pem
chmod 600 /workspace/ec2-keys/trakk-test-ec2.pem
```

- The path `/workspace/...` is sandbox-side only. Never commit, never echo the contents, never copy into the repo.
- No `.gitignore` change is needed because the file lives outside the repo.

## 5. Create the security group (inbound locked down)

```
SG_ID=$(aws ec2 create-security-group --region us-east-1 \
  --group-name trakk-test-ec2-sg \
  --description "trakk test EC2 - 22 from sandbox, 80/3000 from office" \
  --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]' \
  --query 'GroupId' --output text)

# SSH only from the sandbox
aws ec2 authorize-security-group-ingress --region us-east-1 \
  --group-id "$SG_ID" \
  --protocol tcp --port 22 --cidr "$sandbox_ip/32"

# HTTP from the office
aws ec2 authorize-security-group-ingress --region us-east-1 \
  --group-id "$SG_ID" \
  --protocol tcp --port 80  --cidr OPERATOR_IP/32
aws ec2 authorize-security-group-ingress --region us-east-1 \
  --group-id "$SG_ID" \
  --protocol tcp --port 3000 --cidr OPERATOR_IP/32
```

## 6. Launch the EC2 instance (t3.small, AL2023, public IP)

```
INSTANCE_ID=$(aws ec2 run-instances --region us-east-1 \
  --image-id "$AMI_ID" \
  --instance-type t3.small \
  --key-name trakk-test-ec2 \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --security-group-ids "$SG_ID" \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true}' \
  --tag-specifications \
    'ResourceType=instance,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]' \
    'ResourceType=volume,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]' \
  --query 'Instances[0].InstanceId' --output text)
```

- The two `--tag-specifications` blocks tag **both** the instance and its root EBS volume, as required by the constraints.

Wait for the instance to be `running` and have its public IP:

```
aws ec2 wait instance-running --region us-east-1 --instance-ids "$INSTANCE_ID"
PUBLIC_IP=$(aws ec2 describe-instances --region us-east-1 \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
```

## 7. Install Docker on the instance + copy the repo with `scp`

SSH in:

```
ssh -i /workspace/ec2-keys/trakk-test-ec2.pem ec2-user@"$PUBLIC_IP"
```

On the **instance**:

```
sudo dnf update -y && sudo dnf install -y docker git
sudo systemctl enable --now docker && sudo usermod -aG docker ec2-user
```

Install the compose plugin (AL2023 has no `docker-compose-plugin` in `dnf`, so the manual plugin path is the right answer):

```
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version   # should print a version, not "command not found"
```

> Re-login (or `newgrp docker`) so the new `docker` group is honored for the non-root user.

On the **sandbox**, archive and copy the repo. Do **not** `git clone` from inside the instance — the SSH rule is locked to the sandbox, and the `~/.aws` credentials are not on the instance:

```
tar --exclude-vcs --exclude='.env' --exclude='.env.*' \
    -czf /tmp/trakk.tar.gz -C /workspace/repos trakk
scp -i /workspace/ec2-keys/trakk-test-ec2.pem /tmp/trakk.tar.gz \
    ec2-user@"$PUBLIC_IP":~/trakk.tar.gz
```

On the **instance**:

```
mkdir -p ~/trakk && tar -xzf ~/trakk.tar.gz -C ~/trakk --strip-components=1
```

## 8. Generate `.env` on the host with random secrets

The `.env` is **generated on the instance** — never copy a real `.env` from anywhere. Every secret below is a 64-char base64 string from `openssl rand -base64 48`:

```
cd ~/trakk
cat > .env <<'EOF'
POSTGRES_USER=trakk
POSTGRES_PASSWORD=<64-char-base64>
POSTGRES_DB=trakk
DATABASE_URL=postgresql://trakk:${POSTGRES_PASSWORD}@db:5432/trakk
JWT_SECRET=<64-char-base64>
JWT_EXPIRY=7d
PORT=4000
CORS_ORIGIN=http://${PUBLIC_IP}:3000
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}
INTERNAL_API_URL=http://backend:4000/api/v1
S3_BUCKET=
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_URL=
AVATAR_UPLOAD_DIR=
EOF

> **Why `NODE_ENV=development` for a plain-HTTP test deploy:** `backend/src/routes/auth.routes.ts` sets the session cookie's `Secure` flag from `config.NODE_ENV === 'production'`. Over plain HTTP, a `Secure` cookie is dropped by the browser, so `/dashboard` bounces back to `/login` even though the login returns 200. For a test deploy reached over plain HTTP, set `NODE_ENV=development` in this `.env` so the cookie is issued without `Secure`. **For a real production deploy**, `NODE_ENV=production` is correct AND HTTPS must terminate in front of the backend (e.g., at an ALB) so the `Secure` cookie is honored on the way back from the browser; this codebase assumes HTTPS terminates at one common origin (see the comment in `backend/src/config.ts`: "Prod doesn't need this — frontend and backend share one ALB origin").

chmod 600 .env
```

- **`NEXT_PUBLIC_API_URL` must be the instance's public IP**, not `http://localhost` — the frontend container reads it at container start time via `${NEXT_PUBLIC_API_URL}` in `docker-compose.yml`. The `docker compose` invocation in step 9 must use `--env-file .env` so the `${...}` substitution in the `frontend` service's `environment` block actually sees it.
- **`CORS_ORIGIN`** is the frontend's origin (`http://<IP>:3000`), so browser requests from `:3000` to `:80` are accepted.

## 9. Bring the stack up

```
docker compose -f docker-compose.yml --env-file .env up -d --build
```

- Wait for the `backend` healthcheck to flip green, then for the `frontend` one (15s interval, 30s start_period). A safe ceiling:

  ```
  for i in $(seq 1 60); do
    backend_ok=$(docker inspect --format='{{.State.Health.Status}}' trakk-backend-1 2>/dev/null || echo starting)
    frontend_ok=$(docker inspect --format='{{.State.Health.Status}}' trakk-frontend-1 2>/dev/null || echo starting)
    if [ "$backend_ok" = "healthy" ] && [ "$frontend_ok" = "healthy" ]; then
      echo READY; break
    fi
    sleep 5
  done
  ```

  Service container names follow the docker-compose v2 convention `<project>-<service>-1` (default project = directory basename = `trakk`). If the names differ in actual output, list them with `docker ps --format '{{.Names}}'` and adapt.

## 10. Smoke test — run from the sandbox, against the instance public IP

Backend health (path comes from `backend/src/routes/auth.routes.ts` mounted under `/api/v1`; the same path is used by the `wget ... /api/v1/health` healthcheck in `docker-compose.yml`):

```
curl -fsS -o /dev/null -w 'backend: %{http_code}\n' \
  http://$PUBLIC_IP/api/v1/health
```

Frontend root:

```
curl -fsS -o /dev/null -w 'frontend: %{http_code}\n' \
  http://$PUBLIC_IP:3000/
```

Register + log in a test user through the API (the frontend uses Next.js dev mode, so the API is reachable directly):

```
curl -fsS -X POST http://$PUBLIC_IP/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"<a password>","name":"Smoke"}'
curl -fsS -X POST http://$PUBLIC_IP/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke@example.com","password":"<the same password>"}'
```

Both should return 200/201 with a body containing a `token`.

## 11. Teardown — exact `aws ec2 ...` commands

Every command below **must** keep the `Project=trakk-test` filter where applicable so the ALLOW rule keeps working. Order: **instance → SG → key pair**.

```
# 1. Terminate the instance
aws ec2 terminate-instances --region us-east-1 \
  --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-terminated --region us-east-1 \
  --instance-ids "$INSTANCE_ID"

# 2. Delete the security group
aws ec2 delete-security-group --region us-east-1 \
  --group-id "$SG_ID"

# 3. Delete the key pair (the local .pem stays on the sandbox disk;
#    you can rm it after this if you don't want it around)
aws ec2 delete-key-pair --region us-east-1 \
  --key-name trakk-test-ec2
rm -f /workspace/ec2-keys/trakk-test-ec2.pem /tmp/trakk.tar.gz
```

## 12. Acceptance checklist

- [ ] PR contains only `docs/deploy-ec2.md`.
- [ ] Instance was running and tagged `Project=trakk-test` + `Owner=gean.rios` (verified by `aws ec2 describe-instances --filters Name=tag:Project,Values=trakk-test`).
- [ ] `curl http://$PUBLIC_IP/api/v1/health` returned 200.
- [ ] `curl -o /dev/null -w '%{http_code}' http://$PUBLIC_IP:3000/` returned 200.
- [ ] A user was registered via `POST /api/v1/auth/register` and the same user logged in via `POST /api/v1/auth/login`.
- [ ] After teardown, all four AWS resources are gone (`describe-instances` / `describe-security-groups` / `describe-key-pairs` filtered by `tag:Project=trakk-test` returns empty).
