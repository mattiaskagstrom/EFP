# Legacy-databasscheman

- `legacy-current.sql`: fryst fullständigt schema motsvarande `EnsureCreated` vid commit `807ac97`, utan migrationshistorik.
- `legacy-early.sql`: representativ tidig MVP med de fyra kärntabellerna och polygonkolumn för sektorer.
- `legacy-startup.sql`: den tidigare SQL-justeringen från `Program.cs` vid commit `807ac97`, inklusive förenklade Identity-tabeller utan alla EF-nycklar och index.

Filerna är testunderlag för övergången till migreringar. Uppdatera dem inte när modellerna ändras; de ska fortsätta representera äldre databaser. De körs enbart i isolerade testcontainrar.
