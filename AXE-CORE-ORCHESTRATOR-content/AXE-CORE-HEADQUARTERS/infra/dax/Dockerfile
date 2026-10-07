# axe-dax-base — één gedeeld image voor alle DAX-computers.
#
# Per computer verschilt alleen de container en zijn vier volumes
# (workspace, browser-profile, artifacts, home); het image wordt gedeeld, dus
# vijf DAX'en kosten één keer schijfruimte voor Chromium, Node en de CLI's.
#
#   docker build -t axe-dax-base:latest infra/dax
#
# Playwright-image: Chromium + Python + alle systeembibliotheken al aanwezig.
FROM mcr.microsoft.com/playwright/python:v1.55.0-noble

ARG INSTALL_CODE_CLIS=1
ENV DEBIAN_FRONTEND=noninteractive \
    DAX_BROWSER_PROFILE=/dax/browser-profile \
    DAX_DOWNLOADS=/dax/artifacts/downloads \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl jq ca-certificates gnupg ripgrep \
      build-essential openssh-client unzip tini \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

# Abonnement-CLI's (Claude Code, Codex). Inloggen gebeurt ÉÉN keer per DAX in
# de container; de login staat in het home-volume en overleeft herstarts.
# Geen API-sleutels in het image: abonnement gaat voor betaald-per-token.
RUN if [ "$INSTALL_CODE_CLIS" = "1" ]; then \
      npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force; \
    fi

RUN pip install --no-cache-dir --break-system-packages playwright==1.55.0 \
 && useradd -m -d /home/dax -s /bin/bash dax \
 && mkdir -p /dax/workspace /dax/browser-profile /dax/artifacts \
 && chown -R dax:dax /dax /home/dax

COPY dax-browser.py /usr/local/bin/dax-browser
COPY dax-init.sh /usr/local/bin/dax-init
RUN chmod +x /usr/local/bin/dax-browser /usr/local/bin/dax-init

USER dax
WORKDIR /dax/workspace
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/dax-init"]
