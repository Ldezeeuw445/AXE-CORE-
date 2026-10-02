# Een nieuwe server, veilig open

Geschreven 2 oktober 2026, toen de tweede Strato erbij kwam en dit hele verhaal
in een chatgesprek stond in plaats van in de repo. De volgende server hoeft dat
gesprek niet nog een keer.

## De volgorde die je niet moet omdraaien

1. Server aanmaken met een **sterk wachtwoord** (24+ tekens uit je
   wachtwoordmanager) en, als het kan, meteen een publieke sleutel.
2. Controleren dat je er met de sleutel in komt — in een **tweede** venster,
   terwijl de eerste nog openstaat.
3. **Pas dan** wachtwoord-login uitzetten.

Draai je 2 en 3 om, dan sluit je jezelf buiten en moet je via de
rescue-console van de provider terug. Dat kan, maar het kost een avond.

## De sleutel maken (op de Mac)

```bash
ssh-keygen -t ed25519 -C "luka@axe-ollama" -f ~/.ssh/axe_vps
```

Vul een passphrase in. Je krijgt twee bestanden:

| bestand | wat het is | waar het mag komen |
|---|---|---|
| `~/.ssh/axe_vps` | de **privé**sleutel | nergens. Blijft op deze Mac. |
| `~/.ssh/axe_vps.pub` | de **publieke** | overal: formulieren, servers, GitHub |

De privésleutel gaat niet in een formulier, niet in Notities, niet in een chat
— ook niet in een gesprek met AXE of met mij. Wie hem heeft is jou.

Op het klembord:

```bash
cat ~/.ssh/axe_vps.pub | pbcopy
```

Het is **één regel**, van `ssh-ed25519 AAAAC3...` tot en met het label achteraan.
Dat label is alleen een naam; het doet niets voor de beveiliging.

### Geen Mac bij de hand

- Heb je er ooit één aan GitHub toegevoegd? Dan staat de publieke helft op
  `https://github.com/<gebruikersnaam>.keys`. Die mag je gewoon plakken — de
  privéhelft staat dan op de machine waar je hem maakte.
- Anders: Termius op de iPhone (gratis) → Keychain → + → Generate key → ED25519
  → "Copy public key". De privéhelft blijft dan in die app op je telefoon, dus
  je komt er vanaf de Mac nog niet mee op. Laat wachtwoord-login aan tot je de
  Mac-sleutel erbij hebt gezet.
- Of helemaal geen sleutel: alleen een wachtwoord is genoeg om te beginnen. Je
  zet de sleutel er later bij zonder de server opnieuw aan te maken.

## De sleutel erbij zetten

```bash
ssh-copy-id -i ~/.ssh/axe_vps.pub root@<ip>
```

Een server mag meerdere sleutels hebben: je telefoon ernaast laten staan is
prima, en vaak handig.

Daarna in `~/.ssh/config`, zodat je het pad niet elke keer typt:

```
Host axe-ollama
  HostName <ip>
  User root
  IdentityFile ~/.ssh/axe_vps
  IdentitiesOnly yes
```

En één keer, zodat de passphrase in je sleutelhanger zit:

```bash
ssh-add --apple-use-keychain ~/.ssh/axe_vps
```

Inloggen is dan `ssh axe-ollama`.

## Het wachtwoord dichtgooien

Eerst controleren dat `ssh axe-ollama` werkt in een tweede venster. Dan pas:

```bash
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

En controleren dat het ook echt zo staat:

```bash
sshd -T | grep -i passwordauthentication    # verwacht: passwordauthentication no
```

## Waarom dit hier staat

Op 13 september stond de terminal van AXE CORE als Docker-container op publieke
poort 4022 en accepteerde hij elk token. Niet omdat iemand dat zo bedacht had,
maar omdat de stap "en nu dichtzetten" nergens opgeschreven stond en dus
overgeslagen werd. Een server die open staat is bijna nooit een beslissing; het
is een stap die niemand op papier had.

Zie ook `infra/vps-bootstrap.sh` (het slot vóór Ollama, en de allowlist van de
terminalserver) en `docs/TERMINALS.md` (welke machine welk vak is).
