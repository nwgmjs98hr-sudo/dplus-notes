# D+ Notes

Personal notes app: D+0–D+4 day slots that move forward every midnight, This week / W+1 / W+2 planning,
calendar, folders for general notes and a 1-year archive. Works offline and syncs between devices via Firebase.

- App: https://nwgmjs98hr-sudo.github.io/dplus-notes/
- Demo with sample data (stored only in that browser): https://nwgmjs98hr-sudo.github.io/dplus-notes/?demo

## Typing rules
| Input | Result |
| --- | --- |
| `0900 Text` + Enter | goes to the schedule (undo returns it as plain text for good) |
| `0900-1050 Text` | time span; `2200-0600` shows on both days |
| `1000" Text` | number, stays a note |
| `01.02.26 Text` + Enter | asks: keep here / move to that day / both |
| `- ` | bullet list, `[] ` checklist; Enter twice ends the list |

Select text while writing to highlight it in one of 6 colors (red = important). Red anywhere in a line or note marks it,
and its day, as important.

Long press (or right click) on any line: color of the whole line, strike through, move to D+n, repeat, delete.

## Setup
1. Firestore rules: copy `firestore.rules` into Firebase → Firestore Database → Rules → Publish.
2. GitHub Pages: Settings → Pages → Deploy from a branch → `main` / root.
3. Firebase config lives in `js/config.js`.

No build step: plain HTML, CSS and JavaScript modules. Firebase SDK loads from gstatic and is cached by the service worker.
