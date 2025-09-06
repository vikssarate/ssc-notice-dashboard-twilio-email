# Coaching Updates (Coaching-only, no govt portals)

- API: `/api/coach` (supports `?only=`, `?source=`, `?limit=`, `?debug=1`)
- Web: `/frontend/coaching.html` (also `/` and `/coaching` via rewrites)

## Quick test
- `https://<your>.vercel.app/api/coach?only=jobs,admit-card,result&limit=60&debug=1`
- `https://<your>.vercel.app/coaching`

## Notes
- Sources: T.I.M.E., Adda247, Testbook, BYJU'S Exam Prep, Oliveboard, Career Power,
  PracticeMock, Guidely, ixamBee, BankersDaily, AffairsCloud, Aglasem, StudyIQ, Examstocks.
- No scraping of official govt portals in this project.
