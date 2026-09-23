# UX-beslut för admin-gränssnittet

Detta dokument beskriver de UX-beslut som hittills tagits för admin-gränssnittet i EFP-applikationen. Dokumentet gäller främst kartbaserad planering och redigering av sökinsatser och ska användas som vägledning vid fortsatt utveckling.

## Syfte och målgrupp

Admin-gränssnittet ska ge insatsledning och administratörer ett snabbt och tydligt arbetsflöde för att:

- skapa och välja sökinsatser
- planera och redigera sektorer på karta
- importera och exportera geodata
- se underlag som spår, punkter och referenspunkter

Gränssnittet ska fungera även för användare som inte arbetar med GIS till vardags. De vanligaste uppgifterna ska vara möjliga att utföra direkt från kartvyn utan att användaren behöver förstå den underliggande datamodellen.

## Övergripande layout

Adminvyn är indelad i tre tydliga områden:

1. **Sidhuvud** – visar applikationens namn och aktuell produktnivå.
2. **Vänsterpanel** – visar sökinsatser och innehåller skapande av ny sökinsats.
3. **Kartområde** – visar geodata och innehåller verktyg för planering och redigering.

Kartvyn ska vara den dominerande ytan eftersom de viktigaste arbetsuppgifterna sker geografiskt. Vänsterpanelen ska vara tillräckligt smal för att inte minska kartans användbara yta, men tillräckligt bred för att sökinsatsernas namn ska kunna läsas.

## Val av gränssnitt

När webbappen öppnas ska användaren först välja **Administratör** eller **Användare**.

Administratören får tillgång till hela planerings- och redigeringsflödet. Användaren får ett separat flöde för planerade och aktiva sökinsatser och ska inte se kontroller för att skapa, redigera eller arkivera insatser.

Användarläget är initialt öppet för planerade och aktiva insatser. När insatskod eller QR-autentisering införs ska åtkomsten begränsas till den insats som anslutningen gäller.

## URL och direktlänkar

Rena sökvägar används för att göra det möjligt att dela länkar till en specifik insats:

- `/admin`
- `/admin/investigations/{id}`
- `/user`
- `/user/investigations/{id}`

URL:en ska ändras när användaren väljer roll eller insats och webbläsarens bakåt- och framåtknappar ska fungera. En direktlänk ska öppna rätt vy, men ska inte kringgå framtida QR- eller kodautentisering.

## Val av sökinsats före karta

Användaren ska först välja en befintlig sökinsats eller skapa en ny. Ingen karta visas innan en sökinsats är vald. Detta minskar risken att användaren arbetar mot fel insats och gör det tydligt vilket geografiskt underlag som laddas.

När en sökinsats väljs laddas dess sektorer, spår och övriga kartunderlag. Vänsterpanelen byter då från insatsväljare till insatsmeny och visar funktioner som gäller den valda insatsen. Där ska användaren kunna byta insats, spara kartrelaterade ändringar, exportera underlag och importera GPX.

## Sökinsatser

### Skapa sökinsats i insatslistan

Funktionen för att skapa en ny sökinsats ligger i direkt anslutning till listan över sökinsatser. Beslutet bygger på att skapande och val av insats är samma övergripande arbetsflöde.

Beslut:

- Ny sökinsats skapas genom namn och knappen **Skapa sökinsats**.
- Insatslistan visar insatsens namn och status.
- Den valda insatsen markeras tydligt.
- Kartans sektorer och exportlänkar knyts till vald insats.
- Fel vid skapande visas nära det övergripande gränssnittet och ska inte tysta misslyckade operationer.

### Framtida utveckling

När sökinsatsen får fler fält bör skapandet utvecklas till ett stegvis formulär eller en dialog. Namn ska fortfarande vara det första och obligatoriska fältet, medan exempelvis PLS, LKP, IPP, beskrivning och sökprofil kan fyllas i därefter.

## Insatsmeny och kartunderlag

För en vald sökinsats ska vänsterpanelen samla insatsspecifika funktioner:

- spara sektor- och kartändringar
- slänga lokala sektorändringar och läsa om serverversionen
- exportera sektorer
- exportera spår som GPX eller GeoJSON
- importera sektorer från GPX
- importera spårdata från GPX
- lista importerade GPX-filer
- visa eller dölja enskilda importerade spår i kartan

Karttyp väljs fortsatt i en kontroll direkt ovanpå kartan. Den hör ihop med den aktuella arbetsytan och ska därför inte dupliceras i vänsterpanelen.

Importerade GPX-spår ska laddas som separata kartlager. En import ska inte försvinna bara för att lagret döljs; kryssrutan styr endast synlighet i den aktuella kartvyn. Filnamn och, när det finns, anropsnamn ska visas i listan.

Sektor-GPX och spår-GPX är två separata importflöden. Importerade spår är immutable i adminvyn. Sektor-GPX importeras som sektorer och kan därefter redigeras tillsammans med övriga sektorer. Sektorimporten ska stödja både GPX-filer med separata slutna segment och linjeunderlag där slutna områden behöver polygoniseras.

Kartändringar hålls lokala tills användaren väljer **Spara ändringar**. **Släng ändringar** återställer lokala sektorändringar, inklusive nya, redigerade och borttagna sektorer, genom att hämta aktuell version från servern.

## Sektorlista och inställningar

Vänsterpanelen innehåller en lista över alla sparade sektorer i den valda sökinsatsen. Ett klick på en sektor i listan markerar motsvarande sektor i kartan. Ett klick på en sektor i kartan gör samma sak och expanderar sektorns inställningar i vänsterpanelen.

Varje sektor har en egen inställningssektion som är hopfälld som standard. Högerklicksmeny används inte för sektormetadata. Den expanderade sektionen ska kunna:

- ändra sektorns namn
- markera sektorn som sökt eller inte sökt
- ange när sektorn söktes
- ange sektorns poäng
- välja om sektorns namn ska visas på kartan
- välja om sektorns storlek ska visas på kartan i km²
- förenkla polygonen med valbar tolerans i meter
- visa eller dölja sektorn i den aktuella kartvyn
- radera sektorn efter en tydlig bekräftelse

Visningsvalen påverkar kartan direkt men sparas tillsammans med övriga sektorändringar först när användaren väljer **Spara ändringar**. Spår och andra importer som är immutable ska inte få dessa sektorinställningar.

Att dölja en sektor är en lokal visningsinställning och påverkar inte serverdata. Radering kräver bekräftelse i gränssnittet och utförs som soft-delete på servern, så att sektorn kan återställas eller granskas i framtida administrationsfunktioner.

Polygonförenkling sker lokalt och ska minska antalet hörnpunkter utan att ändra sektorns avsedda form mer än toleransen tillåter. Förenklingen ska kunna ångras och den nya geometrin valideras när sektorn sparas.

## Splitta sektor

Verktyget **Splitta sektor** aktiveras separat från övriga ritverktyg. Användaren klickar först på den sektor som ska delas; sektorns outline markeras då tydligt. Därefter ritas en linje genom sektorn från kant till kant. Linjen används för att skapa två lokala delsektorer.

Splitten ändrar inte servern direkt. Originalsektorn tas bort och delsektorerna sparas först när användaren väljer **Spara ändringar**. Om linjen inte delar sektorn i två giltiga polygoner ska originalsektorn ligga kvar och användaren få en begriplig återkoppling.

## Slå ihop sektorer

Verktyget **Slå ihop sektorer** aktiveras separat i kartans verktygsfält. Användaren väljer först den ena sektorn och därefter den andra. Sektorerna måste dela en gemensam kant; annars visas ett felmeddelande och sektorerna lämnas oförändrade.

En lyckad sammanslagning skapar en lokal draft-sektor direkt i kartan och sektorlistan. De ursprungliga sektorerna tas bort lokalt och ersätts permanent först när användaren väljer **Spara ändringar**.

Importflödet ska ge återkoppling om lyckad eller misslyckad import. Vid fortsatt utveckling bör listan även visa importtid, antal punkter och eventuella valideringsvarningar.

## Kartan

### Kartan som primär arbetsyta

Kartan är den primära arbetsytan för sektorplanering. Verktyg och inställningar placeras därför nära kartan och inte i ett separat administrationsformulär.

### Val av karttyp

Karttypväljaren ligger uppe till höger i kartan så att den är lätt att hitta men inte konkurrerar med ritverktygen.

Första versionen erbjuder:

- Standard – OpenStreetMap
- Topografisk – OpenTopoMap
- Satellit – Esri World Imagery

Karttypen ska påverka bakgrundskartan men inte de ritade objekten. Sektorer, spår, punkter och texter ska ligga kvar på samma geografiska position när användaren byter karttyp.

Kartkällans attribution ska alltid visas enligt respektive leverantörs villkor.

## Ritverktyg

### Verktygsfält längst ner i kartan

Ritverktygen ligger i en toolbar längst ner i kartan. Beslutet ger verktygen en tydlig koppling till arbetsytan och lämnar sidhuvud och insatslista fria från GIS-funktioner.

Toolbaren grupperar funktionerna enligt följande:

1. Rita objekt.
2. Ange stil och text.
3. Redigera, ångra/gör om, spara sektor och exportera.

På mindre skärmar ska grupperna kunna radbrytas utan att verktygen försvinner. Toolbaren ska ligga ovanpå kartan med tillräcklig kontrast och skugga för att vara läsbar mot olika kartbakgrunder.

### Ritobjekt

Följande ritobjekt stöds i adminvyn:

- polygon
- fyrkant
- cirkel
- sträcka
- text

Polygon och fyrkant kan användas som grund för sektorer. Sträckor kan användas för exempelvis ledstänger eller andra linjära planeringsobjekt. Cirklar och text är visuella planeringsobjekt tills de får tydligare domänmodellering.

Text skapas genom att aktivera textverktyget och klicka på kartan. Därefter anges texten i en dialog. Ett permanent textfält i toolbaren används inte, eftersom det skulle duplicera textverktygets funktion och göra arbetsflödet otydligare.

### Färg och linjetyp

Färg och linjetyp väljs i toolbaren och används vid skapande av nya objekt.

Stödda linjetyper:

- heldragen
- sträckad
- punktad
- sträck-punkt

Färg och linjetyp ska inte oväntat ändra redan skapade objekt. Befintliga objekt ändras genom redigeringsläge eller framtida egenskapsdialog.

## Aktivt verktyg och pekare

Det ska alltid vara tydligt vilket verktyg som är aktivt.

Detta visas på två sätt:

- den aktiva knappen markeras med färg, kant och fokusliknande kontrast
- muspekaren ändras så att den speglar verktygets funktion

Exempel:

| Verktyg | Aktiv knapp | Pekare |
|---|---|---|
| Polygon, fyrkant, cirkel, sträcka | markerad | hårkors |
| Text | markerad | textpekare |
| Redigera | markerad | pekare |
| Flytta | markerad | flyttmarkör |
| Ta bort | markerad | förbjudet-markör |

Efter att ett objekt har skapats eller text placerats avslutas verktyget och aktivt läge återställs till inget verktyg. Detta minskar risken att användaren oavsiktligt fortsätter rita eller ta bort objekt.

Det aktiva verktyget kan också avaktiveras genom att klicka på samma knapp en gång till. Då stängs verktygsläget och kartan återgår till vanlig panorering. Detta ska fungera utan att användaren behöver hitta en separat knapp för "markera inget verktyg".

## Redigering och borttagning

### Redigera

Redigeringsläget aktiveras först utan att lägga till redigeringshandtag på kartan. Användaren klickar därefter på den sektor som ska redigeras; endast den valda sektorn får redigeringshandtag. Detta förhindrar prestandaproblem med komplexa GPX-geometrier.

### Flytta

Flyttläget används för att flytta ett helt objekt utan att ändra dess form. Objektets geografiska data ska uppdateras efter avslutad flytt.

### Ta bort

Ta bort är ett separat läge och ska inte vara aktivt samtidigt som redigering eller flytt. Eftersom borttagning kan vara destruktiv bör en framtida version överväga bekräftelse eller återställning via ångra.

### Ångra och gör om

Ångra och gör om finns som synliga knappar i toolbaren och stöds även med:

- `Ctrl+Z` på Windows/Linux
- `Cmd+Z` på macOS
- `Ctrl+Y` eller `Cmd+Shift+Z` för gör om

Knapparna ska vara inaktiverade när motsvarande historik saknas. Historiken gäller den aktuella kartvyn och ska inte ersätta serverns revisionslogg.

## Spara sektor

Att rita en polygon eller fyrkant skapar inte automatiskt en permanent sektor i backend. Användaren måste uttryckligen välja **Spara ändringar**.

Detta är ett medvetet beslut för att skilja mellan:

- tillfälliga skissobjekt på kartan
- sektorer som ingår i sökinsatsens planering

Framtida versioner bör komplettera sparandet med formulär för sektorns namn, sökmetod, prioritet och patrull/grupptilldelning.

## Export

Export av sektorer ligger i kartans toolbar eftersom exporten gäller det geografiska planeringsunderlaget. Exportknappen ska vara kopplad till vald sökinsats och vara inaktiv eller tydligt begränsad när ingen insats är vald.

I insatsmenyn är exportfunktionerna samlade i en hopfällbar sektion. Användaren kan välja enskilda sektorer och spår före export; om urvalet lämnas tomt exporteras alla. För spår kan användaren dessutom ange ett valfritt tidsintervall. Spår utan tidsstämplar tas inte med när ett intervall används. Sektorer kan exporteras som både GeoJSON och GPX, medan spår kan exporteras som GPX eller GeoJSON.

Framtida importflöden bör visa förhandsgranskning, antal objekt och eventuella valideringsfel innan data sparas.

## Fel, status och återkoppling

Alla operationer som kan misslyckas ska ge synlig återkoppling. Det gäller bland annat:

- skapande av sökinsats
- sparande och redigering av sektor
- import och export
- kommunikation med backend

Återkopplingen ska vara kort, begriplig och placerad så att den inte döljer kartans arbetsyta. Vid nätverksfel ska användaren få veta om ändringen inte sparades, i stället för att gränssnittet enbart återgår till tidigare läge.

## Tillgänglighet och användbarhet

Fortsatt utveckling ska säkerställa att:

- alla knappar har begriplig text eller tooltip
- aktivt verktyg inte enbart kommuniceras med färg
- tangentbordsgenvägar kompletteras med synliga knappar
- färgval kan kombineras med linjetyp och form så att information inte enbart kodas med färg
- toolbaren fungerar på mindre skärmar
- kartobjekt kan väljas och redigeras utan extrem precision

## Öppna UX-frågor

Följande behöver beslutas innan adminvyn används i skarp insats:

- Ska borttagning kräva bekräftelse?
- Ska aktivt ritverktyg kunna låsas för upprepad ritning?
- Ska färg och linjetyp kunna ändras för redan skapade objekt via egenskapspanel?
- Hur ska överlappande sektorer visas och hanteras?
- Ska sektorer få etiketter direkt på kartan?
- Hur visas spår, observationer och importerade objekt i lagerpanelen?
- Hur hanteras kartor när nätverksanslutningen är dålig eller saknas?
- Ska export kunna begränsas till valt objekt, aktuell insats eller hela datamängden?

## Relaterade dokument

- [Kravspecifikation](kravspecifikation.md)
- [Teknisk arkitektur](teknisk-arkitektur.md)
- [Implementation status](implementation-status.md)
- [Action items](action-items.md)
