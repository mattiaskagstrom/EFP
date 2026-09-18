# MVP och öppna beslut

## 1. Förslag på första MVP

En första version bör fokusera på ett komplett men avgränsat arbetsflöde:

1. Administratören skapar en sökinsats i webbgränssnittet.
2. Administratören skapar zoner på karta.
3. Systemet skapar QR-kod och kort anslutningskod.
4. Deltagaren ansluter via mobilappen.
5. Appen visar karta och zoner.
6. Användaren spelar in GPS-spår offline.
7. Användaren lägger till punkter med metadata.
8. Användaren synkroniserar manuellt.
9. Administratören ser spår och punkter på karta.
10. Systemet importerar och exporterar GPX.

## 2. Funktioner efter MVP

- automatisk synkronisering
- offlinekartor
- avancerad behörighetsmodell
- foton på punkter
- zon- och patrulltilldelning
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
6. Ska zoner tilldelas individer, patruller eller båda?
7. Ska anslutningskoder vara tidsbegränsade?
8. Vilket kompletterande format ska användas om GPX inte räcker för zonpolygoner?
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
