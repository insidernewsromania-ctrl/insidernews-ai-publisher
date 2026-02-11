# Deploy pas cu pas pe Windows Server 2019 (fara dependenta de GitHub scheduler)

Acest ghid te ajuta sa rulezi publisher-ul direct pe serverul tau Windows, la fiecare 15 minute.
Recomandarea este sa folosesti **Task Scheduler** + scriptul PowerShell din `scripts/windows/run-publisher.ps1`.

---

## 0) Ce obtii la final

- ruleaza automat la fiecare 15 minute
- respecta ferestra de publicare din aplicatie (08:00-22:00 Europe/Bucharest)
- nu pornesc 2 instante simultan (lock)
- loguri locale in `logs\`

---

## 1) Instaleaza ce ai nevoie

Pe server instaleaza:

1. **Node.js 18 LTS**
   - descarca installerul MSI de pe site-ul oficial Node.js
2. **Git for Windows**
   - descarca installerul de pe site-ul oficial Git

Dupa instalare, deschide PowerShell si verifica:

```powershell
node -v
npm -v
git --version
```

---

## 2) Seteaza ora serverului pe Romania + sincronizare timp

Seteaza timezone:

```powershell
tzutil /s "GTB Standard Time"
```

Sincronizare NTP:

```powershell
w32tm /config /manualpeerlist:"ro.pool.ntp.org,0x8 time.google.com,0x8" /syncfromflags:manual /update
net stop w32time
net start w32time
w32tm /resync
w32tm /query /status
```

---

## 3) Cloneaza proiectul

```powershell
New-Item -ItemType Directory -Path "C:\Apps" -Force | Out-Null
Set-Location "C:\Apps"
git clone https://github.com/insidernewsromania-ctrl/insidernews-ai-publisher.git
Set-Location "C:\Apps\insidernews-ai-publisher"
git checkout main
npm install
```

---

## 4) Configureaza variabilele de mediu pentru publisher

1. Creeaza folderul config:

```powershell
New-Item -ItemType Directory -Path "C:\Apps\insidernews-ai-publisher\config" -Force | Out-Null
```

2. Copiaza template-ul:

```powershell
Copy-Item "C:\Apps\insidernews-ai-publisher\scripts\windows\publisher.env.ps1.example" `
          "C:\Apps\insidernews-ai-publisher\config\publisher.env.ps1" -Force
```

3. Editeaza fisierul:

```powershell
notepad "C:\Apps\insidernews-ai-publisher\config\publisher.env.ps1"
```

Completeaza obligatoriu:
- `OPENAI_API_KEY`
- `WP_URL`
- `WP_USER`
- `WP_APP_PASSWORD`
- `WP_DEFAULT_FEATURED_MEDIA_ID`
- `WP_AUTHOR_ID`:
  - pune `0` daca nu esti sigur
  - foloseste un ID real doar daca userul WP are drept sa publice ca acel autor

---

## 5) Test manual (obligatoriu inainte de scheduling)

Ruleaza o executie manuala:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Apps\insidernews-ai-publisher\scripts\windows\run-publisher.ps1" -ProjectRoot "C:\Apps\insidernews-ai-publisher"
```

Verifica logul:

```powershell
Get-ChildItem "C:\Apps\insidernews-ai-publisher\logs" | Sort-Object LastWriteTime -Descending | Select-Object -First 3
```

---

## 6) Creeaza task-ul care ruleaza la 15 minute

### Varianta rapida (linie comanda)

```powershell
schtasks /Create /F /TN "InsiderNews Publisher" `
  /SC MINUTE /MO 15 /ST 00:00 `
  /RU "SYSTEM" `
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"C:\Apps\insidernews-ai-publisher\scripts\windows\run-publisher.ps1\" -ProjectRoot \"C:\Apps\insidernews-ai-publisher\""
```

Ruleaza imediat pentru test:

```powershell
schtasks /Run /TN "InsiderNews Publisher"
```

Verifica status:

```powershell
schtasks /Query /TN "InsiderNews Publisher" /V /FO LIST
```

### Varianta GUI (Task Scheduler)

1. Task Scheduler -> Create Task
2. General:
   - Name: `InsiderNews Publisher`
   - Run whether user is logged on or not
   - Run with highest privileges
3. Triggers:
   - New -> Daily -> Start 00:00
   - Repeat task every: 15 minutes
   - For a duration of: Indefinitely
4. Actions:
   - Program/script: `powershell.exe`
   - Add arguments:
     `-NoProfile -ExecutionPolicy Bypass -File "C:\Apps\insidernews-ai-publisher\scripts\windows\run-publisher.ps1" -ProjectRoot "C:\Apps\insidernews-ai-publisher"`
5. Conditions:
   - debifeaza "Start the task only if the computer is on AC power" (daca apare)
6. Settings:
   - Allow task to be run on demand
   - If the task is already running: **Do not start a new instance**

---

## 7) Dezactiveaza schedulerul GitHub (ca sa nu ruleze dublu)

In GitHub Actions:
- dezactiveaza workflow-ul `InsiderNews Scheduler`
- optional dezactiveaza si `InsiderNews AI Publisher` daca vrei 100% local

Astfel serverul tau devine sursa unica de rulare.

---

## 8) Update cod (cand apar fixuri)

```powershell
Set-Location "C:\Apps\insidernews-ai-publisher"
git fetch origin main
git pull origin main
npm install
schtasks /Run /TN "InsiderNews Publisher"
```

Varianta mai simpla (1 comanda):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Apps\insidernews-ai-publisher\scripts\windows\update-app.ps1" -ProjectRoot "C:\Apps\insidernews-ai-publisher" -RunAfterUpdate
```

---

## 9) Troubleshooting rapid

### Task ruleaza, dar nu publica
- verifica ultimul log din `logs\`
- daca vezi `Outside publish window ...`, inseamna ca task-ul e ok, dar e in afara ferestrei 08:00-22:00

### Eroare `Publish failed: Request failed with status code 403`
Cel mai des inseamna **permisiuni WordPress**:

1. In `config\publisher.env.ps1`, seteaza temporar:
   - `$env:WP_AUTHOR_ID = "0"`
2. Ruleaza din nou manual scriptul.
3. Daca merge, problema era `WP_AUTHOR_ID` (autor diferit fata de user fara permisiuni).

Testeaza autentificarea API:

```powershell
$pair = "$env:WP_USER:$env:WP_APP_PASSWORD"
$token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
Invoke-RestMethod -Uri "$env:WP_URL/wp-json/wp/v2/users/me?context=edit" -Headers @{ Authorization = "Basic $token" }
```

Testeaza creare post draft:

```powershell
$body = @{ title = "API test"; content = "<p>ok</p>"; status = "draft" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$env:WP_URL/wp-json/wp/v2/posts" -Headers @{ Authorization = "Basic $token" } -ContentType "application/json" -Body $body
```

Daca si testul draft da 403:
- userul WP nu are drept `publish_posts` / `edit_posts` pentru post type
- sau un plugin de securitate/WAF blocheaza IP-ul serverului tau (whitelist pentru `/wp-json/wp/v2/*`)

### "node is not recognized"
- reinstaleaza Node.js sau foloseste calea completa in script (ex: `C:\Program Files\nodejs\node.exe`)

### Nu vrei suprapunere de procese
- scriptul are deja lock global (`Global\InsiderNewsPublisherLock`)

### Eroare PowerShell `Copy-Item ... PathNotFound`
- inseamna ca fisierul template nu exista local (de obicei repo neactualizat)
- ruleaza:

```powershell
Set-Location "C:\Apps\insidernews-ai-publisher"
git pull origin main
```

- apoi repeta copierea:

```powershell
Copy-Item "C:\Apps\insidernews-ai-publisher\scripts\windows\publisher.env.ps1.example" `
          "C:\Apps\insidernews-ai-publisher\config\publisher.env.ps1" -Force
```

