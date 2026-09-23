# Autentisering och behörighet

## Roller

EFP har tre roller:

- **Superadmin**: driftansvarig med åtkomst till alla insatser, administratörskonton och användarsessioner. Kontot skapas via bootstrap-konfiguration.
- **Admin**: registrerar sig med användarnamn och lösenord, skapar insatser och kan dela en insats med andra registrerade Admin-konton.
- **Användare**: registrerar inget konto. Användaren ansluter till en insats med QR-kod eller åttateckens insatskod och anger ett anropsnamn.

Admin-sessioner använder säkra HttpOnly-cookies. Användarsessioner är serverutfärdade bearer-token och sparas lokalt per insats under `efp.userConnection:{investigationId}` tillsammans med anropsnamnet. Rå kod och token lagras inte i domänmodellen.

## Publika och privata insatser

Publika planerade och aktiva insatser listas i användarläget och kräver fortfarande anropsnamn. Privata insatser listas inte och kräver kod eller QR-länk. Koder är åtta alfanumeriska tecken, skiftlägesokänsliga och lagras endast hashade. Kodrotation gör tidigare användarsessioner ogiltiga.

## API

Adminflödet finns under `/api/v1/auth/admin` och användaranslutning under `/api/v1/auth/user`. Alla dataskrivande adminendpoints kräver Admin eller Superadmin. En användarsession får endast läsa och ladda upp data för den insats som sessionen avser.

## GDPR

Användarläget samlar inte in riktiga namn, e-post eller telefonnummer. Anropsnamn är ändå insatsrelaterade uppgifter och kan bli personuppgift om de kan kopplas till en person. Se [GDPR och dataminimering](gdpr-och-dataminimering.md).

