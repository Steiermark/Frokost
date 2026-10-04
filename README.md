# SUF Fredagsfrokost

Webapp til computer og mobil. Medarbejdere skriver navn og vælger en ret eller **Jeg kommer ikke** for en af de fire kommende fredage. Begge svar gemmes centralt og kan ændres frem til onsdag kl. 12, Europe/Copenhagen.

## Adgang og administrator

Alle logger ind med e-mail og adgangskode. Rollen i databasen afgør adgang: administratorer kan administrere retter og åbne `/adgange`, hvor der er separate lister over administratorer og brugere. Kun administratorer kan oprette nye konti og sætte adgangskoder på eksisterende konti uden kode. Gamle sessions og platformheaders giver ikke længere login.

Adgangskoder gemmes som bcrypt-hash. Nye adgangskoder via brugerfladen kræver mindst 6 tegn og højst 72 UTF-8-bytes. Login er begrænset ved gentagne forsøg. Sessions udløber efter 8 timer. Telefonnumre indsamles ikke; migration 0009 fjerner tidligere numre.

Glemt adgangskode bruger et engangslink, der udløber efter 30 minutter. En nulstilling ophæver eksisterende sessions. Mail kræver `RESEND_API_KEY`, `MAIL_FROM` og `APP_URL` (appens rigtige adresse). Uden mailopsætning vises en forklaring; der sendes ingen mail. Første administrator oprettes direkte i den relevante database; der findes ingen offentlig administratoroprettelse.

Den lokale installation og Sites-produktion har separate databaser. Lokal administratoroprettelse opretter ikke en konto i produktion. Sites' ydre adgangspolitik gælder fortsat ved publicering.

## Menuer og påmindelser

En ny menu gemmes som kladde. Administratoren kan se og redigere kladden under **Administrer retter** og frigiver den med knappen **Frigiv menu og send notifikation**. Medarbejderne ser først retterne efter frigivelsen. Frigivelsen sender én appnotifikation pr. tilmeldt enhed; gentagne tryk sender ikke samme besked igen.

Påmindelser er valgt som standard på login-siden. Ved login beder browseren om tilladelse, og enheden tilmeldes automatisk, når tilladelsen gives. Valget kan slås fra før login eller senere i appens indstillinger. iPhone kræver tilføjelse til hjemmeskærm og iOS 16.4+. Manifest og service worker ligger i public; der caches ikke kontodata. Aktive konti med en push-tilmelding og uden svar (hverken madvalg eller afbud) får én påmindelse pr. enhed/fredag onsdag kl. 09 Europe/Copenhagen. Databasekrav forhindrer dubletter. Fejl logges som failed og sendes ikke automatisk igen for at undgå dobbelte beskeder ved usikker levering; 404/410 fjerner udløbne abonnementer. Push udløber senest kl. 12. Levering afhænger af enhedens tilladelser og forbindelse.

Runtime kræver VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (hemmelig), VAPID_SUBJECT og REMINDER_SERVICE_TOKEN_HASH (hemmelig SHA-256). Den sidste er hash af Sites-servicecredentialen til denne Site. Serverens /api/push-reminders kræver den oprindelige credential i X-SUF-Schedule-Token; Sites kræver også OAI-Sites-Authorization: Bearer <credential>. Credentials må aldrig skrives i dokumentation eller tidsplan. Ved rotation skal hashen opdateres før næste kørsel.

Tidsplanen skal hver onsdag kl. 09 dansk tid hente denne Site med get_site, kontrollere projekt-ID og aktiv status, bruge den returnerede servicecredential til POST /api/push-reminders og kontrollere resultatet. ?check=1 verificerer opsætning uden at sende beskeder. Endepunktet sender kun onsdag mellem kl. 09 og 10 dansk tid og kan gentages sikkert. SMS-ruten /api/reminders er fortsat deaktiveret.

Valgfri INITIAL_ADMIN_EMAIL og INITIAL_ADMIN_PASSWORD_HASH kan klargøre den første administrator ved login, kun hvis kontoen ikke har en kode. Fjern disse runtime-værdier efter første verificerede login.

## Lokal udvikling

- Start: `node scripts/run-framework.mjs dev`
- Typekontrol: `node node_modules/typescript/bin/tsc --noEmit`
- Tests (Node 24): `node --test tests/lunch.test.mjs`
- Byg: `node scripts/run-framework.mjs build`

Testene bruger en isoleret SQLite-database i hukommelsen med projektets migrationer og de faktiske rutehandlers. De dækker frist i sommer/vintertid, ejerskab/adgang, tilmelding/fravalg, gentagne svar, menuvalidering, adgangskoder og push-påmindelser. De foretager ingen netværkskald.

D1-schema ligger i `db/schema.ts`; migrationsfiler i `drizzle/`. Sites anvender produktionsmigrationerne ved udgivelse. Lokal database, `.env` og øvrige hemmeligheder må ikke publiceres.


