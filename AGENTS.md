# Codex-instruktioner

## Buggfixar ska börja med ett reproducerande test

När en bugg ska rättas ska arbetet följa red–grön-flödet:

1. Börja med att implementera ett failande test som reproducerar den rapporterade buggen.
2. Rätta därefter den underliggande orsaken i koden.
3. Kör testet igen och verifiera att det nu går igenom.
4. Kör relevanta övriga tester för att kontrollera att fixen inte orsakar regressioner.

Testet ska behållas som ett regressionsskydd och dokumentera det beteende som tidigare var felaktigt. Om en bugg inte rimligen kan testas automatiskt ska begränsningen dokumenteras tillsammans med den manuella verifieringen.
