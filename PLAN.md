# Sky Ring Runner — Archipelago Air Rally

## Konsep

Game penerbangan chase-view (kamera di belakang pesawat) di atas kepulauan
tropis fiktif **Coral Bay**. Pilot menerbangkan pesawat baling-baling merah
melewati cincin langit (sky rings), mengumpulkan peti suplai, menghindari
awan badai, dan mengatur bahan bakar — lima sortie (misi) dengan tujuan yang
berbeda, dari latihan sampai grand tour saat senja.

## ATM — apa yang dipelajari dari pemenang lomba game

Sumber: `~/workspace/tools/makefun/TOP-RANK-PLAYBOOK.md` (riset 10 lomba
selesai, 20 Nov 2026) + kriteria juri di `RULES.txt` lomba ini.

- **best-game-01** (19.307 peserta), juara "PEONY SKY": **7 malam, 6 shell,
  8 roh, 18 resep, 3 bos** — kaya isi, satu konsep dikerjakan tuntas.
- **threejs-fps-02** (10.406 peserta), juara "Emberline: Kilnworks": **mode
  5v5 plant-and-defuse lengkap** — mode yang terbukti seru + selesai penuh,
  bukan demo tipis.
- **Kriteria juri lomba ini** (berurutan): (1) game penerbangan lengkap yang
  TERLIHAT di screenshot — chase/cockpit view atas terrain yang dikenali,
  pesawat dalam frame, instrumen menyala, runway atau ring target di depan,
  ALT/SPD/HDG di HUD; (2) fun & kedalaman — throttle + belokan yang
  dihargai, misi dengan tujuan berbeda, fuel/damage sebagai keputusan;
  (3) feel & polish — kontrol responsif, kamera tidak melawan pilot,
  landing/crash terbaca; (4) look & orisinalitas — terrain + langit satu
  gaya, pesawat yang terlihat "dibangun"; (5) struktur — source terpisah
  per file dengan satu tugas yang jelas, nama file/fungsi deskriptif.

### Yang ditiru (Tiru)

- Satu mode inti yang dalam, bukan banyak mode setengah jadi: **ring-run**
  (terbang melewati cincin) sebagai inti, diperkaya misi, bahan bakar,
  dan bahaya — seperti PEONY SKY yang memperdalam satu konsep.
- Screenshot sebagai bukti utama: 4 screenshot staged deterministik dari
  kode game sendiri (`?shot=` + autopilot), seperti pola starter kit.
- Source dipecah per tugas (config/random/input/audio/world/terrain/
  render/shots/main) supaya outline dossier terbaca juri.

### Yang dimodifikasi (Modifikasi — lebih dalam dari pemenang)

- **5 sortie dengan tujuan berbeda**, bukan satu level berulang:
  1. First Flight (8 ring, belajar),
  2. Island Hop (10 ring + 6 peti suplai),
  3. Storm Front (12 ring + 12 awan badai),
  4. Sunset Relay (14 ring, batas waktu 75 detik),
  5. Archipelago Grand Tour (16 ring + 8 peti + badai, batas 120 detik).
- **Keputusan bahan bakar**: throttle penuh + boost boros; ring hijau
  (refuel) mengisi +25; tank kosong = mesin mati, pesawat meluncur turun.
- **Sistem skor berlapis**: ring 100 + bonus streak (s.d. +100), PERFECT
  (tembus tengah ring) +50, peti +50, bonus waktu & sisa bahan bakar,
  bintang 1–3 per sortie; progres & skor terbaik tersimpan lokal.
- **5 palet langit** (siang, fajar, badai, senja, senja akhir) — satu gaya
  lukis per sortie: laut berkilau, pegunungan parallax, pulau berpantai,
  mercusuar, landasan "CORAL BAY 09" di pulau awal.
- **Suara disintesis WebAudio** (dengung mesin ikut throttle, deru angin,
  lonceng ring, alarm bahan bakar, fanfare) — tanpa file audio sama sekali.

## Fitur utama

- Kontrol: ← → ↑ ↓ / WASD (belok + naik/turun), mouse (stick), Shift
  throttle naik, Ctrl throttle turun, Space boost, P pause, R restart,
  M mute, Enter mulai, 1–5 pilih sortie, klik untuk mulai.
- HUD lengkap: kompas + HDG, AIRSPEED (KT), ALTITUDE (FT), VERT SPD,
  throttle, FUEL, HULL (3), horizon buatan (artificial horizon), jarak
  ring berikutnya, streak, skor, timer misi, peringatan LOW FUEL/TERRAIN.
- Layar: judul (pilih sortie) → briefing → main → pause → sortie selesai
  (bintang + rincian skor) / game over (penyebab crash) → victory setelah
  sortie ke-5. Layar judul/briefing terbang di atas langit yang hidup.
- Pesawat: baling-baling merah-putih digambar prosedural (sayap, ekor,
  kanopi kaca, lampu navigasi merah/hijau + strobo, bayangan di laut),
  banking mengikuti stick, guncangan saat kena badai.
- Tanpa aset luar: semua grafis digambar di canvas, semua suara disintesis;
  nol network request (kecuali favicon `data:` inline).

## Cara memainkan

1. Buka `game/index.html` lewat server statis (`node serve.ts` →
   http://localhost:8080). Pilih sortie (1–5), Enter.
2. Terbang melewati cincin emas (tengahnya = PERFECT +50). Cincin hijau
   mengisi bahan bakar. Peti kayu +50. Hindari awan badai gelap (3 kena =
   jatuh). Jangan terbang di bawah 150 ft terlalu lama (TERRAIN!).
3. Selesaikan semua ring sebelum waktu habis (sortie 4–5) untuk bintang 3.

## Pengujian

- **Simulasi Node** (`/tmp/flight-test.mjs`, world.js murni logika):
  autopilot menyelesaikan ke-5 misi pada seed 7 & 42 (skor 2.615–6.080,
  26–53 detik/misi); uji reset() memastikan ganti misi membangun course
  yang benar (8/10/12/14/16 ring). Idle 50 detik di layar judul: stabil.
- **Browser headless Chromium + puppeteer-core**: tanpa console error /
  pageerror / request gagal (setelah perbaikan impor). Alur nyata dengan
  keyboard: title → brief → play → complete (misi 1: skor 2.620, 8/8 ring,
  3 bintang, bahan bakar 63,9). Enter di layar selesai → briefing misi
  berikutnya; P pause/resume.
- **Screenshot**: 4 file JPEG 1280×720 (49–77 KB, di bawah batas 256 KB),
  diperiksa visual: cover (judul + pesawat + ring + pulau), play (HUD
  lengkap + ring di depan + streak), storm (ring + awan badai + petir),
  end (SORTIE COMPLETE + 3 bintang).
- **main.ts**: dua run menghasilkan `dossier.json` identik byte-per-byte;
  game/ 10 file, 71 KB; tidak ada URL http(s) di kode game.

## Bug yang ditemukan & diperbaiki

1. `render.js` mengimpor `CLOUD/CRATE/RING/VIEW_DEPTH` dari `world.js`
   padahal di `config.js` → pageerror, game tidak jalan. Diperbaiki.
2. `buildCourse()` memakai closure `mission` dari konstruksi, bukan
   `state.mission` → `reset()` ke misi 2+ membangun course misi 1 (8 ring)
   sehingga misi tidak pernah selesai (HUD bilang 10 ring). Diperbaiki:
   course dibaca dari `state.mission`. Ini bug kritis yang hanya ketahuan
   dari screenshot play (tidak ada ring) + dump state.
3. `climbSpeed` 150 ft/detik terlalu lambat untuk perbedaan ketinggian
   antar-ring → naik ke 900; ketinggian ring dibuat random-walk (±1200 ft
   dari ring sebelumnya) supaya selalu terjangkau.
4. Pulau & awan terlalu besar saat dekat kamera → radius/lift dikurangi,
   awan dekat di-cull/di-cap.

## Bug tersisa / catatan

- Tidak ada: tidak ditemukan bug tersisa pada pengujian di atas.
- Keterbatasan yang disadari: tidak ada pendaratan sungguhan (landing
  diganti ring terakhir di atas runway — "TOUCHDOWN" berupa penyelesaian
  misi); musuh berupa awan badai, bukan pesawat lawan; suara butuh gestur
  pengguna dulu (aturan browser), jadi sunyi sampai Enter ditekan.
