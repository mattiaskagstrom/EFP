# Featurelista

**Status:** Arbetsunderlag  
**Senast uppdaterad:** 2026-09-21

Den här listan beskriver funktioner som är synliga för administratörer och användare. Tekniska krav, drift, API:er och interna implementationer ingår inte. En markerad ruta betyder att funktionen finns i den nuvarande MVP:n; en omarkerad ruta betyder att den är planerad eller ännu inte verifierad som färdig.

## Webbsida – administrationsgränssnitt

### Sökinsatser

- [x] Visa lista över sökinsatser.
- [x] Skapa en ny sökinsats från listvyn.
- [x] Välja en sökinsats innan karta och insatsdata visas.
- [x] Byta sökinsats och återgå till listan.
- [ ] Redigera sökinsatsens namn, beskrivning och tidsperiod.
- [ ] Ändra sökinsatsens status mellan planerad, aktiv, pausad, avslutad och arkiverad.
- [ ] Arkivera sökinsatser.

### Karta och kartunderlag

- [x] Visa sökinsatsens zoner och importerade spår på karta.
- [x] Välja karttyp, exempelvis standardkarta, topografisk karta eller satellit.
- [x] Anpassa kartans vy efter insatsens zoner.
- [x] Visa Sverige eller webbläsarens position när sökinsatsen saknar zoner.
- [ ] Förhandsvisa och hantera lokalt tillhandahållna kartbilder.
- [ ] Förbereda eller välja kartunderlag för användning utan internet.

### Zonredigering

- [x] Rita polygoner.
- [x] Rita fyrkanter.
- [x] Rita cirklar.
- [x] Spara ritade cirklar som zoner genom att konvertera dem till slutna polygoner.
- [x] Rita sträckor och andra linjeobjekt på kartan.
- [x] Lägga ut text på kartan.
- [x] Välja färg för nya ritobjekt.
- [x] Välja linjetyp, exempelvis heldragen, sträckad eller punktad.
- [x] Se vilket ritverktyg som är aktivt genom markerad knapp och muspekare.
- [x] Avsluta aktivt verktyg och återgå till vanlig panorering.
- [x] Ångra och göra om ändringar med knappar samt Ctrl+Z/Ctrl+Y.
- [x] Flytta ritade objekt.
- [x] Redigera zonens geometri genom att först välja zonen.
- [x] Ta bort ritade objekt.
- [x] Förenkla polygoner genom att minska antalet punkter.
- [x] Dela en zon med en linje.
- [x] Visa en nyritad zon direkt i zonlistan innan den sparas.
- [x] Spara alla lokala kartändringar med “Spara ändringar”.
- [x] Kasta lokala kartändringar med “Släng ändringar” och hämta insatsens sparade zoner igen.
- [ ] Kopiera zoner.
- [ ] Slå ihop zoner.

### Zonlista och zoninställningar

- [x] Visa alla zoner i en lista till vänster om kartan.
- [x] Kollapsa och expandera zonlistan.
- [x] Söka efter zoner via zonnamn.
- [x] Välja en zon i listan och markera den på kartan.
- [x] Panorera kartan till zonen när den väljs i listan.
- [x] Välja en zon i kartan och expandera motsvarande inställningar i listan.
- [x] Scrolla listan till zonen när den väljs på kartan.
- [x] Visa eller dölja en zon i kartan.
- [x] Ange eller ändra zonens namn.
- [x] Markera om zonen är sökt och ange när den söktes.
- [x] Uppdatera zonens poäng.
- [x] Visa eller dölja zonens namn på kartan.
- [x] Visa eller dölja zonens storlek i km² på kartan.
- [x] Radera en zon med bekräftelse.
- [ ] Ändra sökmetod, prioritet, instruktion och tilldelad patrull/grupp i zonens inställningar.
- [ ] Visa sökt och återstående yta för insatsen.

### Import och export

- [x] Importera flera spår från GPX.
- [x] Visa importerade spår i en lista.
- [x] Visa eller dölja enskilda importerade spår.
- [x] Importera zoner från GPX.
- [x] Göra GPX-importerade zoner redigerbara.
- [ ] Visa importhistorik med filnamn, tidpunkt och resultat.
- [ ] Förhandsgranska import innan den sparas.
- [ ] Hantera dubbletter och partiellt felaktiga importer med tydlig återkoppling.
- [x] Exportera spår som GPX.
- [x] Exportera spår som Garmin GPX (samma spårformat, med separat tydlig användarlänk).
- [x] Exportera zoner som GPX.
- [x] Exportera zoner som Garmin-anpassad GPX där varje polygon representeras som en sluten track.
- [x] Exportera zoner som GeoJSON.
- [x] Exportera spår som GeoJSON.
- [ ] Välja ett urval av spår, zoner eller tidsintervall inför export.

### Insatsanslutning och uppföljning

- [ ] Skapa QR-kod för att ansluta mobilanvändare till en sökinsats.
- [ ] Skapa, återkalla och förnya kort anslutningskod.
- [ ] Se anslutna och aktiva deltagare.
- [ ] Se senaste synkronisering för deltagare och spår.
- [ ] Se alla inskickade spår, punkter och observationer.
- [ ] Filtrera underlag på zon, tid, patrull, användare och status.
- [ ] Redigera eller komplettera metadata för inskickat underlag.
- [ ] Visa ändringshistorik för administratören.

### Framtida planeringsstöd

- [ ] Registrera PLS, LKP och IPP på karta och i insatsen.
- [ ] Registrera POA, POD och andra sökförutsättningar.
- [ ] Dokumentera och välja patrullsök, skallgångssök och ledstångssök.
- [ ] Automatiskt föreslå zonindelning utifrån MSO-profilering.
- [ ] Granska, flytta, dela, slå ihop och ta bort föreslagna zoner innan publicering.
- [ ] Spara vilken profil och vilka indata som låg till grund för förslaget.

## Mobilapp – användare i sökinsats

### Anslutning och insatsinformation

- [ ] Ansluta till en sökinsats genom att skanna en QR-kod.
- [ ] Ansluta genom att skriva in en kort anslutningskod.
- [ ] Ange anropsnamn vid anslutning.
- [ ] Se aktuell sökinsats, instruktioner och tilldelad zon.
- [ ] Se zoner, zonstatus och zoninstruktioner på karta.
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
- [ ] Importera och exportera punkter i GPX-format.

### Synkronisering och gemensam lägesbild

- [ ] Synkronisera spår och punkter manuellt som standard.
- [ ] Visa om data väntar på synkronisering, synkroniseras, är synkad eller har synkroniseringsfel.
- [ ] Återuppta en avbruten synkronisering.
- [ ] Hämta nya zoner och gemensamt underlag från servern.
- [ ] Se andra deltagares spår, punkter och zoner enligt insatsens behörigheter.
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

## Gemensamma framtida funktioner

- [ ] Skicka meddelanden till deltagare eller grupper.
- [ ] Skicka pushmeddelanden.
- [ ] Använda SOS- eller nödläge.
- [ ] Få varning vid geofence eller annan definierad händelse.
- [ ] Generera insatsrapporter.
- [ ] Exportera närvarolista och arbetstid.

## Statusprincip

En funktion markeras som färdig först när den är användbar i gränssnittet och har verifierats i den miljö där den ska användas. Funktioner som endast finns i krav, API eller intern kod lämnas omarkerade tills användarflödet är färdigt.
