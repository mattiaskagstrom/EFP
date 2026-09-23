# Featurelista

**Status:** Arbetsunderlag  
**Senast uppdaterad:** 2026-09-23

Den här listan beskriver funktioner som är synliga för administratörer och användare. Tekniska krav, drift, API:er och interna implementationer ingår inte. En markerad ruta betyder att funktionen finns i den nuvarande MVP:n; en omarkerad ruta betyder att den är planerad eller ännu inte verifierad som färdig.

## Gemensam webbstart och roller

- [x] Välja mellan administratörsläge och användarläge när webbappen öppnas.
- [x] Navigera direkt till adminlistan via en URL.
- [x] Navigera direkt till användarlistan via en URL.
- [x] Direktöppna en sökinsats via en URL.
- [x] Uppdatera URL:en när användaren navigerar mellan lägen och sökinsatser.
- [x] Användarläget visar endast planerade och aktiva sökinsatser.
- [x] Användarläget saknar funktioner för att skapa, redigera eller arkivera sökinsatser.
- [x] Ansluta användarläget med QR-kod eller insatskod.
- [x] Spara användarens anslutning lokalt per insats tillsammans med anropsnamn.
- [x] Kräva anropsnamn innan användaren kan ladda upp data.
- [x] Stödja publika och privata insatser.
- [x] Ogiltigförklara äldre användarsessioner när insatskoden roteras.

## Webbsida – administrationsgränssnitt

### Sökinsatser

- [x] Visa lista över sökinsatser.
- [x] Skapa en ny sökinsats från listvyn.
- [x] Välja en sökinsats innan karta och insatsdata visas.
- [x] Byta sökinsats och återgå till listan.
- [x] Redigera sökinsatsens namn, beskrivning och tidsperiod.
- [x] Ändra sökinsatsens status mellan planerad, aktiv, pausad, avslutad och arkiverad.
- [x] Arkivera sökinsatser.
- [x] Registrera och logga in Admin med användarnamn och lösenord.
- [x] Logga ut Admin och visa aktuell inloggad Admin.
- [x] Ändra insatsens synlighet mellan publik och privat.
- [x] Skapa och rotera insatskod.
- [x] Dela insatsadministration med andra registrerade Admin-konton.
- [ ] Visa QR-kod som bild och ladda ner den.

### Superadmin

- [x] Bootstrapa ett Superadmin-konto.
- [x] Se alla insatser oavsett ägare.
- [x] Lista och återkalla användarsessioner via API.
- [x] Lista och aktivera/inaktivera Admin-konton via API.
- [x] Administrera Admin-konton i Superadmin-vy.
- [x] Visa Superadmin-systemöversikt med Admin-konton, statistik och systemparametrar.
- [x] Aktivera och inaktivera Admin-konton från systemöversikten.
- [x] Lista och återkalla aktiva användarsessioner från systemöversikten.

### Karta och kartunderlag

- [x] Visa sökinsatsens sektorer och importerade spår på karta.
- [x] Välja karttyp, exempelvis standardkarta, topografisk karta eller satellit.
- [x] Anpassa kartans vy efter insatsens sektorer.
- [x] Visa Sverige eller webbläsarens position när sökinsatsen saknar sektorer.
- [x] Ladda upp egna georefererade PNG- eller JPEG-kartor per sökinsats.
- [x] Ange kartbildens geografiska gränser vid uppladdning.
- [x] Visa, dölja och radera egna kartlager.
- [ ] Förhandsvisa och hantera lokalt tillhandahållna kartbilder i användarläget.
- [ ] Förbereda eller välja kartunderlag för användning utan internet.

### Sektorredigering

- [x] Rita polygoner.
- [x] Rita fyrkanter.
- [x] Rita cirklar.
- [x] Spara ritade cirklar som sektorer genom att konvertera dem till slutna polygoner.
- [x] Rita sträckor och andra linjeobjekt på kartan.
- [x] Lägga ut text på kartan.
- [x] Välja färg för nya ritobjekt.
- [x] Välja linjetyp, exempelvis heldragen, sträckad eller punktad.
- [x] Se vilket ritverktyg som är aktivt genom markerad knapp och muspekare.
- [x] Avsluta aktivt verktyg och återgå till vanlig panorering.
- [x] Ångra och göra om ändringar med knappar samt Ctrl+Z/Ctrl+Y.
- [x] Flytta ritade objekt.
- [x] Redigera sektorns geometri genom att först välja sektorn.
- [x] Ta bort ritade objekt.
- [x] Förenkla polygoner genom att minska antalet punkter.
- [x] Dela en sektor med en linje.
- [x] Visa en nyritad sektor direkt i sektorlistan innan den sparas.
- [x] Spara alla lokala kartändringar med “Spara ändringar”.
- [x] Kasta lokala kartändringar med “Släng ändringar” och hämta insatsens sparade sektorer igen.
- [ ] Kopiera sektorer.
- [x] Slå ihop två angränsande sektorer längs deras gemensamma kant.

### Sektorlista och sektorinställningar

- [x] Visa alla sektorer i en lista till vänster om kartan.
- [x] Kollapsa och expandera sektorlistan.
- [x] Söka efter sektorer via sektornamn.
- [x] Välja en sektor i listan och markera den på kartan.
- [x] Panorera kartan till sektorn när den väljs i listan.
- [x] Välja en sektor i kartan och expandera motsvarande inställningar i listan.
- [x] Scrolla listan till sektorn när den väljs på kartan.
- [x] Visa eller dölja en sektor i kartan.
- [x] Ange eller ändra sektorns namn.
- [x] Markera om sektorn är sökt och ange när den söktes.
- [x] Uppdatera sektorns poäng.
- [x] Visa eller dölja sektorns namn på kartan.
- [x] Visa eller dölja sektorns storlek i km² på kartan.
- [x] Radera en sektor med bekräftelse.
- [ ] Ändra sökmetod, prioritet, instruktion och tilldelad patrull/grupp i sektorns inställningar.
- [ ] Visa sökt och återstående yta för insatsen.

### Fynd

- [ ] Visa en hopfällbar fyndsektion i adminläget.
- [ ] Visa fyndets bild, position, tidpunkt och vem som skickade in det.
- [ ] Visa fynd på karta och i en lista kopplad till den valda sökinsatsen.
- [ ] Hämta fynd genom att välja sektorer på samma sätt som vid hämtning av spår i användarläget.

### Import och export

- [x] Importera flera spår från GPX.
- [x] Visa importerade spår i en lista.
- [x] Visa eller dölja enskilda importerade spår.
- [x] Importera sektorer från GPX.
- [x] Göra GPX-importerade sektorer redigerbara.
- [ ] Visa importhistorik med filnamn, tidpunkt och resultat.
- [ ] Förhandsgranska import innan den sparas.
- [ ] Hantera dubbletter och partiellt felaktiga importer med tydlig återkoppling.
- [x] Exportera spår som GPX.
- [x] Exportera spår som Garmin GPX (samma spårformat, med separat tydlig användarlänk).
- [x] Exportera sektorer som GPX.
- [x] Exportera sektorer som Garmin-anpassad GPX där varje polygon representeras som en sluten track.
- [x] Exportera sektorer som GeoJSON.
- [x] Exportera spår som GeoJSON.
- [x] Välja ett urval av spår och sektorer samt ett tidsintervall inför export.

### Insatsanslutning och uppföljning

- [ ] Skapa QR-kod för att ansluta mobilanvändare till en sökinsats.
- [ ] Skapa, återkalla och förnya kort anslutningskod.
- [ ] Se anslutna och aktiva deltagare.
- [ ] Se senaste synkronisering för deltagare och spår.
- [ ] Se alla inskickade spår, punkter och observationer.
- [ ] Filtrera underlag på sektor, tid, patrull, användare och status.
- [ ] Redigera eller komplettera metadata för inskickat underlag.
- [ ] Visa ändringshistorik för administratören.

### Framtida planeringsstöd

- [x] Registrera PLS, LKP och IPP på karta och i insatsen.
- [x] Registrera POA, POD och andra sökförutsättningar.
- [ ] Dokumentera och välja patrullsök, skallgångssök och ledstångssök.
- [ ] Automatiskt föreslå sektorindelning utifrån MSO-profilering.
- [ ] Granska, flytta, dela, slå ihop och ta bort föreslagna sektorer innan publicering.
- [ ] Spara vilken profil och vilka indata som låg till grund för förslaget.

## Mobilapp – användare i sökinsats

### Anslutning och insatsinformation

- [ ] Ansluta till en sökinsats genom att skanna en QR-kod.
- [ ] Ansluta genom att skriva in en kort anslutningskod.
- [ ] Ange anropsnamn vid anslutning.
- [ ] Se aktuell sökinsats, instruktioner och tilldelad sektor.
- [ ] Se sektorer, sektorstatus och sektorinstruktioner på karta.
- [ ] Växla mellan tillgängliga karttyper.

### Spårning

- [ ] Starta GPS-spårning.
- [ ] Pausa GPS-spårning.
- [ ] Stoppa och spara GPS-spårning.
- [ ] Se aktuell position under pågående sök.
- [ ] Se inspelad sträcka och sökt tid.
- [ ] Fortsätta spela in när appen ligger i bakgrunden eller telefonen är låst.
- [ ] Fortsätta spela in utan nätanslutning.
- [ ] Se GPS-noggrannhet och få återkoppling när GPS-signalen är svag.
- [ ] Lägga metadata på spår, exempelvis POD, patrullnamn och anropsnamn.
- [ ] Spara spår lokalt tills de kan synkroniseras.

### Punkter, fynd och observationer

- [ ] Placera en punkt vid aktuell GPS-position.
- [ ] Placera en punkt genom att välja plats på kartan.
- [ ] Ange punktens kategori, exempelvis fynd, observation, person, föremål, spår, fordon eller risk/hinder.
- [ ] Ange rubrik och beskrivning för punkten.
- [ ] Ange tidpunkt, prioritet och status.
- [ ] Koppla anropsnamn och sökinsats till punkten.
- [ ] Bifoga fotografi till en punkt.
- [ ] Skicka in ett fynd från användarläget med bild, position, tidpunkt och insändarens anropsnamn.
- [ ] Visa tydlig status när ett fynd skickas in eller när uppladdningen misslyckas.
- [ ] Importera och exportera punkter i GPX-format.

### Synkronisering och gemensam lägesbild

- [ ] Synkronisera spår och punkter manuellt som standard.
- [ ] Visa om data väntar på synkronisering, synkroniseras, är synkad eller har synkroniseringsfel.
- [ ] Återuppta en avbruten synkronisering.
- [ ] Hämta nya sektorer och gemensamt underlag från servern.
- [ ] Se andra deltagares spår, punkter och sektorer enligt insatsens behörigheter.
- [ ] Aktivera automatisk synkronisering som alternativ.
- [ ] Begränsa automatisk synkronisering till exempelvis Wi-Fi eller laddning.
- [ ] Arbeta med kartor utan internet genom förladdat kartunderlag.

### Framtida tids- och personalfunktioner

- [ ] Stämpla in.
- [ ] Stämpla ut.
- [ ] Se egen arbetstid.
- [ ] Se vilka personer som är aktiva i insatsen.
- [ ] Se och hantera tilldelade arbetspass.
- [ ] Rapportera byte, frånvaro eller annan ändring i schemat.

## Mobil webb/PWA – användare med extern GPS

Den mobila webbdelen är ett enklare komplement för användare som spelar in spår i andra GPS-appar eller GPS-enheter. Den spelar inte själv in GPS-spår i första versionen.

### Anslutning och insatsinformation

- [x] Öppna den mobilanpassade webbappen.
- [ ] Installera webbappen som PWA på mobilens hemskärm.
- [ ] Ansluta till en sökinsats genom att skanna en QR-kod.
- [ ] Ansluta genom att skriva in en kort anslutningskod.
- [ ] Ange anropsnamn vid anslutning.
- [x] Välja sökinsats efter anslutning.
- [x] Se aktuell sökinsats och dess sektorer.
- [ ] Endast se tilldelade eller publicerade sektorer samt egna uppladdningar.

### Sektorer och filutbyte

- [x] Välja en eller flera sektorer med kryssrutor.
- [x] Välja alla eller inga sektorer.
- [x] Ladda ner valda sektorer från sökinsatsen.
- [x] Välja bland samma exportformat som admin-gränssnittet stödjer.
- [x] Se sektorernas namn och status.
- [ ] Välja sektorer för att hämta spår från sökinsatsen.
- [ ] Hämta alla spår som intersectar med valda sektorer, inklusive hela spåret även när det sträcker sig utanför sektorerna.
- [ ] Välja exportformat för de hämtade spåren.
- [ ] Välja sektorer för att hämta fynd från sökinsatsen på samma sätt som spår.
- [ ] Välja exportformat eller visningsformat för hämtade fynd.

### Uppladdning av externa spår

- [x] Välja en eller flera spårfiler från en extern GPS-app eller GPS-enhet.
- [x] Ange metadata för uppladdningen, exempelvis POD, patrull/grupp, anropsnamn, sektor och anteckning.
- [x] Validera spårfiler innan uppladdning.
- [x] Visa tydlig status för lyckade och misslyckade uppladdningar.
- [x] Kunna försöka ladda upp en misslyckad fil igen.
- [x] Visa historik över egna uppladdningar.
- [x] Behålla originalspårets geometri efter uppladdning.

### Avgränsning i första versionen

- [x] Inte spela in GPS-spår i webbläsaren.
- [ ] Inte kräva fullständigt användarkonto.
- [ ] Inte ge åtkomst till andra deltagares spår.
- [ ] Börja med onlinebaserat filutbyte.
- [ ] Förbereda för framtida PWA-cache och köade uppladdningar utan uppkoppling.

## Gemensamma framtida funktioner

- [ ] Skicka meddelanden till deltagare eller grupper.
- [ ] Skicka pushmeddelanden.
- [ ] Använda SOS- eller nödläge.
- [ ] Få varning vid geofence eller annan definierad händelse.
- [ ] Generera insatsrapporter.
- [ ] Exportera närvarolista och arbetstid.

## Statusprincip

En funktion markeras som färdig först när den är användbar i gränssnittet och har verifierats i den miljö där den ska användas. Funktioner som endast finns i krav, API eller intern kod lämnas omarkerade tills användarflödet är färdigt.
