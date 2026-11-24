# 5-minute demo script

Before: `npm run db:reset && npm run dev`, open `http://localhost:3000`, role = Vatandaş.

**0:00 – Landing (30 s).** Problem: rain alone does not say where flooding happens. Show the two verified events with source links. Point at the "Demo / Ön Fizibilite" badge — we are honest about what this is.

**0:30 – Map (60 s).** "Risk Haritasını Keşfet". Toggle *Su birikimi göstergesi*, *Dereler*, *Geçmiş taşkın gözlemleri*. Note the events are drawn as study areas, not pins — sources only give district/corridor precision. Click a red cell near Ayamama: factor breakdown, stability, DEM 90 m, and the building-scale refusal message. Switch metric to *Arazi kotu*.

**1:30 – Switch role → Belediye operatörü (demo) (10 s).** Say: demo cookie, not authentication.

**1:40 – Risk analysis (50 s).** Location "İkitelli – Basın Ekspres / Ayamama". Click *Analizi yeniden çalıştır*. Walk the pipeline — step 7 "ML: skipped, only 2 district-level events" — then factor contributions, top candidates with stability, ERA5 caveat (2023 shows ~5 mm in reanalysis).

**2:30 – Pump planning (50 s).** 3 000 m³ in 6 h with 2 pumps → required Q per pump and TDH from Darcy–Weisbach. System curve with Wilo Qmax/Hmax endpoints. Candidates: *investigate / data missing / not recommended*, never "suitable". Set water type to *Atık su / fekal içerikli* — Drain TMW becomes "not recommended", Rexa PRO stays. Read the mandatory message.

**3:20 – Simulation (40 s).** "Bu varsayımla simüle et". Compare A (no pumps) / B / C (pumps + storage): peak storage, overflow volume, drain time, unmet discharge from the downstream limit. Read the disclaimer. *Üç senaryoyu kaydet*.

**4:00 – Report (30 s).** Raporlar → *Rapor oluştur*. Section badges separate verified / model / assumption / illustrative content. *PDF olarak kaydet*.

**4:30 – Citizen + admin (30 s).** Citizen form (EXIF stripped, ~100 m public rounding, consent). Admin queue: AI suggests category and possible duplicate (DEMO-R1/R2), operator decides status. Close on the assistant: ask "Hangi veriler eksik?" → answer with citations.
