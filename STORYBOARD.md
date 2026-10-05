# Storyboard — What Happens When You Type a URL

One change from the chat plan: the CDN edge comes BEFORE the ocean crossing. Anycast routes you to the nearest edge first; the transatlantic hop only happens on a cache MISS, edge to origin.

The journey: user in Rijeka → Frankfurt edge (DE-CIX) → MISS → Paris → Saint-Hilaire-de-Riez → Dunant submarine cable → Virginia Beach → origin in Ashburn. Real cable, real landing points. Optional flag: geolocate the visitor so the journey starts from THEIR city.

| Ref image | Stage |
| --- | --- |
| design/hero.png | art direction (same frame as s1) |
| design/s1.png | Stage 1 — DNS |
| design/s2.png | Stage 2 — TCP |
| design/s3.png | Stage 3 — TLS |
| design/s4.png | Stage 4 — CDN edge |
| design/s5.png, design/s5-4x5.png | Stage 5 — ocean (thumbnail + 4:5 crop) |
| design/s6.png | Stage 6 — render |

1. **Stage 0 — The URL bar.** Floating 3D browser bar in dark void. User types `vercel.com`. Translucent memory blocks flicker: `Browser cache — MISS`, `OS cache — MISS`. Concept: cache hierarchy before any network call. Transition: camera pulls back, the packet is born as a glowing orb and drops onto the network plane.
2. **Stage 1 — DNS.** Four towers: Resolver (ISP), Root, TLD (.com), Authoritative. Packet hops tower to tower with floating query labels, returns carrying `76.76.21.21` and a TTL countdown chip. Concept: recursive resolution, caching at the resolver. Hotspot per tower explains its role.
3. **Stage 2 — TCP handshake.** Client tower left, server tower right, canyon between. Three packets cross: `SYN →`, `← SYN-ACK`, `ACK →`, sequence numbers floating beside each. Concept: reliable connection before any data moves.
4. **Stage 3 — TLS.** Same canyon. Client hello fans out cipher cards, server presents its certificate chain, keys combine and a padlock assembles mid-air. The open channel becomes an encrypted tube (shader). Concept: TLS 1.3 handshake, one round trip, then symmetric encryption.
5. **Stage 4 — CDN edge.** Packet arrives at the Frankfurt edge PoP. Cache check: HIT branch (short glowing return path, story could end here) vs MISS branch (gate opens toward the ocean). Concept: edges exist so most requests never cross an ocean. This run is a MISS.
6. **Stage 5 — The ocean (hero shot).** Camera pulls out to Earth at night. Packet dives into the Dunant cable at Saint-Hilaire-de-Riez and rides the seabed arc to Virginia Beach, live latency counter running (~80 ms RTT transatlantic). Free-orbit enabled only here. Concept: the internet is physical.
7. **Stage 6 — Response and render.** HTML streams back as glowing ribbons. DOM tree grows as a literal 3D tree, CSSOM joins it, the page assembles like a construction site while subresource packets spawn in parallel. Concept: critical rendering path. Finale: camera returns to the browser bar, page loaded, total elapsed counter: `1.2 s. That's what just happened.`
