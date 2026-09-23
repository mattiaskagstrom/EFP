# GDPR och dataminimering

EFP ska samla in så lite information som möjligt om sökande användare. Användare har ingen personprofil och anger endast anropsnamn för den aktuella insatsen. Anropsnamn behöver inte vara unikt.

Systemet sparar för användarsessioner endast insats, anropsnamn, skapad tid, senaste användning, återkallelsetid och teknisk kodversion. Tokens och insatskoder sparas hashade; lösenord hanteras av ASP.NET Identity.

Anropsnamn ska behandlas som potentiell personuppgift om insatsorganisationen kan koppla det till en fysisk person. Innan skarp drift ska ansvarig organisation fastställa gallringstider för admin-konton, sessioner, insatser, spår och punkter samt dokumentera information till användarna.

Driftmiljön ska använda TLS, säkra cookies, CSRF-skydd, rate limiting och säkerhetsloggning utan lösenord, råa koder eller tokens.

