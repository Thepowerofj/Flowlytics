# Responsive Behaviour

- **Desktop (≥1024px):** Full canvas + side inspector — **primary supported layout for v1**.
- **Tablet (768–1023px):** Canvas primary; side rails may compress; config windows remain modal overlays.
- **Mobile (<768px):** Navigation and home/schedules lists remain usable. Full canvas wiring is **not** a v1 goal — prefer editing flows on larger screens. A simplified “list of steps” canvas mode is deferred (do not claim it ships until implemented).
- **Ask (`/ask`):** Full-bleed workspace under the app header (no centered `max-w` column). Thread list + chat fill remaining viewport height; chat scroll is inside the panel. Pipeline strip stays visible above messages; charts/table previews stack within assistant bubbles.
