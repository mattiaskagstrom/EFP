# Funktioner och datamodell

## 1. Centrala arbetsflöden

### Skapa sökinsats

1. Administratören skapar en sökinsats.
2. Administratören anger namn, beskrivning, tidsperiod och eventuella instruktioner.
3. Administratören ritar eller importerar sektorer.
4. Systemet skapar en unik anslutningskod och QR-kod.
5. Deltagare ansluter via mobilappen.

### Genomföra sök

1. Användaren väljer eller får en sektor.
2. Användaren startar spårinspelning.
3. Appen sparar GPS-punkter lokalt.
4. Användaren markerar fynd, observationer eller andra händelser.
5. Användaren stoppar eller pausar spåret.
6. Användaren synkroniserar när det är lämpligt.

### Följa insatsen i webben

1. Administratören öppnar sökinsatsen.
2. Spår, punkter och sektorer visas på karta.
3. Administratören filtrerar på sektor, tid, patrull eller status.
4. Underlaget exporteras eller arkiveras vid behov.

### Använda mobil webbdel med extern GPS

1. Deltagaren öppnar den mobilanpassade webbappen.
2. Deltagaren skannar QR-kod eller anger insatskod.
3. Deltagaren anger anropsnamn och får en insatsbegränsad session.
4. Deltagaren väljer eller bekräftar sökinsats.
5. Webbdelen hämtar tilldelade eller publicerade sektorer.
6. Deltagaren laddar ner sektorer i önskat format.
7. Deltagaren väljer spårfiler från en extern GPS-app eller GPS-enhet.
8. Deltagaren anger metadata, exempelvis POD, patrull/grupp och sektor.
9. Webbdelen validerar och laddar upp spåret.
10. Deltagaren ser uppladdningens status och historik.

Detta flöde spelar inte in GPS i webbläsaren. Det är ett onlinebaserat filutbyte i första versionen, men ska senare kunna kompletteras med PWA-cache och köade uppladdningar.

## 2. Centrala informationsobjekt

### Sökinsats

- `id`
- `namn`
- `beskrivning`
- `status`
- `starttid`
- `sluttid`
- `administratör`
- `anslutningskod`
- `skapad`
- `senast ändrad`

### Användare

- `id`
- `namn eller anropsnamn`
- `organisation eller enhet`
- `behörighet`
- `senast aktiv`
- `senast synkad`

### Mobil insatssession

- `id`
- `sökinsats`
- `anropsnamn`
- `skapad`
- `giltig till`
- `återkallad`
- `senast aktiv`

### Spår

- `id`
- `sökinsats`
- `användare eller patrull`
- `GPS-punkter`
- `starttid`
- `sluttid`
- `total sträcka`
- `höjddata`, om tillgängligt
- `GPS-noggrannhet`
- `metadata`
- `synkroniseringsstatus`
- `ursprunglig fil`
- `POD`
- `söksektor`
- `uppladdningsstatus`

### Punkt

- `id`
- `sökinsats`
- `koordinat`
- `kategori`
- `rubrik`
- `beskrivning`
- `tidpunkt`
- `användare`
- `prioritet eller status`
- `GPS-noggrannhet`
- `bilagor`

### Sektor

- `id`
- `sökinsats`
- `namn`
- `geometri`
- `status`
- `instruktion`
- `tilldelning`
- `prioritet`

## 3. Statusvärden

Exempel på status för sökinsats:

- planerad
- aktiv
- pausad
- avslutad
- arkiverad

Exempel på status för sektor:

- ej påbörjad
- tilldelad
- pågående
- färdig
- kräver komplettering

Exempel på synkroniseringsstatus:

- lokal ändring
- väntar på synkronisering
- synkroniserar
- synkad
- synkroniseringsfel

## 4. Princip för offlinehantering

Mobilappen ska fungera utan nätanslutning för de centrala funktionerna. Lokala ändringar ska behållas tills de har bekräftats av servern.

Vid konflikt behöver systemet ha en definierad strategi. Som utgångspunkt bör nya spår och punkter aldrig skrivas över automatiskt. Ändringar ska i stället versionshanteras eller visas för administratören.
