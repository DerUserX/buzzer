# Buzzer

Quiz-Buzzer für zwei Spieler an einer Tastatur – läuft komplett im Browser, ohne Installation.

**Online spielen:** https://deruserx.github.io/buzzer/

## Bedienung

| Taste | Aktion |
|---|---|
| `A` | Buzzer links (Standard: Daniel, Rot) |
| `#` | Buzzer rechts (Standard: Dennis, Blau) |
| `1` | Antwort richtig → Punkt für den, der gebuzzert hat |
| `0` | Antwort falsch → kein Punkt |
| `Backspace` | Letzte Bewertung rückgängig |
| `Enter` | Nach einem Sieg: neues Spiel |
| `Esc` / ⚙ | Einstellungen |

Tipp: mit `F11` in den Vollbildmodus. Der Mauszeiger blendet sich nach kurzer Zeit ohne Bewegung aus.

Wer zuerst buzzert, färbt den Bildschirm in seiner Farbe. Danach sind beide Buzzer für die eingestellte Zeit (Standard 5 s) gesperrt – die leuchtenden Punkte zeigen die verbleibenden Sekunden. Am Ende ertönt der „Zeit abgelaufen“-Sound und beide sind wieder frei.

Mit `1`/`0` wird die Antwort bewertet (auch nach Ablauf der Zeit); das beendet die Runde sofort. Nach der ersten Bewertung erscheint der Spielstand als Punkte unten auf beiden Seiten. Wer zuerst die Zielpunktzahl (Standard 5) erreicht, gewinnt.

## Einstellungen

- Name (mit Vorschlägen Daniel, Dennis, Monika, Volker), Farbe und Taste pro Spieler
- Sperrzeit (1–30 s), Punkte zum Sieg (1–20), Tick-Sound an/aus, Lautstärke
- Spielstand zurücksetzen
- Eigene Sounds (mp3/wav/ogg) für Buzzer A, Buzzer B, Sekunden-Tick, Zeit abgelaufen, Richtig, Falsch und Sieg

Alles wird lokal im Browser gespeichert (localStorage bzw. IndexedDB für Sounds).

## Lokal starten

`index.html` direkt im Browser öffnen, oder:

```bash
python -m http.server 8765
```
