# MVP och öppna beslut

## 1. Förslag på första MVP

En första version bör fokusera på ett komplett men avgränsat arbetsflöde:

1. Administratören skapar en sökinsats i webbgränssnittet.
2. Administratören skapar sektorer på karta.
3. Systemet skapar QR-kod och kort anslutningskod.
4. Deltagaren ansluter via mobil webb/PWA eller native mobilapp.
5. Den mobila webbdelen visar och låter deltagaren ladda ner behöriga sektorer.
6. Deltagaren kan ladda upp spår från en extern GPS-app eller GPS-enhet med metadata.
7. Native-appen kan spela in GPS-spår och lägga till punkter offline.
8. Deltagaren synkroniserar eller laddar upp data manuellt.
9. Administratören ser spår och punkter på karta.
10. Systemet importerar och exporterar GPX samt övriga stödda format.

Den mobila webb/PWA-delen är ett separat, enklare arbetsflöde för användare som redan använder annan GPS-utrustning. GPS-inspelning i webbläsaren ingår inte i första versionen.

## 2. Funktioner efter MVP

- automatisk synkronisering
- offlinekartor
- avancerad behörighetsmodell
- foton på punkter
- sektor- och patrulltilldelning
- närvaro och in-/utstämpling
- schemaläggning
- pushmeddelanden
- automatiska rapporter

## 3. Öppna beslut

Följande frågor behöver beslutas innan detaljdesign och utveckling:

1. Ska alla deltagare se alla inskickade spår, eller endast egna eller patrullens spår?
2. Ska punkter och spår bli synliga direkt, eller först efter administrativ granskning?
3. Ska användaren behöva ange namn, eller räcker anropsnamn/patrullnamn?
4. Hur länge ska sökinsatser och personuppgifter sparas?
5. Vilka kartkällor får och ska användas?
6. Ska sektorer tilldelas individer, patruller eller båda?
7. Ska anslutningskoder vara tidsbegränsade?
8. Vilket kompletterande format ska användas om GPX inte räcker för sektorpolygoner?
9. Ska bilder ingå i första versionen?
10. Ska systemet kunna användas helt utan konto, med sökinsatsens kod som enda anslutning?
11. Vilka regler ska gälla för konfliktlösning vid samtidiga ändringar?
12. Vilken driftmiljö och säkerhetsnivå krävs för servern?

## 4. Kriterier för en första pilot

En pilot kan anses lyckad när en grupp kan:

- skapa en sökinsats
- ansluta flera telefoner
- genomföra ett sökpass med dålig eller saknad täckning
- spela in spår och markera punkter
- synkronisera data efteråt
- se resultatet samlat på karta
- exportera underlaget för vidare användning
