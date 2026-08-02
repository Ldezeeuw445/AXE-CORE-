# AXE Core VPS Preview + Tauri setup

Deze setup is nodig om Design Mode en de Code Editor preview echt te laten werken in de Tauri app.

## 1. Repo en branch

Op de VPS moet `/opt/axe-core-api` op branch `orchestrator` staan.

```sh
cd /opt/axe-core-api
git fetch origin
git checkout orchestrator
git pull origin orchestrator
bash AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/axe_api/deploy.sh
```

## 2. Vereiste `.env`

Bestand: `/opt/axe-core-api/.env`

Minimaal aanvullend nodig voor preview/design mode:

```env
WORKSPACE_DIR=/opt/axe-workspace
PREVIEW_PORT=4700
PREVIEW_PUBLIC_URL=https://api.axecompanion.com/preview/
```

Belangrijk:
- `PREVIEW_PUBLIC_URL` moet eindigen op `/`
- zonder `PREVIEW_PUBLIC_URL` geeft `/preview/status` wel een poort maar `url: null`
- `WORKSPACE_DIR` moet een map zijn waar echte app-projecten staan die `npm run dev` kunnen draaien

## 3. Workspace

```sh
sudo mkdir -p /opt/axe-workspace
```

Zet hier de app in die je vanuit AXE wilt previewen, bijvoorbeeld:

```sh
cd /opt/axe-workspace
git clone <jouw-app-repo> my-app
cd my-app
npm install
```

De preview-start endpoint draait standaard:

```sh
npm run dev -- --host 0.0.0.0 --port 4700
```

Dus `package.json` moet dat ondersteunen.

## 4. Nginx

De repo-config `backend/axe_api/nginx_api.conf` moet live staan als:

- `= /preview/start` -> `http://127.0.0.1:8001`
- `= /preview/stop` -> `http://127.0.0.1:8001`
- `= /preview/status` -> `http://127.0.0.1:8001`
- `/preview/` -> `http://127.0.0.1:4700/`
- voor `/preview/` moet `Host 127.0.0.1` gezet worden
- `/preview/` mag **geen** `X-Frame-Options: DENY` meekrijgen

Na deploy:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

## 5. Services

API service:

```sh
sudo systemctl restart axe-core-api
sudo systemctl status axe-core-api --no-pager
```

Terminal service:

```sh
sudo systemctl restart axe-terminal
sudo systemctl status axe-terminal --no-pager
```

## 6. Checks

### API health

```sh
curl -s https://api.axecompanion.com/health
```

### Preview status

```sh
curl -s \
  -H "Authorization: Bearer <AXE_API_KEY>" \
  https://api.axecompanion.com/preview/status
```

Verwacht minimaal:

```json
{
  "configured": true,
  "url": "https://api.axecompanion.com/preview/"
}
```

### Preview starten

```sh
curl -s -X POST \
  -H "Authorization: Bearer <AXE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://api.axecompanion.com/preview/start
```

Daarna moet `/preview/status` `running: true` tonen.

## 7. Files move endpoint

Deze repo bevat nu ook:

- `POST /files/move`

Payload:

```json
{
  "from_path": "old/path.txt",
  "to_path": "new/path.txt"
}
```

Test:

```sh
curl -s -X POST \
  -H "Authorization: Bearer <AXE_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"from_path":"old/path.txt","to_path":"new/path.txt"}' \
  https://api.axecompanion.com/files/move
```

## 8. Design Mode checklist

Design Mode werkt pas echt als alles hieronder klopt:

- `PREVIEW_PUBLIC_URL=https://api.axecompanion.com/preview/`
- nginx proxy voor `/preview/` staat live
- `/preview/status` geeft `configured: true`
- preview start daadwerkelijk een dev server op `:4700`
- iframe in de app laadt vanaf `https://api.axecompanion.com/preview/`
- geen cross-origin fout meer in Design Mode
- `Preview -> Code Agent` koppeling is aanwezig in `CodeEditorPage.tsx`

## 9. Bekende valkuil

Als je preview-server start vanuit `/opt/axe-workspace`, maar daar staat geen app met geldige `package.json`, dan start preview niet. In dat geval:

- zet de echte frontend in `WORKSPACE_DIR`, of
- laat de client een expliciet startcommando meegeven voor de juiste submap.
