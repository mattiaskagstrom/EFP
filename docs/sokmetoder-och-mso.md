# Sökmetoder och MSO-begrepp

**Status:** Kravutkast  
**Källa för begreppsdefinitioner:** [Svenska Brukshundklubbens Upplandsdistrikt – Eftersök, förkortningar MSO](https://sbkuppland.se/tjanstehund/eftersok-forkortningar-mso/)

## 1. Sökmetoder

### Patrullsök

Patruller om tre till sex personer söker tillsammans igenom terrängen. Det inbördes avståndet mellan deltagarna bestäms enligt vald metod, exempelvis Critical Separation-metoden.

I systemet ska patrullsök kunna beskrivas med:

- patrull
- deltagare
- tilldelat segment eller område
- planerat inbördes avstånd, om det används
- spår från patrullens deltagare
- status och genomförandetid

### Skallgångssök

Skallgångssök ska kunna representeras som en sökmetod där flera sökresurser genomsöker ett avgränsat område eller segment enligt insatsledningens plan.

Systemet ska kunna hantera:

- sökformation eller grupp
- segment och zoner
- resurs- och deltagartilldelning
- start och slut
- status
- registrerade spår och observationer

Den exakta taktiska planeringen ska kunna anpassas av insatsledningen och inte hårdkodas i applikationen.

### Ledstångssök

En ledstång är exempelvis väg, stig, vattendrag, sänka, ledningsgata, rågång eller annat lättframkomligt stråk.

Ledstångssök är sök som genomförs med lättrörliga sökresurser längs ledstänger inom sökområdet.

Systemet ska kunna:

- registrera ledstänger som linjegeometrier
- importera ledstänger från kart- eller GIS-underlag där det är möjligt
- koppla ledstänger till zoner och segment
- ange prioritet och status
- ange ansvarig sökresurs
- visa genomförd sträcka längs ledstången
- markera observationer och fynd längs ledstången
- inkludera ledstänger i framtida automatisk zonfördelning

## 2. Centrala MSO-förkortningar

### PLS – Plats för senaste iakttagelse

Engelska: *Point Last Seen*.

Den plats där den försvunne senast iakttogs.

### LKP – Senast kända position

Engelska: *Last Known Position*.

Den plats där man vet att den försvunne senast uppehållit sig. Positionen kan grunda sig på säkra spår eller tillhörigheter och behöver inte vara en direkt observation.

### IPP – Inledande planeringspunkt

Engelska: *Initial Planning Point*.

Den plats som används som utgångspunkt vid planeringen av efterforskningsinsatsen. IPP kan vara PLS eller LKP beroende på omständigheterna.

### POA – Sannolikhet för område

Engelska: *Probability Off Area*.

Sannolikheten, uttryckt exempelvis i procent, för att den eftersökte befinner sig inom ett definierat område.

### POD – Sannolikheten för upptäckt

Engelska: *Probability of Detection*.

Sannolikheten för att en sökresurs hittar den eftersökte om denne finns i det segment som genomsöks.

### ROW – Resten av världen

Engelska: *Rest of the World*.

Allt utanför det definierade sökområdet.

## 3. Övriga relevanta begrepp

### Eftersök

Det arbete som genomförs av sökresurser för att hitta en försvunnen person.

### Genomsök

Det faktiska sökarbete som en sökresurs utför i ett segment.

### Närsök

Sök som genomförs av första tillgängliga resurs i omedelbar anslutning till PLS eller LKP.

### Parallellsök

Sök efter spår längs en ledstång, vanligtvis med hjälp av hund.

### Primärt sökområde

Ett tidigt definierat sökområde där snabbhet i besluten kan vara viktigare än fullständig noggrannhet.

### Segment

En mindre del av sökområdet som används för att underlätta sökarbete, tilldelning och ordergivning.

### Sökområde

Hela det geografiska område inom vilket sökningen genomförs.

## 4. Krav på MSO-stöd

Applikationen ska kunna lagra och visa PLS, LKP och IPP på karta. Dessa objekt ska kunna användas som indata vid manuell planering och framtida automatisk zonfördelning.

Systemet bör kunna visa POA och POD på zon- eller segmentnivå, men ska tydligt skilja mellan inmatade värden, manuella bedömningar och beräknade förslag.

Automatiska förslag ska alltid kunna granskas, redigeras och godkännas av behörig insatsadministratör.

## 5. Källanvändning

Definitionerna ovan är sammanfattade från Svenska Brukshundklubbens Upplandsdistrikts publicerade arbetsblad och ska verifieras mot den terminologi och de rutiner som används av den aktuella organisationen innan algoritmer eller fasta arbetsflöden implementeras.
