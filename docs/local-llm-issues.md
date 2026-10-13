# Lokal LLM: issue till draft PR

Workflow: `.github/workflows/local-llm-issue.yml`.

Issues som repoägaren skapar startar automatiskt. För andra författare krävs
etiketten `ai-approved`, tillagd av någon med write/maintain/admin-rättighet.
Etiketten måste fortfarande finnas när jobbet startar. En befintlig PR på
`codex/llm-issue-N` förhindrar en ny körning. Jobb för samma issue serialiseras.

## Anslutning

Använder Open WebUI på `https://llm.omny.se/api/chat/completions`. Aktivera
API-nycklar i Open WebUI och lägg en nyckel som repository Actions-secret
`LLM_API_KEY`. Nyckeln ska aldrig skrivas i kod, issues eller loggar.
Valfri repository variable `LLM_MODEL` ersätter standardmodellen `qwen3:8b`.
Tillåt GitHub Actions att skapa pull requests i repository-inställningarna.
Kör workflow manuellt för ett autentiserat inferensprov utan issue/PR-ändring.

## Flöde och begränsningar

1. Verifierar författare/etikett, behörighet och tidigare PR.
2. Installerar projektets beroenden och kontrollerar att baseline-tester är gröna.
3. Modellen väljer högst sex relevanta filer och skriver en förfiningskommentar.
   Originalet bevaras; oklara krav stoppar kodningen.
4. Skriver regression/acceptanstest först. En bugg kräver ett rött test innan
   implementation. Kompilatorfel accepteras inte som bugg-reproduktion.
5. Skriver en begränsad implementation utan att få ändra regressionstesterna.
6. Kör backend unit/contract tests samt frontend build/unit tests.
7. Skapar en draft PR med issue-länk endast när testerna är gröna.

Agenten är avsiktligt begränsad: ingen godtycklig kommandokörning från modell-
output, inga borttagningar, ingen ändring av workflows, paketmanifest,
API-kontraktssnapshots, hemligheter eller driftskript. Endast utvalda textfiler
under src/tests/docs. Uppgifter som kräver sådana ändringar behöver mänsklig
hantering. Inget auto-merge eller deploy. E2E och manuell granskning återstår.
Körningen misslyckas tydligt vid saknad nyckel, för stor kontext, ogiltig JSON
eller testfel; den gör inte upprepade obegränsade försök.

Modellanrop ber om 16384 tokens kontext och högst 6000 output-tokens; faktisk
kapacitet beror på backend och modell. Högst 45000 tecken källkod väljs.
Stora uppgifter måste delas upp; 8B-modellens kodkvalitet måste granskas.

Körningen använder GitHub-hostad tillfällig Ubuntu-runner. Den lokala modellen
anropas via HTTPS. GitHub-/LLM-nycklar injiceras endast i de steg som behöver
dem; test/build-steget har inga sådana nycklar. PR-publicering sker på en
ny runner med ny checkout efter godkända tester. Agenten kopieras utanför
modellens skrivbara arbetskatalog. Det finns inga Proxmox-behörigheter.

Återställning: avaktivera workflow i Actions eller ta bort den nya workflowfilen.
Modell och Proxmox ändras inte av detta workflow.
