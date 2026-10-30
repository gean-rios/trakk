# Deploying Trakk to a single EC2 instance

This runbook deploys Trakk to **one** Amazon EC2 host running the whole stack with
Docker Compose, reachable over **plain HTTP** on the host's public IP: the frontend on
port `3000`, the backend API on port `80`.

It is a **throwaway test deployment**, not production. It exists so the app can be
exercised end to end — register a user, log in, work on a board — on real infrastructure
without touching the repository's local setup.

Everything in this document uses **placeholders** instead of real addresses, because this
repository must not contain any IP address. Replace each placeholder with the value the
corresponding step produces:

| Placeholder | What it is | Where it comes from |
|---|---|---|
| `<INSTANCE_PUBLIC_IP>` | The instance's public IPv4 address | `aws ec2 describe-instances` (step 6) |
| `<INSTANCE_ID>` | The EC2 instance id | `aws ec2 run-instances` output (step 5) |
| `<SG_ID>` | The security group id | `aws ec2 create-security-group` output (step 2) |
| `<SG_NAME>` | The security group name | A name you choose, e.g. `<prefix>-ec2-test` |
| `<KEY_PAIR_NAME>` | The EC2 key pair name | A name you choose, e.g. `<prefix>-ec2-test` |
| `<VOLUME_ID>` | The root EBS volume id | `aws ec2 describe-volumes` (step 5) |
| `<VPC_ID>` | The default VPC | `aws ec2 describe-vpcs --filters Name=is-default,Values=true` (step 1) |
| `<SUBNET_ID>` | The default subnet in that VPC | `aws ec2 describe-subnets --filters Name=default-for-az,Values=true` (step 1) |
| `<SANDBOX_PUBLIC_IP>` | The public IP of the machine running the AWS CLI | `curl -s https://checkip.amazonaws.com` (step 3) |
| `<ALLOWED_CLIENT_CIDR>` | The single client allowed to reach ports 80 and 3000 | Comes from the deploy request itself — it is the public IP of the one machine that is allowed to open the app, expressed in CIDR form (an address with a `/32` suffix). It is left as a placeholder here so this repository contains no real addresses. |
| `<KEYFILE>` | Path to the downloaded private key | Wherever you choose to keep it (step 4) — never in this repository |

---

## 1. What this deploy is

**One EC2 instance, the whole application on it, plain HTTP, test only.**

The instance runs the repository's existing `docker-compose.yml` unchanged: `db`
(PostgreSQL), `migrate` (Prisma migrations, one-shot), `backend` (Express, published on
host port `80` → container port `4000`) and `frontend` (Next.js, published on host port
`3000`). There is no reverse proxy in front of the stack, exactly as in the local setup
described in the [README](../README.md).

**What this is not.** It is deliberately not a production deployment, and none of the
following is in scope:

- No TLS — the app is served over plain `http://`, which is why the session cookie is
  issued without the `Secure` flag.
- No domain — the app is reached by raw IP address.
- No load balancer, no Auto Scaling group.
- No managed database — PostgreSQL runs as a container on the same host.
- No container registry — images are built on the instance from the copied source.
- No CI/CD — the deploy is a documented sequence of commands, run by hand.
- No IAM roles — the instance has no instance profile and no AWS API access.
- No backups — the database lives in a Docker volume on the instance and dies with it.
- No Secrets Manager — secrets are generated on the host and live only in the host's `.env`.

Because it is a single host with the database on the same disk, it is also **not
highly available and not durable**. The whole point is to be cheap and disposable.

### Running costs

On-demand prices in `us-east-1`:

| Resource | Spec | Approx. cost |
|---|---|---|
| EC2 instance | `t3.small` | $0.0208 / hour → **$15.95 / month** (730 h) |
| Root EBS volume | gp3, 20 GiB, encrypted | $0.08 / GB-month → **$1.60 / month** |
| Public IPv4 address | 1 in-use address | $0.005 / hour → **$3.65 / month** |
| Security group, key pair | — | **$0.00** |

**Total ≈ $21.20 / month (≈ $0.029 / hour).** The host keeps billing until it is torn
down — do not forget step 14 of the teardown.

---

## 2. Resources created

Four resources are created, in `us-east-1`. Every one of them carries both tags **at
creation time**:

| Resource | Type / spec | Tags at creation |
|---|---|---|
| EC2 instance | `t3.small` (2 vCPU / 2048 MiB), Amazon Linux 2023 (x86_64), default VPC and default subnet, public IP assigned | `Project=trakk-test`, `Owner=gean.rios` |
| Security group | 1 new group in the default VPC | `Project=trakk-test`, `Owner=gean.rios` |
| EC2 key pair | 1 new key pair | `Project=trakk-test`, `Owner=gean.rios` |
| Root EBS volume | gp3, 20 GiB, encrypted, delete-on-termination, device `/dev/xvda` | `Project=trakk-test`, `Owner=gean.rios` |

The tags are not decoration: **only resources tagged `Project=trakk-test` may be read,
changed or deleted** by this account's credentials. Every `describe` in this runbook is
therefore tag-filtered, and the teardown verifies the tag before it deletes anything.

### Inbound rules

| Port | From | Purpose |
|---|---|---|
| TCP `22` | `<SANDBOX_PUBLIC_IP>/32` | SSH, from the machine that runs the AWS CLI only |
| TCP `80` | `<ALLOWED_CLIENT_CIDR>` | Backend API, from the allowed client only |
| TCP `3000` | `<ALLOWED_CLIENT_CIDR>` | Frontend, from the allowed client only |

No rule is open to the entire internet, and no egress rule is added — the default
allow-all egress of a new security group is left as it is.

> **Note — the three inbound rules are untagged.** Tagging a security-group *rule* at
> creation requires `ec2:CreateTags` on `security-group-rule/*`, which the credentials
> used for this deploy **do not** hold: the call fails with `UnauthorizedOperation`.
> Rule creation itself is permitted, so the rules below are created without
> `--tag-specifications`. The security group that owns them **is** tagged at creation, as
> are the instance, the volume and the key pair — the four resource types the project
> requires to be tagged. Do not read the untagged rules as a mistake: it is the only way
> this identity can create them.

---

## 3. Prerequisites

- **AWS CLI** configured for `us-east-1` with credentials that may create EC2 instances,
  security groups, security-group rules and key pairs, and tag those resources.
  Verify with `aws sts get-caller-identity`.
- **An SSH client** (`ssh` and `scp`), plus `openssl` for secret generation.
- **The repository checked out** on the machine that runs the AWS CLI, at the revision you
  intend to deploy.
- **A client machine** allowed to open ports 80 and 3000 — the value behind
  `<ALLOWED_CLIENT_CIDR>`.

Set the region and a few shell variables once, so the commands below can be pasted as-is:

```bash
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1

export SG_NAME="<prefix>-ec2-test"       # e.g. your project prefix + "-ec2-test"
export KEY_PAIR_NAME="<prefix>-ec2-test"
export KEYFILE="$HOME/.ssh/<prefix>-ec2-test.pem"
mkdir -p "$(dirname "$KEYFILE")"
```

---

## 4. Deploy steps

### Step 1 — resolve the VPC and subnet

The deploy uses the account's **default** VPC and its **default** subnet. The subnet must
have `MapPublicIpOnLaunch` enabled, otherwise the instance never gets a public IP.

```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

export SUBNET_ID=$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values="$VPC_ID" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)

aws ec2 describe-subnets --subnet-ids "$SUBNET_ID" \
  --query 'Subnets[0].{Subnet:SubnetId,AZ:AvailabilityZone,MapPublicIp:MapPublicIpOnLaunch}' --output json
```

### Step 2 — create the security group (tagged at creation)

```bash
aws ec2 create-security-group \
  --group-name "$SG_NAME" \
  --description "Trakk test deploy" \
  --vpc-id "$VPC_ID" \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]'
```

Record the returned `GroupId` as `export SG_ID=...`.

### Step 3 — add the three inbound rules

SSH is opened only to the machine running the AWS CLI; the app ports only to the allowed
client. Resolve the operator IP first:

```bash
export SANDBOX_PUBLIC_IP=$(curl -s https://checkip.amazonaws.com)
```

Then add the rules. **No `--tag-specifications` here** — see the note in section 2: this
identity is not allowed to tag security-group rules, and adding the flag makes the call
fail with `UnauthorizedOperation`.

```bash
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$SANDBOX_PUBLIC_IP/32"

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" --protocol tcp --port 80 --cidr "$ALLOWED_CLIENT_CIDR"

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" --protocol tcp --port 3000 --cidr "$ALLOWED_CLIENT_CIDR"
```

Confirm the result:

```bash
aws ec2 describe-security-groups --group-ids "$SG_ID" \
  --query 'SecurityGroups[0].IpPermissions[].{Port:FromPort,Cidr:IpRanges[].CidrIp}' --output json
```

### Step 4 — create the key pair and save the private key

`create-key-pair` returns the private key **inside the JSON on stdout**. Redirect it
straight to a file — never echo it, never paste it into a command that gets logged, and
never commit it.

```bash
aws ec2 create-key-pair \
  --key-name "$KEY_PAIR_NAME" \
  --tag-specifications 'ResourceType=key-pair,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]' \
  > "$KEYFILE"

chmod 600 "$KEYFILE"
```

The file stays on the operator's machine only.

### Step 5 — resolve the AMI and launch the instance

Resolve the AMI from the SSM public parameter rather than hard-coding an id, so the
runbook does not rot when Amazon Linux 2023 is rebuilt:

```bash
export AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text)
```

Launch with tags on the instance **and** on the root volume. The volume's tags must go
through `--tag-specifications ResourceType=volume` — the `BlockDeviceMappings`/`Ebs`
shorthand has no `Tags` key and the CLI rejects it.

```bash
aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t3.small \
  --key-name "$KEY_PAIR_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --associate-public-ip-address \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=20,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]' \
                     'ResourceType=volume,Tags=[{Key=Project,Value=trakk-test},{Key=Owner,Value=gean.rios}]'
```

Record the returned instance id as `export INSTANCE_ID=...`.

### Step 6 — wait for the instance and read its public IP

```bash
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

export INSTANCE_PUBLIC_IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo "Instance public IP: $INSTANCE_PUBLIC_IP"
```

Verify the tags actually landed, and record the root volume id:

```bash
aws ec2 describe-instances --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].{State:State.Name,Type:InstanceType,PublicIp:PublicIpAddress,Tags:Tags}' --output json

export VOLUME_ID=$(aws ec2 describe-volumes \
  --filters Name=tag:Project,Values=trakk-test \
  --query 'Volumes[0].VolumeId' --output text)

aws ec2 describe-volumes --filters Name=tag:Project,Values=trakk-test \
  --query 'Volumes[].{Id:VolumeId,Size:Size,Type:VolumeType,Tags:Tags}' --output json
```

### Step 7 — install Docker and the Compose plugin

**Amazon Linux 2023 has no official Docker CE yum repository** — `download.docker.com`
publishes no `amazonlinux` directory and `get.docker.com` has no `amazonlinux` case. The
working path is Docker's **static tarball**, which is distribution-independent, plus the
Compose (and buildx) plugin binaries.

> The `docker` RPM in AL2023's own repositories installs, but it pins **buildx 0.12.2**,
> and Compose v5.6.1 refuses to build with it (`compose build requires buildx 0.17.0 or
> later`). Either install the static tarball below, or install the RPM and then replace
> its buildx with a current plugin.

Run this on the instance:

```bash
ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" 'bash -s' <<'REMOTE'
set -euo pipefail

# Docker engine — static binaries
sudo curl -fsSL -o /tmp/docker.tgz https://download.docker.com/linux/static/stable/x86_64/docker-29.9.2.tgz
sudo tar -xzf /tmp/docker.tgz -C /usr/local/bin --strip-components=1

# Compose plugin (v2 CLI, invoked as `docker compose`) and a current buildx
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
  https://github.com/docker/compose/releases/download/v5.6.1/docker-compose-linux-x86_64
sudo curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-buildx \
  https://github.com/docker/buildx/releases/download/v0.38.1/buildx-v0.38.1.linux-amd64
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose \
               /usr/local/lib/docker/cli-plugins/docker-buildx

# The distro's docker.service still points at the packaged dockerd; point it at ours
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf >/dev/null <<'CONF'
[Service]
ExecStart=
ExecStart=/usr/local/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
CONF
sudo systemctl daemon-reload
sudo systemctl enable --now docker
sudo systemctl restart docker

docker --version
docker compose version
docker buildx version
REMOTE
```

`docker.service` must be `enabled` so the engine comes back after a reboot.

### Step 8 — copy the repository to the instance

The copy must include `backend/`, `frontend/`, `backend/prisma/` (schema **and**
migrations), the Dockerfiles and the manifests — the images run `npm install` during
the build. It must **not** include `node_modules`, `.git`, `.next` or any `.env`.

```bash
ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" 'mkdir -p ~/trakk'

tar -C /path/to/trakk -cf - \
  --exclude=node_modules --exclude=.git --exclude=.next --exclude=.env . \
  | ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" 'tar -C ~/trakk -xf -'
```

`scp -r` works too, but it copies `node_modules` and `.git` as well, which makes the
transfer much larger and slower.

### Step 9 — generate the host `.env`

Generate the file **on the instance**, so the secrets never transit the operator's
machine, the shell history, this repository, the card or a log. The values are produced
by `openssl rand -hex 32` on the host and are never printed.

```bash
ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" \
  "INSTANCE_PUBLIC_IP='$INSTANCE_PUBLIC_IP' bash -s" <<'REMOTE'
set -euo pipefail
cd ~/trakk
umask 077
{
  echo "POSTGRES_USER=trakk"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)"
  echo "POSTGRES_DB=trakk"
  echo 'DATABASE_URL=postgresql://trakk:${POSTGRES_PASSWORD}@db:5432/trakk'
  echo "JWT_SECRET=$(openssl rand -hex 32)"
  echo "JWT_EXPIRY=7d"
  echo "PORT=4000"
  echo "CORS_ORIGIN=http://${INSTANCE_PUBLIC_IP}:3000"
  echo "NODE_ENV=development"
  echo "NEXT_PUBLIC_API_URL=http://${INSTANCE_PUBLIC_IP}"
  echo "INTERNAL_API_URL=http://backend:4000/api/v1"
  echo "SESSION_COOKIE_DOMAIN="
  echo "S3_BUCKET="
  echo "S3_REGION=us-east-1"
  echo "S3_ACCESS_KEY_ID="
  echo "S3_SECRET_ACCESS_KEY="
  echo "S3_PUBLIC_URL="
  echo "AVATAR_UPLOAD_DIR="
} > .env
chmod 600 .env
REMOTE
```

`DATABASE_URL` keeps the literal `${POSTGRES_PASSWORD}` reference exactly as written —
Docker Compose interpolates it at parse time. The single quotes in the `echo` above are
what keep it from being expanded on the host.

### Step 10 — start the stack

```bash
ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/trakk
docker compose -f docker-compose.yml --env-file .env -p trakk-issue-tracker up -d --build
REMOTE
```

`--env-file .env` is **required**, not optional: the frontend service reads
`NEXT_PUBLIC_API_URL` and `INTERNAL_API_URL` through `${...}` substitution, which Compose
resolves from the env file at parse time.

The first build takes a few minutes (two `npm install` runs inside the images). The
stack's own dependency ordering handles the rest: `migrate` waits for `db` to be healthy
and runs `prisma migrate deploy`; `backend` waits for `migrate` to exit successfully;
`frontend` waits for `backend` to be healthy.

### Step 11 — wait for the stack to report healthy

```bash
ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/trakk
docker compose -f docker-compose.yml --env-file .env -p trakk-issue-tracker ps

until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost/api/v1/health)" = "200" ]; do
  sleep 2
done
echo "backend health endpoint is up"
REMOTE
```

Expected: `db`, `backend` and `frontend` are `Up ... (healthy)`, `migrate` is
`Exited (0)`.

> Use `localhost` (not the public IP) for the check **on the host**: the instance cannot
> hairpin its own public IP, so a request to `<INSTANCE_PUBLIC_IP>` from the instance
> itself never reaches its own containers.

---

## 5. The `.env` variables, and what each one is for

The full list of variables is documented in `.env.example`; this is what the EC2 deploy
sets and why.

| Variable | Value on this deploy | Why |
|---|---|---|
| `POSTGRES_USER` | `trakk` | The database role the `db` container creates. |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Random per deploy, generated on the host, never printed. |
| `POSTGRES_DB` | `trakk` | The database name. |
| `DATABASE_URL` | `postgresql://trakk:${POSTGRES_PASSWORD}@db:5432/trakk` | The literal `${POSTGRES_PASSWORD}` reference is kept as written — Compose interpolates it at parse time. `db` is the Compose service name, resolved by Docker's internal DNS. |
| `JWT_SECRET` | `openssl rand -hex 32` | 64 hex characters; the backend enforces a 32-character minimum. Signs the session JWT. Generated on the host so it never leaves it. |
| `JWT_EXPIRY` | `7d` | Session lifetime, matching the cookie's `Max-Age`. |
| `PORT` | `4000` | The backend's port *inside* the container. The compose file publishes it on host port `80`. |
| `CORS_ORIGIN` | `http://<INSTANCE_PUBLIC_IP>:3000` | The exact origin the browser loads the app from. The backend's `cors({ origin: config.CORS_ORIGIN, credentials: true })` must match it, otherwise the browser blocks the register and login calls from the `:3000` page. It is the **frontend's** origin — not the backend's — and it includes the port. |
| `NODE_ENV` | `development` | Required, not cosmetic — see below. |
| `NEXT_PUBLIC_API_URL` | `http://<INSTANCE_PUBLIC_IP>` | The **bare origin**: no `:80`, no `/api/v1` suffix. The frontend appends `/api/v1/...` itself. This is the public URL the browser's client components call. |
| `INTERNAL_API_URL` | `http://backend:4000/api/v1` | Unchanged from local. The Next.js server components resolve the backend by Compose service name, over the internal Docker network. |
| `SESSION_COOKIE_DOMAIN` | *(empty)* | The frontend and the backend are the same host on different ports, and cookies are **not** port-scoped — a host-only cookie set on the backend's port is still sent to the frontend's port. Widening the domain would send the session cookie to every subdomain of that domain, which is neither needed nor wanted. Leave it empty. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | *(blank)* | No object storage on this deploy. Leaving `S3_BUCKET` blank makes the backend store avatars on the local disk volume instead. |
| `S3_REGION` | `us-east-1` | Only meaningful once `S3_BUCKET` is set. |
| `AVATAR_UPLOAD_DIR` | *(blank)* | Defaults to the backend's local `uploads/avatars` path. |

### Why `NODE_ENV=development` is required

Two independent reasons, both of which break plain-HTTP login:

1. **The images are development images.** `frontend/Dockerfile` runs `next dev`, and
   `next dev` returns HTTP 500 when `NODE_ENV=production`. This deploy uses the
   repository's existing `docker-compose.yml`, which builds those dev images with
   hot-reload source mounts.
2. **The session cookie's `Secure` flag is derived from `NODE_ENV`.** The backend sets
   `secure: config.NODE_ENV === 'production'` on the `trakk_session` cookie. Over plain
   HTTP a `Secure` cookie is never sent back by the browser, so every request after
   login would be unauthenticated and the dashboard would bounce to `/login`.

Setting `NODE_ENV=production` would therefore break the app twice over.

### A note on the `Secure` flag

The deployed cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` and **not**
`Secure`. That is correct for this deploy: the app is served over plain HTTP, and a
`Secure` cookie would never be transmitted back.

---

## 6. Verification

Run these from the allowed client. Replace `<INSTANCE_PUBLIC_IP>` with the value from
step 6.

### 6.1 Backend health on port 80

```bash
curl -s -w '\n%{http_code}\n' http://<INSTANCE_PUBLIC_IP>/api/v1/health
```

Expected: HTTP `200` and a body containing `"status":"ok","db":"ok"`. This endpoint
performs a live `SELECT 1` against PostgreSQL, so a `200` proves the database, the
migrations and the API are all real — not merely that a process is listening.

### 6.2 Frontend on port 3000

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://<INSTANCE_PUBLIC_IP>:3000/login
```

Expected: HTTP `200`. A status code only proves the markup shipped — **open the page in
a real browser** to confirm it renders: the `TRAKK` wordmark and both an email and a
password input must be present, and the browser console must show no uncaught
exceptions.

### 6.3 CORS from the frontend origin

```bash
curl -s -i -X OPTIONS http://<INSTANCE_PUBLIC_IP>/api/v1/auth/login \
  -H 'Origin: http://<INSTANCE_PUBLIC_IP>:3000' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

Expected: HTTP `204`, with `Access-Control-Allow-Origin: http://<INSTANCE_PUBLIC_IP>:3000`
and `Access-Control-Allow-Credentials: true`. A wrong `CORS_ORIGIN` in the host `.env` is
the most likely cause of a browser-side failure, so check it explicitly.

### 6.4 Register and log in

Through the UI, at `http://<INSTANCE_PUBLIC_IP>:3000/register`:

1. Fill in the name, email and password fields and submit. Expect to land on
   `/dashboard`, with the sidebar and the "Welcome to Trakk" heading rendered.
2. Inspect the `trakk_session` cookie in the browser's developer tools. It must be
   `HttpOnly`, `SameSite=Lax` and **not** `Secure`.
3. Clear the cookies, go back to `http://<INSTANCE_PUBLIC_IP>:3000/login`, log in with
   the same credentials, and confirm you land on `/dashboard` again.

The dashboard is a Server Component gated on the session cookie, so a rendered dashboard
proves the whole cookie round-trip works — not merely that the API accepted a password.

---

## 7. Teardown — the exact commands

**Tag context.** These credentials may only touch resources tagged `Project=trakk-test`.
Every step below is that kind of resource, and the volume is tag-checked explicitly
before it is deleted. Do not run any of these against an untagged resource, and do not
touch the default VPC's pre-existing security groups, subnets or route tables.

Run the steps in this order. Each one depends on the previous: the security group cannot
be deleted while the instance still references it, and the host must stop its stack
before the instance goes away.

### 7.1 Stop the stack on the host (and remove the volumes)

```bash
ssh -i "$KEYFILE" ec2-user@"$INSTANCE_PUBLIC_IP" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/trakk
docker compose -f docker-compose.yml --env-file .env -p trakk-issue-tracker down -v
REMOTE
```

`-v` removes the `db-data` and `upload-storage` volumes as well — the database and any
uploaded avatars are gone for good.

### 7.2 Terminate the instance

```bash
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID"
aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID"
```

The root volume was created with `DeleteOnTermination=true`, so it is normally removed
with the instance.

### 7.3 Delete the security group

Only after the instance is terminated — AWS refuses to delete a group that is still
attached to an instance.

```bash
aws ec2 delete-security-group --group-id "$SG_ID"
```

### 7.4 Delete the key pair

> **This step cannot be run with the credentials used for this deploy.** The
> `ec2:DeleteKeyPair` action is denied for this identity, and the call fails with
> `UnauthorizedOperation`. The key pair **must be deleted in the AWS console**
> (EC2 → Key pairs → select it → Delete), or by an identity that holds the
> `ec2:DeleteKeyPair` permission.
>
> Every other teardown command above runs fine as-is; this is the only blocked one.

Once you have an identity that holds the permission, the command is:

```bash
aws ec2 delete-key-pair --key-name "$KEY_PAIR_NAME"
```

### 7.5 Delete the root volume, if it survived

Usually unnecessary — `DeleteOnTermination=true` removes it with the instance. If a
volume is still there, confirm its tag **first**, and delete only what carries
`Project=trakk-test`:

```bash
aws ec2 describe-volumes --filters Name=tag:Project,Values=trakk-test \
  --query 'Volumes[].{Id:VolumeId,Size:Size,Type:VolumeType,Tags:Tags}' --output json

aws ec2 delete-volume --volume-id "$VOLUME_ID"
```

### 7.6 Delete the local private key

```bash
rm -f "$KEYFILE"
```

### Teardown checklist

- [ ] Stack stopped on the host, volumes removed (`down -v`)
- [ ] Instance terminated (`instance-terminated` waiter returned)
- [ ] Security group deleted
- [ ] Key pair deleted **in the AWS console** — `ec2:DeleteKeyPair` is denied for this identity
- [ ] Root volume deleted if it survived, after confirming its `Project=trakk-test` tag
- [ ] Local private key file removed

Once the instance is terminated, the ≈ $21.20 / month stops accruing.
