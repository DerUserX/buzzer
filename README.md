# Buzzer

Quiz-Buzzer für zwei Spieler an einer Tastatur – läuft komplett im Browser, ohne Installation.

**Online spielen:** https://deruserx.github.io/buzzer/

## Bedienung

| Taste | Aktion |
|---|---|
| `A` | Buzzer links (Standard: Daniel, Rot) |
| `#` | Buzzer rechts (Standard: Dennis, Blau) |
| `Leertaste` | Sofort zurücksetzen |
| `Esc` / ⚙ | Einstellungen |

Alternativ kann man auch auf eine Bildschirmhälfte klicken/tippen. Tipp: mit `F11` in den Vollbildmodus.

Wer zuerst buzzert, färbt den Bildschirm in seiner Farbe. Danach sind beide Buzzer für die eingestellte Zeit (Standard 5 s) gesperrt – die leuchtenden Punkte zeigen die verbleibenden Sekunden. Am Ende ertönt der „Zeit abgelaufen“-Sound und beide sind wieder frei.

## Einstellungen

- Name, Farbe und Taste pro Spieler
- Sperrzeit (1–30 s), Tick-Sound an/aus, Lautstärke
- Eigene Sounds (mp3/wav/ogg) für Buzzer A, Buzzer B, Sekunden-Tick und Zeit abgelaufen

Alles wird lokal im Browser gespeichert (localStorage bzw. IndexedDB für Sounds).

## Lokal starten

`index.html` direkt im Browser öffnen, oder:

```bash
python -m http.server 8765
```
