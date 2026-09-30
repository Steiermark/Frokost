# SUF Fredagsfrokost

Webapp til computer og mobil. Medarbejdere skriver navn og telefonnummer og vælger en ret eller **Jeg kommer ikke** for en af de fire kommende fredage. Begge svar gemmes centralt og kan ændres frem til onsdag kl. 12, Europe/Copenhagen.

## Adgang og administrator

Siden genbruger Sites' ChatGPT-login. Identitet læses kun på serveren fra dispatcherens autentificerede headers; et stabilt platform-id knyttes til kontoen. Administratoren defineres i `ADMIN_EMAILS`, aktuelt `mjo@din-energi.dk`. Andre konti kan kun ændre eget svar. Telefonnummer vises hverken på deltagerlisten eller i dens API-svar.

Administrator kan oprette og redigere retter, se antal pr. ret og se gemte fravalg. En ret med tilmeldinger kan ikke fjernes. Serveren håndhæver roller og frist.

Sidens eksisterende adgangspolitik er bevaret. Ved kontrollen var kun ejeren inviteret. Administratoren og medarbejderne skal have adgang via Sites og logge ind med de relevante ChatGPT-konti, før fælles drift er mulig. At konfigurere administratorens e-mail giver ikke i sig selv adgang gennem Sites.

Det tidligere e-mail-login og eksisterende sessions bevares som kompatibilitet. Mailtjenesten er ikke aktiveret; almindelig brug via ChatGPT-login kræver den ikke.

## Påmindelser

SMS er udskudt efter brugerens ønske. Der er heller ingen e-mailpåmindelser i brugerfladen. Den tidligere reminder-rute returnerer HTTP 410 uden at sende beskeder. Ingen tidsplan er oprettet eller aktiveret.

## Lokal udvikling

- Start: `node scripts/run-framework.mjs dev`
- Typekontrol: `node node_modules/typescript/bin/tsc --noEmit`
- Tests (Node 24): `node --test tests/lunch.test.mjs`
- Byg: `node scripts/run-framework.mjs build`

Testene bruger en isoleret SQLite-database i hukommelsen med projektets migrationer og de faktiske rutehandlers. De dækker frist i sommer/vintertid, telefonvalidering, ejerskab/adgang, tilmelding/fravalg, gentagne svar, menuvalidering, privat telefonnummer og deaktiverede påmindelser. De foretager ingen netværkskald.

D1-schema ligger i `db/schema.ts`; migrationsfiler i `drizzle/`. Sites anvender produktionsmigrationerne ved udgivelse. Lokal database, `.env` og øvrige hemmeligheder må ikke publiceres.
