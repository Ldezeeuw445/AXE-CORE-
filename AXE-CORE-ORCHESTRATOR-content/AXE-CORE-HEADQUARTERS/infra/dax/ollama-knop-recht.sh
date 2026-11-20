#!/bin/bash
# Eén keer als root op de Strato-box (217.160.135.111) draaien.
#
# Geeft AXE (de VPS) het recht om Ollama te herstarten en zijn status te
# lezen -- en verder NIETS (Luka 20 nov: "Give AXE that right"). Ollama draait
# hier direct op de server, niet in Docker, dus de bestaande DAX-sleutel (alleen
# `docker system dial-stdio`) kon er niet bij.
#
# Hoe smal:
#  - een eigen sleutel (axe-ollama-knop), alleen op de VPS;
#  - die sleutel draait altijd /usr/local/bin/axe-ollama-knop, wat je ook vraagt;
#  - dat script kent twee woorden: `status` en `restart`;
#  - sudo mag voor axe-dax precies één regel: systemctl restart ollama.
set -euo pipefail

PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMHRPVyrE372ZoY1HdHiR4JpSGrG9Q9e4Fc5mZCtmKVZ axe-ollama-knop'
GEBRUIKER=axe-dax
SC=$(command -v systemctl)

[ "$(id -u)" -eq 0 ] || { echo "Draai dit als root (sudo bash $0)"; exit 1; }
id "$GEBRUIKER" >/dev/null 2>&1 || { echo "Gebruiker $GEBRUIKER bestaat niet"; exit 1; }
"$SC" cat ollama >/dev/null 2>&1 || { echo "Geen systemd-dienst 'ollama' gevonden"; exit 1; }

cat > /usr/local/bin/axe-ollama-knop <<EOF
#!/bin/sh
# Wat de sleutel axe-ollama-knop mag (zie ollama-knop-recht.sh in AXE CORE).
case "\$SSH_ORIGINAL_COMMAND" in
  status)  echo "actief=\$($SC is-active ollama)"; echo "sinds=\$($SC show -p ActiveEnterTimestamp --value ollama)" ;;
  restart) sudo -n $SC restart ollama && sleep 3 && echo "actief=\$($SC is-active ollama)" ;;
  *)       echo "niet toegestaan: alleen status of restart"; exit 1 ;;
esac
EOF
chmod 755 /usr/local/bin/axe-ollama-knop
chown root:root /usr/local/bin/axe-ollama-knop

echo "$GEBRUIKER ALL=(root) NOPASSWD: $SC restart ollama" > /etc/sudoers.d/axe-ollama-knop
chmod 440 /etc/sudoers.d/axe-ollama-knop
visudo -cf /etc/sudoers.d/axe-ollama-knop >/dev/null

AK=/home/$GEBRUIKER/.ssh/authorized_keys
REGEL="command=\"/usr/local/bin/axe-ollama-knop\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $PUBKEY"
grep -qF "$PUBKEY" "$AK" || echo "$REGEL" >> "$AK"
chown "$GEBRUIKER:$GEBRUIKER" "$AK"; chmod 600 "$AK"

echo "Klaar: AXE mag nu alleen 'status' en 'restart' van Ollama."
