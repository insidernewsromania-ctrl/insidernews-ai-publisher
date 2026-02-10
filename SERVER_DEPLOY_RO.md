# Deploy pe server propriu (VPS) pentru publicare la 15 minute

Acest ghid muta rularea din GitHub Actions pe un server propriu, pentru a evita problemele de scheduler.

## 1) Unde poti rula aplicatia

Recomandat:
- VPS Linux (Ubuntu 22.04/24.04) + `systemd timer` (stabil).

Alternative:
- VPS + `cron` (mai simplu, dar mai putin robust la recovery).
- Self-hosted GitHub runner (tot depinzi de Actions, dar ruleaza la tine).

## 2) Pregatire server

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates
```

Instaleaza Node.js (exemplu cu nvm, versiunea 18):

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
node -v
npm -v
```

## 3) Deploy cod

```bash
cd /opt
sudo git clone https://github.com/insidernewsromania-ctrl/insidernews-ai-publisher.git
sudo chown -R $USER:$USER /opt/insidernews-ai-publisher
cd /opt/insidernews-ai-publisher
git checkout main
npm install
```

## 4) Configurare environment

Creeaza fisierul:

`/opt/insidernews-ai-publisher/.env`

Exemplu minim:

```bash
OPENAI_API_KEY=...
WP_URL=https://insidernews.ro
WP_USER=...
WP_APP_PASSWORD=...
WP_DEFAULT_FEATURED_MEDIA_ID=1234
WP_AUTHOR_ID=12

POSTS_PER_RUN=1
PUBLISH_WINDOW_ENABLED=true
PUBLISH_WINDOW_START_HOUR=8
PUBLISH_WINDOW_END_HOUR=22
PUBLISH_WINDOW_TIMEZONE=Europe/Bucharest
SAME_DAY_ONLY=true
STRICT_RECENT=true
ALLOW_FALLBACK=false

SOURCE_ATTRIBUTION_ENABLED=true
SOURCE_ATTRIBUTION_REQUIRE_LINK=true
EDITORIAL_NOTE_ENABLED=true
EDITORIAL_AUTHOR_NAME=Redactia Insider News
EDITORIAL_AUTHOR_PROFILE_URL=https://insidernews.ro/autor/redactia-insider-news
EDITORIAL_POLICY_URL=https://insidernews.ro/politica-editoriala
RIGHT_OF_REPLY_URL=https://insidernews.ro/drept-la-replica
CORRECTIONS_EMAIL=redactie@insidernews.ro
BLOCK_TABLOID_TITLES=true
```

## 5) Service + Timer (`systemd`)

### `/etc/systemd/system/insidernews-publisher.service`

```ini
[Unit]
Description=InsiderNews AI Publisher (oneshot)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/insidernews-ai-publisher
EnvironmentFile=/opt/insidernews-ai-publisher/.env
ExecStart=/usr/bin/env bash -lc 'source /home/ubuntu/.nvm/nvm.sh && nvm use 18 >/dev/null && flock -n /tmp/insidernews-publisher.lock node src/index.js'
Nice=10
```

> Important: daca userul de sistem nu este `ubuntu`, modifica `User`, `Group` si calea catre `nvm.sh`.

### `/etc/systemd/system/insidernews-publisher.timer`

```ini
[Unit]
Description=Run InsiderNews publisher every 15 minutes

[Timer]
OnCalendar=*:0/15
Persistent=true
Unit=insidernews-publisher.service

[Install]
WantedBy=timers.target
```

Activeaza timerul:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now insidernews-publisher.timer
sudo systemctl status insidernews-publisher.timer
```

## 6) Comenzi utile

Ruleaza manual o data:

```bash
sudo systemctl start insidernews-publisher.service
```

Vezi logurile:

```bash
journalctl -u insidernews-publisher.service -n 200 --no-pager
journalctl -u insidernews-publisher.service -f
```

Vezi programarile timerului:

```bash
systemctl list-timers --all | rg insidernews
```

## 7) Update aplicatie

```bash
cd /opt/insidernews-ai-publisher
git fetch origin main
git pull origin main
npm install
sudo systemctl restart insidernews-publisher.timer
```

## 8) Recomandare operationala

- Pastreaza workflow-ul GitHub doar ca backup manual (`workflow_dispatch`).
- Rularea principala sa fie pe VPS cu `systemd timer`.
- Activeaza monitorizare simpla (ex. alerta daca nu exista niciun `DONE – published` in ultimele 2 ore).

