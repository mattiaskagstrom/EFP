# Kravspecifikation – EFP sökapplikation

**Version:** 0.1  
**Status:** Utkast  
**Omfattning:** Patrullsök, skallgångssök och ledstångssök

## 1. Syfte

Applikationen ska stödja planering, genomförande och uppföljning av sökinsatser genom att låta användare registrera GPS-spår, markera fynd och andra händelser, arbeta offline och dela information med övriga deltagare via en server.

Systemet ska bestå av:

1. Mobilapplikation för Android och iOS.
2. Mobilanpassad webbdel/PWA för användare med externa GPS-appar eller GPS-enheter.
3. Webbaserat administrationsgränssnitt.
4. Backend/server för lagring och synkronisering.

Applikationen ska kunna stödja flera sökmetoder, däribland patrullsök, skallgångssök och ledstångssök. Begrepp och förkortningar för MSO dokumenteras i [Sökmetoder och MSO-begrepp](sokmetoder-och-mso.md).

## 1.1 Webbroller och URL-navigering

När webbappen öppnas ska användaren först kunna välja administratörsläge eller användarläge.

Administratörsläget ska använda URL-sökvägarna `/admin` och `/admin/investigations/{id}`. Användarläget ska använda `/user` och `/user/investigations/{id}`.

URL:en ska uppdateras när användaren väljer läge eller sökinsats. Direktlänkar ska öppna motsvarande läge och sökinsats. Webbläsarens bakåt- och framåtknappar ska fungera.

Användarläget ska initialt visa alla sökinsatser med status planerad eller aktiv. Det får inte visa funktioner för att skapa, redigera eller arkivera sökinsatser. När QR- eller kodautentisering införs ska användarläget begränsas till den insats som användaren är ansluten till.

Direktlänkar får inte kringgå framtida autentisering. Saknade, avslutade, arkiverade eller otillåtna insatser ska ge ett tydligt fel utan att öppna redigeringsvyn.

## 2. Användarroller

### Mobil användare

Ska kunna:

- ansluta till en sökinsats
- se sektorer och tilldelningar
- spela in GPS-spår
- lägga metadata på spår
- skapa punkter med metadata
- se gemensamma spår, punkter och sektorer enligt behörighet
- importera och exportera GPX
- synkronisera manuellt eller automatiskt

### Insatsadministratör

Ska kunna:

- skapa och administrera sökinsatser
- skapa QR-kod och kort anslutningskod
- lägga upp, redigera och tilldela söksektorer
- se alla inskickade spår och punkter
- redigera eller komplettera metadata
- importera och exportera GPX
- välja tillgängliga kartlager
- hantera deltagare och behörigheter

### Mobil webbdeltagare

Ska kunna:

- ansluta till en sökinsats med QR-kod eller kort insatskod
- ange anropsnamn
- välja eller bekräfta sökinsats
- se tilldelade eller publicerade sektorer
- ladda ner sektorer i tillgängliga exportformat
- ladda upp spårfiler från externa GPS-appar eller GPS-enheter
- ange metadata på uppladdade spår, exempelvis POD, patrull/grupp, anropsnamn och sektor
- se status och historik för egna uppladdningar

Den mobila webbdeltagaren ska inte spela in GPS-spår i webbläsaren i första versionen och ska inte se andra deltagares spår.

## 3. Mobilapplikation

### Plattformar

- Android.
- iOS.
- GPS-spårning ska kunna fortsätta när appen ligger i bakgrunden eller telefonen är låst.

### Anslutning till sökinsats

Användaren ska kunna ansluta genom QR-kod eller genom att skriva in en kort unik kod manuellt.

Krav på anslutningskod:

- unik per sökinsats
- cirka åtta tecken
- endast bokstäver och siffror
- skiftläge ska ignoreras
- ska kunna återkallas eller förnyas av administratör

Exempel: `7K4P9X2A`.

Systemet bör även stödja tidsbegränsning och olika behörigheter, exempelvis läsbehörighet eller full deltagarbehörighet.

### GPS-spårning

Ska stödja:

- start, paus och stopp
- visning av aktuell position
- visning av inspelad sträcka och tid
- lokal lagring utan nätanslutning
- fortsatt inspelning vid dålig eller saknad täckning
- visning av GPS-noggrannhet
- batterisparande inställningar

Ett spår ska minst kunna innehålla starttid, sluttid, användare eller patrull, GPS-punkter och metadata. Total sträcka, höjd, noggrannhet och kommentarer bör sparas när informationen finns tillgänglig.

Metadata ska exempelvis kunna innehålla POD, patrullnamn och annan identifiering.

### Punkter

Användaren ska kunna placera en punkt via aktuell GPS-position eller genom att välja position på kartan. Manuell koordinatinmatning bör stödjas.

En punkt ska kunna innehålla:

- kategori
- rubrik
- beskrivning
- tidpunkt
- användare
- GPS-noggrannhet
- prioritet eller status
- fotografi, om detta införs

Exempel på kategorier är fynd, observation, person, föremål, spår, fordon, risk/hinder och övrigt.

### Sektorer

Mobilappen ska kunna visa:

- tilldelade sektorer
- sektorns gränser
- sektorns namn och status
- instruktioner
- vilka sektorer som är färdiga, pågående eller ej påbörjade

Sektorer ska kunna beskrivas med sökmetod, segmentidentitet, prioritet, tilldelad resurs och eventuella instruktioner.

## 3.1 Mobil webbdel/PWA för extern GPS

Den mobila webbdelen ska vara ett enklare komplement till native-appen för användare som registrerar spår i andra GPS-appar eller GPS-enheter.

### Anslutning

Användaren ska kunna ansluta med sökinsatsens QR-kod eller korta insatskod. Anropsnamn ska anges vid anslutning. Sessionen ska vara begränsad till aktuell sökinsats och ska kunna tidsbegränsas eller återkallas av administratören.

### Sektorer

Användaren ska kunna välja sökinsats och ladda ner sektorer som användaren har behörighet till. Samma exportformat som stöds av admin-gränssnittet ska vara tillgängliga, inklusive GPX, Garmin-anpassad GPX och GeoJSON där formatet är relevant.

### Externa spår

Användaren ska kunna välja en eller flera spårfiler och ladda upp dem tillsammans med metadata, exempelvis:

- POD
- patrull eller grupp
- anropsnamn
- vald sektor
- sökmetod
- start- och sluttid när tillgängligt
- anteckning

Originalfilens spårgeometri ska bevaras. Uppladdningen ska valideras och visa tydlig status samt kunna återförsökas vid fel.

Första versionen ska vara onlinebaserad. Framtida PWA-cache och köade uppladdningar ska kunna införas utan att ändra användarflödet.

## 4. Kartor

Systemet ska kunna stödja flera kartlager, exempelvis standardkarta, terrängkarta, flygfoto och lokalt tillhandahållna kartbilder.

För användning i områden med dålig täckning bör systemet stödja förladdning och cachelagring av kartmaterial samt tydlig visning när kartmaterial saknas.

## 5. Synkronisering

Manuell synkronisering ska vara standard för att minska batteriförbrukning och nätverkstrafik. Automatisk synkronisering ska kunna aktiveras av användaren eller administratören.

Följande inställningar bör kunna finnas:

- automatisk synkronisering
- endast synkronisering via Wi-Fi
- endast synkronisering vid laddning
- synkronisering av valda datatyper

Synkronisering ska hantera avbrott, dubbletter, konflikter och bekräftelse på att servern tagit emot data. Appen ska tydligt visa om data är ej synkad, synkroniserar, synkad eller har ett fel.

## 6. GPX-import och export

Systemet ska kunna importera och exportera GPS-spår och punkter i GPX-format. Sektorer ska kunna exporteras och importeras som polygoner där formatet stöder detta, eller via ett kompletterande standardformat.

Vid import bör användaren kunna förhandsgranska innehållet, välja objekt, koppla det till en sökinsats och upptäcka dubbletter.

Vid export bör användaren kunna välja enskilda spår, flera spår, punkter, sektorer, hela sökinsatsen, tidsintervall eller användare/patrull.

## 7. Webbaserat administrationsgränssnitt

Administratören ska kunna:

- skapa sökinsats med namn, beskrivning och tidsperiod
- rita, redigera och tilldela sektorer
- ändra sektorstatus
- skapa, återkalla och förnya QR-kod och anslutningskod
- visa alla spår och punkter på karta
- filtrera på tid, användare, patrull, sektor och status
- importera och exportera GPX
- arkivera sökinsatser

Gränssnittet bör även visa sökt och återstående yta, aktiva användare, senaste synkroniseringar, GPS-kvalitet samt fel eller saknade data.

## 8. Säkerhet och integritet

Systemet ska använda krypterad kommunikation och separata behörigheter för deltagare och administratörer. Det ska finnas möjlighet att återkalla koder, logga ändringar, säkerhetskopiera data samt arkivera eller radera sökinsatser.

QR-koden ska inte innehålla mer känslig information än vad som krävs för att ansluta till sökinsatsen.

Behörighetsmodellen ska tydligt definiera om användare får se egna spår, patrullens spår eller alla spår i sökinsatsen.

## 9. Framtida funktioner

### Automatisk sektorfördelning enligt MSO

Systemet ska på sikt kunna föreslå eller generera en sektorindelning utifrån den eftersöktes MSO-profilering och insatsens planeringsdata.

Indata ska kunna omfatta:

- PLS – plats för senaste iakttagelse
- LKP – senast kända position
- IPP – inledande planeringspunkt
- sökområde och tillgänglig geometri
- POA-värden eller motsvarande sannolikhetsunderlag
- terräng, vägar, stigar, vattendrag och andra ledstänger
- vald sökmetod
- antal och typ av tillgängliga sökresurser
- önskad eller beräknad POD

Funktionen ska kunna:

- föreslå primärt sökområde
- dela sökområdet i segment
- föreslå prioritet och ordning
- föreslå ledstänger och ledstångssök
- ta hänsyn till PLS, LKP och IPP
- visa underlaget och antagandena bakom förslaget
- låta insatsadministratören redigera förslaget innan publicering
- spara vilken version av profilen och vilka indata som användes

Automatisk sektorfördelning ska vara ett beslutsstöd. Den får inte automatiskt publicera eller ersätta insatsledningens bedömning utan uttryckligt godkännande.

### In- och utstämpling

- stämpla in och ut
- registrera arbetstid
- visa vilka som är aktiva
- visa senaste aktivitet
- administrativ korrigering
- exportera närvarolista

### Schemaläggning

- skapa arbetspass
- tilldela personer till pass och sektorer
- visa bemanning
- skicka påminnelser
- hantera byten och frånvaro

Möjliga ytterligare funktioner är pushmeddelanden, foton kopplade till punkter, meddelanden, SOS-/nödläge, geofencing och automatiska rapporter.

## 10. Tekniska krav

De tekniska kraven och rekommendationerna finns samlade i [Teknisk arkitektur](teknisk-arkitektur.md).

Sammanfattning:

- Backend ska utvecklas i C# med ASP.NET Core och kunna köras på Linux, inklusive infrastruktur på Proxmox.
- PostgreSQL med PostGIS ska vara förstahandsval för geografiska data.
- Webbgränssnitt ska utvecklas med React och TypeScript.
- Mobilapplikationer ska utvecklas med React Native och TypeScript.
- Gemensam kod ska återanvändas för typer, API-klient, validering och synkroniseringslogik där det är lämpligt.
- Backend ska kunna skalas horisontellt och uppdateras med minimal eller ingen planerad driftstörning.
