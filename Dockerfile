# Il server non ha dipendenze da installare: niente npm install, niente
# fase di compilazione. Si copia il progetto e si avvia. Per questo
# l'immagine è di poche decine di megabyte e si ricostruisce in secondi.
FROM node:22-slim

# Non gira da amministratore: se qualcosa andasse storto, chi entra si
# ritrova con i permessi di un utente qualunque. L'immagine di Node ha
# già un utente "node" pronto.
WORKDIR /app
COPY --chown=node:node . .
USER node

# La porta la decide l'host tramite la variabile PORT; 8080 è solo il
# valore di ripiego se non la passa nessuno.
ENV PORT=8080
EXPOSE 8080

# Node riceve direttamente il segnale di spegnimento (niente shell in
# mezzo), così il server fa in tempo a chiudere le domande appese invece
# di lasciarle a mezz'aria durante un aggiornamento.
CMD ["node", "server/server.js"]
